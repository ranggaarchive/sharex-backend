const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const accountService = require('../services/account.service');
const cookieService = require('../services/cookie.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.use(authenticate, requireAdmin);

// === ACCOUNTS ===
router.post('/accounts/sync', async (req, res, next) => {
  try {
    const result = await accountService.syncAccountsFromGroupy();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/accounts/:id', async (req, res, next) => {
  try {
    const account = await accountService.updateAccount(req.params.id, req.body);
    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

router.get('/accounts/:id/fetch-groupy', async (req, res, next) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!account || !account.groupyId) {
      return res.status(404).json({ success: false, message: 'Account or Groupy ID not found' });
    }
    const response = await fetch(`${process.env.GROUPY_API_URL || 'http://195.88.211.169:1337'}/service/${account.groupyId}?token=${process.env.GROUPY_TOKEN || '22c3abb70e2244a874bbcac4f1b1d6b03f69d7f5dd766c01608c0f582eb87acd'}`);
    const data = await response.json();
    res.json({ success: true, data: data.message });
  } catch (err) {
    next(err);
  }
});

// === USERS ===
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, plan: true, role: true, isActive: true, createdAt: true },
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

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
