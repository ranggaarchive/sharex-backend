/**
 * Generate ECDH P-256 keypair for envelope encryption.
 * 
 * Run once: node scripts/generate-envelope-keys.js
 * 
 * Output:
 *   - Server private key (base64) → put in .env as ENVELOPE_SERVER_PRIVATE_KEY
 *   - Server public key (base64)  → hardcode in extension's utils/envelope.js
 */

const crypto = require('crypto');

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const privateKeyB64 = ecdh.getPrivateKey('base64');
const publicKeyB64 = ecdh.getPublicKey('base64');

console.log('=== ECDH P-256 Keypair for Envelope Encryption ===\n');

console.log('SERVER PRIVATE KEY (add to backend .env):');
console.log(`ENVELOPE_SERVER_PRIVATE_KEY=${privateKeyB64}\n`);

console.log('SERVER PUBLIC KEY (hardcode in extension & guard utils/envelope.js):');
console.log(`${publicKeyB64}\n`);

// Verify the keypair works
console.log('--- Verification ---');
const ecdh2 = crypto.createECDH('prime256v1');
ecdh2.setPrivateKey(Buffer.from(privateKeyB64, 'base64'));
const derivedPub = ecdh2.getPublicKey('base64');
console.log(`Public key derivable from private key: ${derivedPub === publicKeyB64 ? 'YES ✓' : 'NO ✗'}`);
console.log(`Private key length: ${ecdh.getPrivateKey().length} bytes`);
console.log(`Public key length: ${ecdh.getPublicKey().length} bytes (uncompressed P-256)`);
