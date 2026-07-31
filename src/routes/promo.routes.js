'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate, requireAdmin } = require('../middleware/auth');

// Hanya admin yang bisa mengakses route ini
router.use(authenticate, requireAdmin);

// GET /api/promo - List semua promo
router.get('/', async (req, res, next) => {
  try {
    const promos = await prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: promos });
  } catch (err) {
    next(err);
  }
});

// POST /api/promo - Tambah promo baru
router.post('/', async (req, res, next) => {
  try {
    const { code, discountAmount, maxUsage, validForDays, isActive } = req.body;
    
    if (!code || !discountAmount) {
      return res.status(400).json({ success: false, message: 'Code dan discountAmount harus diisi' });
    }

    const exists = await prisma.promoCode.findUnique({ where: { code } });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Kode promo sudah ada' });
    }

    const newPromo = await prisma.promoCode.create({
      data: {
        code: code.toUpperCase(),
        discountAmount: parseInt(discountAmount, 10),
        maxUsage: maxUsage ? parseInt(maxUsage, 10) : 0,
        validForDays: validForDays && parseInt(validForDays, 10) > 0 ? parseInt(validForDays, 10) : null,
        isActive: isActive !== undefined ? isActive : true,
      }
    });

    res.json({ success: true, data: newPromo });
  } catch (err) {
    next(err);
  }
});

// PUT /api/promo/:id - Edit promo
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, discountAmount, maxUsage, validForDays, isActive } = req.body;

    const promo = await prisma.promoCode.findUnique({ where: { id } });
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo tidak ditemukan' });
    }

    const updated = await prisma.promoCode.update({
      where: { id },
      data: {
        code: code ? code.toUpperCase() : undefined,
        discountAmount: discountAmount !== undefined ? parseInt(discountAmount, 10) : undefined,
        maxUsage: maxUsage !== undefined ? parseInt(maxUsage, 10) : undefined,
        validForDays: validForDays !== undefined ? (parseInt(validForDays, 10) > 0 ? parseInt(validForDays, 10) : null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/promo/:id - Hapus promo
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.promoCode.delete({ where: { id } });
    res.json({ success: true, message: 'Promo berhasil dihapus' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
