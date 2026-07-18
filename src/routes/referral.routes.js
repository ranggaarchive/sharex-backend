const express = require('express');
const { authenticate } = require('../middleware/auth');
const referralService = require('../services/referral.service');

const router = express.Router();

router.use(authenticate);

// GET /api/referral
router.get('/', async (req, res, next) => {
  try {
    const data = await referralService.getReferralData(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/referral/withdraw
router.post('/withdraw', async (req, res, next) => {
  try {
    const result = await referralService.requestWithdrawal(req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
