const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { requireEnvelope } = require('../middleware/envelope');

// All domain routes require envelope encryption (extension-only access)
router.use(requireEnvelope);

router.get('/', authenticate, async (req, res, next) => {
  try {
    const userPlan = req.user.plan;
    // Fetch all accounts that are healthy and match user plan
    const accounts = await prisma.account.findMany({
      where: {
        cookieHealth: 'HEALTHY',
        requiredPlan: {
          in: userPlan === 'PHANTOM' ? ['FREE', 'PHANTOM'] : ['FREE']
        }
      }
    });

    const domainsMap = {};

    accounts.forEach(acc => {
      // Group accounts by base name (e.g., "Apple Music 2" -> "Apple Music")
      const baseName = acc.name.replace(/\s*\d+$/, '').trim();
      const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      if (!domainsMap[slug]) {
        domainsMap[slug] = {
          name: baseName,
          slug: slug,
          iconUrl: acc.iconUrl,
          availableAccounts: 0
        };
      }
      domainsMap[slug].availableAccounts++;
    });

    res.json({ success: true, data: Object.values(domainsMap) });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/accounts', authenticate, async (req, res, next) => {
  try {
    const userPlan = req.user.plan;
    const { slug } = req.params;

    const allAccounts = await prisma.account.findMany({
      where: {
        cookieHealth: 'HEALTHY',
        requiredPlan: {
          in: userPlan === 'PHANTOM' ? ['FREE', 'PHANTOM'] : ['FREE']
        }
      }
    });

    const matchingAccounts = allAccounts.filter(acc => {
      const baseName = acc.name.replace(/\s*\d+$/, '').trim();
      const accSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return accSlug === slug;
    });

    // Format for popup
    const formatted = matchingAccounts.map((acc, index) => ({
      id: acc.id,
      label: `Account ${index + 1}`,
      isAvailable: true,
      health: acc.cookieHealth
    }));

    res.json({ success: true, data: { accounts: formatted } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
