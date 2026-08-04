const express = require('express');
const cookieService = require('../services/cookie.service');
const { authenticate } = require('../middleware/auth');
const { requireEnvelope } = require('../middleware/envelope');
const { cookieLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// All cookie routes require envelope encryption (extension-only access)
router.use(requireEnvelope);

// POST /api/cookies/request
router.post('/request', authenticate, cookieLimiter, async (req, res, next) => {
  try {
    const { accountId } = req.body;
    req._logContext = {
      _enrichedBody: {
        action: 'cookie_request',
        account_id: accountId,
        user_plan: req.user.plan,
      }
    };
    const result = await cookieService.requestCookies(req.user.id, accountId);
    res._logContext = {
      session_id: result.sessionId,
      account_id: accountId,
      expires_at: result.expiresAt,
    };
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
