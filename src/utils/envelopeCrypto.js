/**
 * Envelope Encryption Crypto Utilities
 * 
 * Implements ECDH key exchange + AES-256-GCM + HMAC-SHA256 envelope protocol.
 * Every request/response between the extension and backend is wrapped in an
 * encrypted binary envelope that looks like random garbage to observers.
 * 
 * Wire format (request, client → server):
 *   [1 byte version] [65 bytes ephemeral ECDH pub key] [12 bytes IV] [N+16 bytes ciphertext+GCM tag] [32 bytes HMAC]
 * 
 * Wire format (response, server → client):
 *   [1 byte version] [12 bytes IV] [N+16 bytes ciphertext+GCM tag] [32 bytes HMAC]
 */

const crypto = require('crypto');
const config = require('../config/env');
const logger = require('./logger');

// Protocol constants — MUST match extension's utils/envelope.js
const ENVELOPE_VERSION = 0x01;
const HKDF_SALT = 'kitagih-envelope-v1';
const AES_INFO = 'aes-gcm-key';
const HMAC_INFO = 'hmac-sha256-key';
const TIMESTAMP_TOLERANCE_MS = 60_000; // ±60 seconds
const NONCE_TTL_MS = 120_000; // 2 minutes

// ============================================
// ECDH KEY MANAGEMENT
// ============================================

let _serverECDH = null;

function getServerECDH() {
  if (!_serverECDH) {
    const privateKeyB64 = config.envelope.serverPrivateKey;
    if (!privateKeyB64) {
      throw new Error('ENVELOPE_SERVER_PRIVATE_KEY is not configured');
    }
    _serverECDH = crypto.createECDH('prime256v1');
    _serverECDH.setPrivateKey(Buffer.from(privateKeyB64, 'base64'));
  }
  return _serverECDH;
}

function getServerPublicKeyB64() {
  return getServerECDH().getPublicKey('base64');
}

// ============================================
// KEY DERIVATION
// ============================================

function deriveSessionKeys(sharedSecret) {
  const aesKey = Buffer.from(
    crypto.hkdfSync('sha256', sharedSecret, HKDF_SALT, AES_INFO, 32)
  );
  const hmacKey = Buffer.from(
    crypto.hkdfSync('sha256', sharedSecret, HKDF_SALT, HMAC_INFO, 32)
  );
  return { aesKey, hmacKey };
}

// ============================================
// NONCE CACHE (replay protection)
// ============================================

const nonceCache = new Map();
let lastCleanup = Date.now();

function isNonceValid(nonce) {
  if (!nonce) return false;
  if (nonceCache.has(nonce)) return false;

  nonceCache.set(nonce, Date.now());

  // Periodic cleanup (every 1000 inserts or 60 seconds)
  const now = Date.now();
  if (nonceCache.size > 5000 || now - lastCleanup > 60_000) {
    for (const [key, timestamp] of nonceCache) {
      if (now - timestamp > NONCE_TTL_MS) {
        nonceCache.delete(key);
      }
    }
    lastCleanup = now;
  }

  return true;
}

// ============================================
// UNSEAL INCOMING ENVELOPE (client → server)
// ============================================

/**
 * Decrypt and verify an incoming request envelope.
 * 
 * @param {Buffer} envelope - Raw binary envelope
 * @returns {{ payload: object, sessionKeys: { aesKey: Buffer, hmacKey: Buffer } }}
 * @throws {Error} on any verification or decryption failure
 */
function unsealEnvelope(envelope) {
  // Minimum: version(1) + pubkey(65) + iv(12) + min_ciphertext(1) + gcm_tag(16) + hmac(32) = 127
  if (!Buffer.isBuffer(envelope) || envelope.length < 127) {
    throw new Error('Envelope too short or not a buffer');
  }

  // Version check
  const version = envelope[0];
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unknown envelope version: ${version}`);
  }

  // Extract components
  const clientPubKey = envelope.slice(1, 66);          // 65 bytes
  const hmacReceived = envelope.slice(envelope.length - 32); // last 32 bytes
  const envelopeBody = envelope.slice(0, envelope.length - 32); // everything before HMAC
  const iv = envelope.slice(66, 78);                   // 12 bytes
  const encryptedWithTag = envelope.slice(78, envelope.length - 32); // ciphertext + GCM tag

  // Derive shared secret via ECDH
  const ecdh = getServerECDH();
  let sharedSecret;
  try {
    sharedSecret = ecdh.computeSecret(clientPubKey);
  } catch (e) {
    throw new Error('Invalid client public key');
  }

  // Derive session keys
  const { aesKey, hmacKey } = deriveSessionKeys(sharedSecret);

  // Verify HMAC (timing-safe comparison)
  const expectedHmac = crypto.createHmac('sha256', hmacKey)
    .update(envelopeBody)
    .digest();

  if (!crypto.timingSafeEqual(expectedHmac, hmacReceived)) {
    throw new Error('HMAC verification failed');
  }

  // Decrypt AES-256-GCM
  // Web Crypto appends the 16-byte auth tag to the ciphertext
  if (encryptedWithTag.length < 17) {
    throw new Error('Ciphertext too short');
  }
  const authTag = encryptedWithTag.slice(encryptedWithTag.length - 16);
  const ciphertext = encryptedWithTag.slice(0, encryptedWithTag.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, null, 'utf8');
  decrypted += decipher.final('utf8');

  // Parse inner payload
  let payload;
  try {
    payload = JSON.parse(decrypted);
  } catch (e) {
    throw new Error('Decrypted payload is not valid JSON');
  }

  // Validate timestamp
  if (!payload.timestamp || typeof payload.timestamp !== 'number') {
    throw new Error('Missing or invalid timestamp');
  }
  const timeDiff = Math.abs(Date.now() - payload.timestamp);
  if (timeDiff > TIMESTAMP_TOLERANCE_MS) {
    throw new Error(`Timestamp expired (drift: ${timeDiff}ms)`);
  }

  // Validate nonce
  if (!isNonceValid(payload.nonce)) {
    throw new Error('Nonce missing or already used');
  }

  return { payload, sessionKeys: { aesKey, hmacKey } };
}

// ============================================
// SEAL OUTGOING RESPONSE (server → client)
// ============================================

/**
 * Encrypt a response into an envelope.
 * 
 * @param {string} jsonString - JSON string to encrypt
 * @param {{ aesKey: Buffer, hmacKey: Buffer }} sessionKeys - Keys from the request
 * @returns {Buffer} Encrypted response envelope
 */
function sealResponse(jsonString, sessionKeys) {
  const { aesKey, hmacKey } = sessionKeys;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

  let encrypted = cipher.update(jsonString, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Build: [version(1)] [iv(12)] [ciphertext + authTag]
  const encryptedWithTag = Buffer.concat([encrypted, authTag]);
  const envelopeBody = Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    iv,
    encryptedWithTag
  ]);

  // Compute HMAC over the body
  const hmac = crypto.createHmac('sha256', hmacKey)
    .update(envelopeBody)
    .digest();

  // Final: [envelopeBody] [hmac(32)]
  return Buffer.concat([envelopeBody, hmac]);
}

module.exports = {
  unsealEnvelope,
  sealResponse,
  getServerPublicKeyB64,
  ENVELOPE_VERSION,
};
