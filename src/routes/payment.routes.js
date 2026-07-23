'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const paymentService = require('../services/payment.service');
const { authenticate } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// GET /api/payment/prices
// Return harga semua plan, sudah dipotong diskon 25% jika user
// mendaftar via referral orang lain.
// ─────────────────────────────────────────────────────────────────
router.get('/prices', authenticate, async (req, res, next) => {
  try {
    const result = await paymentService.getPricesForUser(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/payment/checkout
// Buat transaksi QRIS baru dengan nominal unik per user.
// Body: { durationDays: 1 | 7 | 30 }
// Response: { transactionId, amount, qrisString, qrisImageBase64,
//             hasDiscount, discountPercent, expiresAt }
// ─────────────────────────────────────────────────────────────────
router.post('/checkout', authenticate, async (req, res, next) => {
  try {
    const { durationDays } = req.body;
    const parsedDays = parseInt(durationDays, 10);

    if (![1, 7, 30].includes(parsedDays)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid durationDays. Allowed values: 1, 7, 30',
      });
    }

    const result = await paymentService.createQrisTransaction(req.user.id, parsedDays);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/payment/status/:transactionId
// Cek status transaksi milik user yang sedang login.
// ─────────────────────────────────────────────────────────────────
router.get('/status/:transactionId', authenticate, async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      select: {
        id:           true,
        plan:         true,
        durationDays: true,
        amount:       true,
        baseAmount:   true,
        hasDiscount:  true,
        status:       true,
        paymentMethod:true,
        createdAt:    true,
        updatedAt:    true,
      },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/payment/confirm
// Dipanggil oleh software eksternal (pembaca mutasi rekening).
// Mencari transaksi PENDING berdasarkan nominal, lalu mengaktifkan
// plan user dan memberikan komisi ke referrer.
//
// Body: { amount: number, secret: string }
// Header tidak diperlukan auth JWT — diamankan dengan secret key.
// ─────────────────────────────────────────────────────────────────
router.post('/confirm', async (req, res, next) => {
  try {
    const { amount, secret } = req.body;

    // Validasi secret key
    const CONFIRM_SECRET = process.env.QRIS_CONFIRM_SECRET;
    if (!CONFIRM_SECRET || secret !== CONFIRM_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: invalid secret',
      });
    }

    // Validasi amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount',
      });
    }

    const result = await paymentService.confirmPaymentByAmount(amount);

    if (result.alreadyProcessed) {
      return res.json({
        success: true,
        message: 'Transaction was already processed',
        data: { transactionId: result.transactionId },
      });
    }

    console.log(`[QRIS Confirm] Transaksi berhasil: ${result.transactionId} | User: ${result.userId} | Plan: ${result.plan} ${result.durationDays}d | Amount: ${amount}`);

    res.json({
      success: true,
      message: 'Payment confirmed and plan activated',
      data: result,
    });
  } catch (err) {
    // Jika transaksi tidak ditemukan, return 404 agar software tahu
    if (err.message && err.message.startsWith('No PENDING transaction')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
});

module.exports = router;
