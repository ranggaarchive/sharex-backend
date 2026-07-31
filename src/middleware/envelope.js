/**
 * Envelope Middleware for Express
 * 
 * Intercepts requests with the X-Envelope header, decrypts the binary envelope,
 * and replaces req.body / req.headers with the decrypted inner payload.
 * Also monkey-patches res.json() to encrypt the response back into an envelope.
 * 
 * Non-envelope requests pass through untouched.
 */

const { unsealEnvelope, sealResponse } = require('../utils/envelopeCrypto');
const logger = require('../utils/logger');

/**
 * Global envelope middleware. Mount this BEFORE route handlers.
 * 
 * If the request has `X-Envelope: v1`, it:
 *   1. Parses the raw binary body
 *   2. Verifies HMAC + decrypts via ECDH + AES-256-GCM
 *   3. Validates timestamp and nonce (replay protection)
 *   4. Replaces req.body with the decrypted JSON body
 *   5. Restores Authorization and X-Device-Id headers from inner payload
 *   6. Restores req.method if the inner payload specifies a different method
 *   7. Monkey-patches res.json() to encrypt the response
 *   8. Sets req.envelopeVerified = true
 */
function envelopeMiddleware(req, res, next) {
  // Only process requests with the envelope header
  const envelopeHeader = req.headers['x-envelope'];
  if (!envelopeHeader || envelopeHeader !== 'v1') {
    return next();
  }

  try {
    // req.body should be a Buffer (parsed by express.raw())
    if (!Buffer.isBuffer(req.body)) {
      logger.warn('Envelope request body is not a Buffer — was express.raw() configured?');
      return res.status(400).end();
    }

    // Decrypt and verify
    const { payload, sessionKeys } = unsealEnvelope(req.body);

    // Restore inner headers onto the request
    if (payload.headers) {
      if (payload.headers.authorization) {
        req.headers['authorization'] = payload.headers.authorization;
      }
      if (payload.headers['x-device-id']) {
        req.headers['x-device-id'] = payload.headers['x-device-id'];
      }
    }

    // Restore method (for GET-as-POST requests)
    if (payload.method && payload.method !== req.method) {
      req.method = payload.method.toUpperCase();
    }

    // Replace body with decrypted inner body
    req.body = payload.body || {};

    // Mark as envelope-verified
    req.envelopeVerified = true;

    // Monkey-patch res.json() to encrypt the response
    const originalJson = res.json.bind(res);
    res.json = function envelopeJson(data) {
      try {
        const jsonString = JSON.stringify(data);
        const responseBuffer = sealResponse(jsonString, sessionKeys);
        res.set('Content-Type', 'application/octet-stream');
        res.set('X-Envelope', 'v1');
        return res.send(responseBuffer);
      } catch (encryptErr) {
        logger.error('Failed to encrypt response envelope:', encryptErr);
        return res.status(500).end();
      }
    };

    next();
  } catch (err) {
    // Log the failure reason for debugging but return a generic error to the client
    logger.warn(`Envelope processing failed: ${err.message}`);
    return res.status(400).end();
  }
}

/**
 * Route-level middleware that REQUIRES requests to be envelope-verified.
 * Apply this to routes that should only be accessible from the extension.
 * 
 * Usage:
 *   router.post('/request', requireEnvelope, authenticate, handler);
 *   // or apply to all routes:
 *   router.use(requireEnvelope);
 */
function requireEnvelope(req, res, next) {
  if (!req.envelopeVerified) {
    return res.status(403).end();
  }
  next();
}

module.exports = { envelopeMiddleware, requireEnvelope };
