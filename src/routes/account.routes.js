const express = require('express');
const router = express.Router();
const accountService = require('../services/account.service');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/accounts
 * List all active accounts based on user plan
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userPlan = req.user.plan;
    const accounts = await accountService.listAccounts(userPlan);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
