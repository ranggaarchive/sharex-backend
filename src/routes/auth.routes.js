const express = require('express');
const authService = require('../services/auth.service');
const { authenticate } = require('../middleware/auth');
const { requireEnvelope } = require('../middleware/envelope');

const router = express.Router();

// GET /api/auth/version
router.get('/version', (req, res) => {
  res.json({
    success: true,
    data: {
      minRequiredVersion: "2.7",
      latestVersion: "2.7",
      downloadUrl: "https://kitagih.com/tutorial"
    }
  });
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-license
router.post('/verify-license', authenticate, async (req, res, next) => {
  try {
    const { licenseKey } = req.body;
    const user = await authService.verifyLicense(req.user.id, licenseKey);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/log-event
router.post('/log-event', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const jwt = require('jsonwebtoken');
      const config = require('../config/env');
      req.user = jwt.verify(token, config.jwt.secret, { ignoreExpiration: true });
    } catch(err) {
      // Silently fail authentication for logging if token is completely invalid
    }
  }
  res.json({ success: true, message: 'Event logged successfully', user: req.user });
});

module.exports = router;
