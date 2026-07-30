const express = require('express');
const router = express.Router();
const accountService = require('../services/account.service');
const { requireAuth } = require('../middlewares/auth');

/**
 * GET /api/accounts
 * List all active accounts based on user plan
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userPlan = req.user.plan;
    const accounts = await accountService.listAccounts(userPlan);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
