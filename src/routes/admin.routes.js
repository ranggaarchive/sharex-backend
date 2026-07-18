const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const domainService = require('../services/domain.service');
const cookieService = require('../services/cookie.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.use(authenticate, requireAdmin);

// === DOMAINS ===
router.post('/domains', async (req, res, next) => {
  try {
    const domain = await domainService.createDomain(req.body);
    res.status(201).json({ success: true, data: domain });
  } catch (err) {
    next(err);
  }
});

router.put('/domains/:id', async (req, res, next) => {
  try {
    const domain = await domainService.updateDomain(req.params.id, req.body);
    res.json({ success: true, data: domain });
  } catch (err) {
    next(err);
  }
});

router.delete('/domains/:id', async (req, res, next) => {
  try {
    await domainService.deleteDomain(req.params.id);
    res.json({ success: true, message: 'Domain deleted' });
  } catch (err) {
    next(err);
  }
});

// === ACCOUNTS ===
router.post('/accounts', async (req, res, next) => {
  try {
    const account = await cookieService.createAccount(req.body);
    res.status(201).json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

router.put('/accounts/:id', async (req, res, next) => {
  try {
    const account = await cookieService.updateAccount(req.params.id, req.body);
    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

router.delete('/accounts/:id', async (req, res, next) => {
  try {
    await cookieService.deleteAccount(req.params.id);
    res.json({ success: true, message: 'Account deleted' });
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
