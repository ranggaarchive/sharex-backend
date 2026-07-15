const express = require('express');
const guardService = require('../services/guard.service');

const router = express.Router();

// POST /api/guard/heartbeat
// Guard extension hits this every 5 minutes to prove it's alive and untampered
router.post('/heartbeat', async (req, res, next) => {
  try {
    const { extensionId, fingerprint } = req.body;
    
    // In a real app, verify the request came from your actual extension
    // e.g. checking origin, checking a secret signed by the extension
    
    await guardService.recordHeartbeat({ extensionId, fingerprint });
    const protectedDomains = await guardService.getProtectedDomains();
    res.json({ success: true, protectedDomains });
  } catch (err) {
    next(err);
  }
});

// POST /api/guard/verify
// Main extension hits this or backend checks internally
router.post('/verify', async (req, res, next) => {
  try {
    const { extensionId } = req.body;
    const result = await guardService.verifyGuard(extensionId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
