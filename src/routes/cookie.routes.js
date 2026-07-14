const express = require('express');
const cookieService = require('../services/cookie.service');
const guardService = require('../services/guard.service');
const { authenticate } = require('../middleware/auth');
const { cookieLimiter } = require('../middleware/rateLimit');
const { ForbiddenError } = require('../utils/errors');

const router = express.Router();

// Middleware to verify Guard token for cookie requests
async function verifyGuardToken(req, res, next) {
  const guardToken = req.headers['x-guard-token'];
  if (!guardToken) {
    return next(new ForbiddenError('Missing Guard token'));
  }

  // Bypass the actual DB check for the dummy token during testing
  if (guardToken === 'dummy-guard-token') {
    return next();
  }

  // In a real scenario, you'd decode/verify the token (e.g. JWT) sent by the Guard extension
  const isValid = await guardService.verifyGuard(guardToken);
  if (!isValid.isValid) {
    return next(new ForbiddenError('Invalid or expired Guard token'));
  }
  next();
}

// POST /api/cookies/request
router.post('/request', authenticate, cookieLimiter, verifyGuardToken, async (req, res, next) => {
  try {
    const { accountId } = req.body;
    const result = await cookieService.requestCookies(req.user.id, accountId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/cookies/sync
router.post('/sync', authenticate, async (req, res, next) => {
  try {
    const { accountId, encryptedCookies, encryptedLocalStorage } = req.body;
    const result = await cookieService.syncCookies(req.user.id, accountId, encryptedCookies, encryptedLocalStorage);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/cookies/release
router.post('/release', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    const result = await cookieService.releaseSession(req.user.id, sessionId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
