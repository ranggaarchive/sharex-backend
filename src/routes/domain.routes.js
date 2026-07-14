const express = require('express');
const domainService = require('../services/domain.service');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/domains
router.get('/', authenticate, async (req, res, next) => {
  try {
    const domains = await domainService.listDomains(req.user.plan);
    res.json({ success: true, data: domains });
  } catch (err) {
    next(err);
  }
});

// GET /api/domains/:slug/accounts
router.get('/:slug/accounts', authenticate, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await domainService.listAccounts(slug, req.user.plan);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
