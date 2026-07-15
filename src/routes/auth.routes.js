const express = require('express');
const authService = require('../services/auth.service');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/auth/version
router.get('/version', (req, res) => {
  res.json({
    success: true,
    data: {
      minRequiredVersion: "1.1",
      latestVersion: "1.1",
      downloadUrl: "https://sharex-user.vercel.app/tutorial"
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

module.exports = router;
