const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const accountService = require('../services/account.service');
const cookieService = require('../services/cookie.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.use(authenticate, requireAdmin);

// === SSO ===
router.get('/logger/sso', async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const secret = process.env.LOGGER_SSO_SECRET || '8f43b67ea19253dcd9b6e3f40215a78c93de5f6a291b8d7c6b5a4f3e2d1c0b9a';
    const payloadObj = { exp: Math.floor(Date.now() / 1000) + 60, user: req.user.id };
    
    const base64url = (str) => Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    
    const payload = base64url(JSON.stringify(payloadObj));
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `${payload}.${signature}`;
    
    res.json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
});

// === ACCOUNTS ===
router.post('/accounts/sync', async (req, res, next) => {
  try {
    const manualToken = req.headers['x-groupy-token'];
    const result = await accountService.syncAccountsFromGroupy(manualToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/accounts/:id', async (req, res, next) => {
  try {
    const account = await accountService.updateAccount(req.params.id, req.body);
    res._logContext = {
      action: 'admin_update_account',
      target_entity_type: 'account',
      target_entity_id: req.params.id,
      action_type: 'update'
    };
    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

router.get('/accounts/groupy/:id', async (req, res, next) => {
  try {
    const account = await prisma.account.findUnique({
      where: { groupyId: String(req.params.id) },
    });
    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

router.post('/accounts/groupy/:id/sync', async (req, res, next) => {
  try {
    const groupyId = String(req.params.id);
    const { name, category, logo } = req.body;
    
    const categoryMap = {
      'streaming': 'STREAMING',
      'productivity': 'PRODUCTIVITY',
      'education': 'EDUCATION',
      'design': 'DESIGN',
      'music': 'MUSIC',
      'utilities': 'UTILITIES',
    };
    const mappedCategory = categoryMap[category?.toLowerCase()] || 'STREAMING';

    const account = await prisma.account.upsert({
      where: { groupyId },
      update: {
        name,
        iconUrl: logo,
        category: mappedCategory,
      },
      create: {
        groupyId,
        name,
        iconUrl: logo,
        category: mappedCategory,
        requiredPlan: 'FREE',
        cookieHealth: 'UNKNOWN',
        loginMethod: 'INJECT',
        maxConcurrent: 1,
      }
    });

    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

router.get('/groupy-services', async (req, res, next) => {
  try {
    const manualToken = req.headers['x-groupy-token'];
    const tokenToUse = manualToken || process.env.GROUPY_TOKEN || '22c3abb70e2244a874bbcac4f1b1d6b03f69d7f5dd766c01608c0f582eb87acd';
    const updateCache = req.query.update_cache === 'true' || req.query.force === 'true';
    const queryParams = new URLSearchParams({ token: tokenToUse });
    if (updateCache) {
      queryParams.append('update_cache', 'true');
    }

    const response = await fetch(`${process.env.GROUPY_API_URL || 'http://195.88.211.169:1337'}/services?${queryParams.toString()}`);
    const data = await response.json();
    const groupyServices = data.message || [];
    
    const localAccounts = await prisma.account.findMany({
      select: {
        id: true,
        groupyId: true,
        cookies: true,
        cookieHealth: true,
        url: true,
        loginMethod: true,
        updatedAt: true,
      }
    });
    
    const localMap = {};
    for (const acc of localAccounts) {
      if (acc.groupyId) {
        localMap[acc.groupyId] = {
          dbId: acc.id,
          inDb: true,
          hasCookies: !!(acc.cookies && (!Array.isArray(acc.cookies) || acc.cookies.length > 0)),
          cookieHealth: acc.cookieHealth,
          url: acc.url,
          loginMethod: acc.loginMethod,
          updatedAt: acc.updatedAt,
        };
      }
    }
    
    const mergedServices = groupyServices.map(service => {
      const dbInfo = localMap[service.id];
      return {
        ...service,
        inDb: dbInfo ? true : false,
        cookies: dbInfo ? dbInfo.hasCookies : false,
        cookieHealth: dbInfo ? dbInfo.cookieHealth : null,
        url: dbInfo ? dbInfo.url : (service.url || ''),
        dbUpdatedAt: dbInfo ? dbInfo.updatedAt : null,
        loginMethod: dbInfo ? dbInfo.loginMethod : null,
        dbId: dbInfo ? dbInfo.dbId : null,
      };
    });
    
    res.json({ success: true, data: mergedServices, cacheUpdated: updateCache });
  } catch (err) {
    next(err);
  }
});

router.get('/groupy-services/:id', async (req, res, next) => {
  try {
    const manualToken = req.headers['x-groupy-token'];
    const tokenToUse = manualToken || process.env.GROUPY_TOKEN || '22c3abb70e2244a874bbcac4f1b1d6b03f69d7f5dd766c01608c0f582eb87acd';
    const response = await fetch(`${process.env.GROUPY_API_URL || 'http://195.88.211.169:1337'}/service/${req.params.id}?token=${tokenToUse}`);
    const data = await response.json();
    res.json({ success: true, data: data.message });
  } catch (err) {
    next(err);
  }
});

router.post('/groupy-services/:id/save', async (req, res, next) => {
  try {
    const groupyId = String(req.params.id);
    const { name, category, logo, url, cookies } = req.body;
    
    // Map category
    const categoryMap = {
      'streaming': 'STREAMING',
      'productivity': 'PRODUCTIVITY',
      'education': 'EDUCATION',
      'design': 'DESIGN',
      'music': 'MUSIC',
      'utilities': 'UTILITIES',
    };
    const mappedCategory = categoryMap[category?.toLowerCase()] || 'STREAMING';
    const cookieHealth = cookies ? 'HEALTHY' : 'UNKNOWN';
    
    let finalUrl = url;
    let loginMethod = 'INJECT';
    let loginEmail = null;
    let loginPassword = null;

    if (url && url.includes('groupy.id/manual')) {
      try {
        const parsedUrl = new URL(url);
        loginEmail = parsedUrl.searchParams.get('login');
        loginPassword = parsedUrl.searchParams.get('password');
        const targetUrl = parsedUrl.searchParams.get('url');
        if (targetUrl) finalUrl = targetUrl;
        if (loginEmail && loginPassword) {
          loginMethod = 'MANUAL';
        }
      } catch (e) {
        console.error('Error parsing manual url', e);
      }
    }

    const account = await prisma.account.upsert({
      where: { groupyId },
      update: {
        name,
        iconUrl: logo,
        category: mappedCategory,
        url: finalUrl,
        cookies,
        cookieHealth,
        lastHealthCheck: new Date(),
        loginMethod,
        loginEmail,
        loginPassword
      },
      create: {
        groupyId,
        name,
        iconUrl: logo,
        category: mappedCategory,
        url: finalUrl,
        cookies,
        cookieHealth,
        lastHealthCheck: new Date(),
        requiredPlan: 'PHANTOM',
        loginMethod,
        loginEmail,
        loginPassword,
        maxConcurrent: 1000,
      }
    });
    
    res._logContext = {
      action: 'admin_save_groupy_service',
      target_entity_type: 'account',
      target_entity_id: account.id,
      action_type: 'upsert'
    };
    
    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

router.delete('/groupy-services/:id', async (req, res, next) => {
  try {
    const groupyId = String(req.params.id);
    const existing = await prisma.account.findUnique({
      where: { groupyId }
    });
    
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Account not found in database' });
    }
    
    await prisma.account.delete({
      where: { groupyId }
    });
    
    res._logContext = {
      action: 'admin_delete_groupy_service',
      target_entity_type: 'account',
      target_entity_id: existing.id,
      action_type: 'delete'
    };
    
    res.json({ success: true, message: 'Account deleted from database' });
  } catch (err) {
    next(err);
  }
});

// === USERS ===
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, plan: true, role: true, isActive: true, createdAt: true, updatedAt: true, planExpiresAt: true, banWarningCount: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
      select: { id: true, email: true, plan: true, role: true, isActive: true },
    });
    res._logContext = {
      action: 'admin_update_user',
      target_entity_type: 'user',
      target_entity_id: req.params.id,
      action_type: 'update'
    };
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// === ANALYTICS ===
router.get('/analytics', async (req, res, next) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeSessions = await prisma.session.count({ where: { isActive: true } });
    const healthyCookies = await prisma.account.count({ where: { cookieHealth: 'HEALTHY' } });
    const expiredCookies = await prisma.account.count({ where: { cookieHealth: 'EXPIRED' } });
    
    res.json({
      success: true,
      data: { totalUsers, activeSessions, healthyCookies, expiredCookies }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics/profit', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const date = new Date();
    
    const targetMonth = month ? parseInt(month) : date.getMonth() + 1;
    const targetYear = year ? parseInt(year) : date.getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 1);

    const [totalUsers, subscribedUsers, profitAggr] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { plan: { not: 'FREE' } } }),
      prisma.transaction.aggregate({
        where: {
          status: 'SUCCESS',
          createdAt: {
            gte: startDate,
            lt: endDate,
          }
        },
        _sum: {
          amount: true
        }
      })
    ]);

    const profit = profitAggr._sum.amount || 0;

    res.json({
      success: true,
      data: {
        totalUsers,
        subscribedUsers,
        profit,
        month: targetMonth,
        year: targetYear
      }
    });
  } catch (err) {
    next(err);
  }
});

// === WITHDRAWALS ===
router.get('/withdrawals', async (req, res, next) => {
  try {
    const withdrawals = await prisma.withdrawal.findMany({
      include: {
        user: { select: { email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: withdrawals });
  } catch (err) {
    next(err);
  }
});

router.post('/withdrawals/:id/approve', async (req, res, next) => {
  try {
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    if (withdrawal.status !== 'PENDING') return res.status(400).json({ success: false, message: 'Only PENDING withdrawals can be approved' });

    const updated = await prisma.withdrawal.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' }
    });
    res._logContext = {
      action: 'withdrawal_approve',
      withdrawal_id: req.params.id,
      amount: withdrawal.amount,
      provider: withdrawal.provider,
      user_id: withdrawal.userId,
    };
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/withdrawals/:id/reject', async (req, res, next) => {
  try {
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    if (withdrawal.status !== 'PENDING') return res.status(400).json({ success: false, message: 'Only PENDING withdrawals can be rejected' });

    // Refund balance
    const [updated, user, tx] = await prisma.$transaction([
      prisma.withdrawal.update({
        where: { id: req.params.id },
        data: { status: 'REJECTED' }
      }),
      prisma.user.update({
        where: { id: withdrawal.userId },
        data: { balance: { increment: withdrawal.amount } }
      }),
      prisma.walletTransaction.create({
        data: {
          userId: withdrawal.userId,
          amount: withdrawal.amount,
          type: 'REFUND',
          description: `Pengembalian dana penarikan (Ditolak)`,
          referenceTxId: withdrawal.id
        }
      })
    ]);

    res._logContext = {
      action: 'withdrawal_reject',
      withdrawal_id: req.params.id,
      amount: withdrawal.amount,
      provider: withdrawal.provider,
      user_id: withdrawal.userId,
      refund_amount: withdrawal.amount,
    };

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// === TRANSACTIONS ===
router.get('/transactions', async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: {
        user: { select: { email: true } },
        promoCode: { select: { code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: transactions });
  } catch (err) {
    next(err);
  }
});

// === SESSIONS ===
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await prisma.session.findMany({
      include: {
        user: { select: { email: true } },
        account: { select: { name: true, category: true } }
      },
      orderBy: { startedAt: 'desc' }
    });
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
