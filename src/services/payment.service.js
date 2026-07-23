'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// QRIS statis dari .env
const QRIS_STATIC = process.env.QRIS_STATIC;

/**
 * Harga base per plan (dalam Rupiah, tanpa offset unik)
 */
const PLAN_PRICES = {
  1:  { amount: 10000, plan: 'PHANTOM', label: '1 Hari'   },
  7:  { amount: 25000, plan: 'PHANTOM', label: '7 Hari'   },
  30: { amount: 50000, plan: 'PHANTOM', label: '30 Hari'  },
};

const REFERRAL_DISCOUNT = 0.25; // 25% diskon untuk user yang punya referral

/**
 * Generate QRIS dinamis dari QRIS statis menggunakan dynamic import (ESM library)
 * @param {number} amount - nominal dalam Rupiah
 * @returns {Promise<{ qrisString: string, qrisImageBase64: string }>}
 */
async function generateDynamicQris(amount) {
  const fs = require('fs');
  const path = require('path');
  
  const qrisString = QRIS_STATIC;
  const imagePath = path.join(__dirname, '../../assets/qris.jpeg');
  const imageBuffer = await fs.promises.readFile(imagePath);
  const qrisImageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

  return { qrisString, qrisImageBase64 };
}

/**
 * Cari offset unik (1-99) yang belum terpakai di transaksi PENDING untuk base amount tertentu.
 * Unique amount = baseAmount + offset
 * @param {number} baseAmount - harga dasar setelah diskon (jika ada)
 * @returns {Promise<number>} offset 1-99 yang tersedia
 */
async function findUniqueOffset(baseAmount) {
  // Ambil semua transaksi PENDING dengan amount dalam range baseAmount+1 s/d baseAmount+99
  const pendingTxs = await prisma.transaction.findMany({
    where: {
      status: 'PENDING',
      amount: {
        gte: baseAmount + 1,
        lte: baseAmount + 99,
      },
    },
    select: { uniqueOffset: true },
  });

  const usedOffsets = new Set(pendingTxs.map(tx => tx.uniqueOffset).filter(Boolean));

  // Cari offset pertama yang tersedia dari 1-99
  for (let i = 1; i <= 99; i++) {
    if (!usedOffsets.has(i)) return i;
  }

  // Jika semua 1-99 terpakai, mulai dari 1 (force — sangat jarang terjadi)
  return 1;
}

/**
 * Buat transaksi QRIS baru untuk checkout.
 * @param {string} userId
 * @param {number} durationDays - 1, 7, atau 30
 * @returns {Promise<Object>}
 */
async function createQrisTransaction(userId, durationDays) {
  const planConfig = PLAN_PRICES[durationDays];
  if (!planConfig) {
    throw new Error('Invalid duration. Allowed: 1, 7, 30');
  }

  // Cek apakah user punya referral → dapat diskon 25%
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, referredById: true },
  });

  if (!user) throw new Error('User not found');

  const hasDiscount = Boolean(user.referredById);
  const baseAmount = hasDiscount
    ? Math.floor(planConfig.amount * (1 - REFERRAL_DISCOUNT))
    : planConfig.amount;

  // Cari offset unik
  const uniqueOffset = await findUniqueOffset(baseAmount);
  const finalAmount = baseAmount + uniqueOffset;

  // Generate QRIS dinamis
  const { qrisString, qrisImageBase64 } = await generateDynamicQris(finalAmount);

  // Buat transaksi PENDING
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      plan:         planConfig.plan,
      durationDays: durationDays,
      amount:       finalAmount,
      baseAmount:   planConfig.amount,
      uniqueOffset: uniqueOffset,
      qrisData:     qrisString,
      hasDiscount:  hasDiscount,
      status:       'PENDING',
      paymentMethod:'QRIS',
    },
  });

  // Expired dalam 24 jam
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return {
    transactionId:  transaction.id,
    amount:         finalAmount,
    baseAmount:     planConfig.amount,
    hasDiscount,
    discountPercent: hasDiscount ? 25 : 0,
    plan:           planConfig.plan,
    durationDays,
    label:          planConfig.label,
    qrisString,
    qrisImageBase64,
    expiresAt,
  };
}

/**
 * Konfirmasi pembayaran berdasarkan nominal yang diterima.
 * Dipanggil oleh software eksternal (mutasi rekening).
 * @param {number} amount - nominal yang diterima (unik per user)
 * @returns {Promise<Object>}
 */
async function confirmPaymentByAmount(amount) {
  // Cari transaksi PENDING dengan amount persis
  const transaction = await prisma.transaction.findFirst({
    where: {
      amount: amount,
      status: 'PENDING',
    },
  });

  if (!transaction) {
    throw new Error(`No PENDING transaction found with amount ${amount}`);
  }

  // Sudah SUCCESS sebelumnya? Skip
  if (transaction.status === 'SUCCESS') {
    return { alreadyProcessed: true, transactionId: transaction.id };
  }

  // Update transaksi → SUCCESS
  await prisma.transaction.update({
    where: { id: transaction.id },
    data:  { status: 'SUCCESS' },
  });

  // Extend plan user
  const user = await prisma.user.findUnique({ where: { id: transaction.userId } });
  let newExpiresAt = new Date();
  if (user.planExpiresAt && user.planExpiresAt > newExpiresAt) {
    newExpiresAt = user.planExpiresAt;
  }
  newExpiresAt.setDate(newExpiresAt.getDate() + transaction.durationDays);

  await prisma.user.update({
    where: { id: transaction.userId },
    data:  { plan: transaction.plan, planExpiresAt: newExpiresAt },
  });

  // Berikan komisi 25% dari base amount ke referrer (jika ada)
  if (user.referredById) {
    const existingCommission = await prisma.walletTransaction.findFirst({
      where: { referenceTxId: transaction.id, type: 'EARNING' },
    });

    if (!existingCommission) {
      // Komisi dihitung dari baseAmount (harga sebelum diskon)
      const baseAmt = transaction.baseAmount || transaction.amount;
      const commissionAmount = Math.floor(baseAmt * 0.25);

      await prisma.user.update({
        where: { id: user.referredById },
        data:  { balance: { increment: commissionAmount } },
      });

      await prisma.walletTransaction.create({
        data: {
          userId:       user.referredById,
          amount:       commissionAmount,
          type:         'EARNING',
          description:  `Komisi langganan dari ${user.email} (${transaction.durationDays} hari)`,
          referenceTxId: transaction.id,
        },
      });
    }
  }

  return {
    success:       true,
    transactionId: transaction.id,
    userId:        transaction.userId,
    plan:          transaction.plan,
    durationDays:  transaction.durationDays,
    newExpiresAt,
  };
}

/**
 * Ambil harga untuk semua plan sesuai status referral user.
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function getPricesForUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });

  if (!user) throw new Error('User not found');

  const hasDiscount = Boolean(user.referredById);
  const discountPercent = hasDiscount ? 25 : 0;

  const plans = Object.entries(PLAN_PRICES).map(([days, config]) => {
    const finalPrice = hasDiscount
      ? Math.floor(config.amount * (1 - REFERRAL_DISCOUNT))
      : config.amount;

    return {
      durationDays:    parseInt(days),
      label:           config.label,
      plan:            config.plan,
      basePrice:       config.amount,
      finalPrice,
      discountAmount:  config.amount - finalPrice,
    };
  });

  return {
    hasDiscount,
    discountPercent,
    plans,
  };
}

module.exports = {
  createQrisTransaction,
  confirmPaymentByAmount,
  getPricesForUser,
  PLAN_PRICES,
};
