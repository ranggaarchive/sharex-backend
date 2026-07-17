const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const paymentService = require('../services/payment.service');
const { authenticate } = require('../middleware/auth');

// POST /api/payment/checkout
router.post('/checkout', authenticate, async (req, res, next) => {
  try {
    const { durationDays, plan } = req.body;
    const userId = req.user.id;

    // Tentukan harga secara aman di backend
    let validAmount = 50000;
    let validDuration = 30;

    const parsedDuration = parseInt(durationDays, 10);
    if (parsedDuration === 1) {
      validAmount = 10000;
      validDuration = 1;
    } else if (parsedDuration === 7) {
      validAmount = 25000;
      validDuration = 7;
    } else if (parsedDuration === 30) {
      validAmount = 50000;
      validDuration = 30;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid duration' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Create a pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        plan: plan || 'PHANTOM',
        durationDays: validDuration,
        amount: validAmount,
        status: 'PENDING'
      }
    });

    // Create iPaymu Session
    const paymentResult = await paymentService.createPaymentSession({
      referenceId: transaction.id,
      amount: transaction.amount,
      buyerName: user.email.split('@')[0],
      buyerEmail: user.email,
    });

    if (paymentResult.success) {
      // Update transaction with sessionId and paymentUrl
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          sessionId: paymentResult.sessionId,
          paymentUrl: paymentResult.url
        }
      });

      return res.json({ success: true, url: paymentResult.url });
    } else {
      return res.status(500).json({ success: false, message: paymentResult.error });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/payment/callback
// This is called by iPaymu when payment succeeds/fails
router.post('/callback', async (req, res, next) => {
  try {
    const { status, reference_id, trx_id } = req.body;
    
    console.log("iPaymu Webhook Callback:", req.body);

    if (!reference_id) {
      return res.status(400).json({ success: false, message: 'Missing reference_id' });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: reference_id }
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Status from iPaymu: 'berhasil', 'pending', 'gagal'
    if (status && status.toLowerCase() === 'berhasil') {
      if (transaction.status !== 'SUCCESS') {
        // Update transaction status
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'SUCCESS' }
        });

        // Extend user plan
        const user = await prisma.user.findUnique({ where: { id: transaction.userId } });
        let newExpiresAt = new Date();
        if (user.planExpiresAt && user.planExpiresAt > newExpiresAt) {
          newExpiresAt = user.planExpiresAt;
        }
        newExpiresAt.setDate(newExpiresAt.getDate() + transaction.durationDays);

        await prisma.user.update({
          where: { id: transaction.userId },
          data: {
            plan: transaction.plan,
            planExpiresAt: newExpiresAt
          }
        });
      }
    } else if (status && status.toLowerCase() === 'gagal') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' }
      });
    }

    // Always return 200 OK to acknowledge receipt
    res.json({ success: true });
  } catch (err) {
    console.error("iPaymu Webhook Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
