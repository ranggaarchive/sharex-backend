'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate, requireAdmin, requirePlan } = require('../middleware/auth');

// GET /api/canva - List active canva links (User only if PHANTOM plan)
router.get('/', authenticate, requirePlan('PHANTOM'), async (req, res, next) => {
  try {
    const links = await prisma.canvaLink.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: links });
  } catch (err) {
    next(err);
  }
});

// GET /api/canva/admin - List ALL canva links (Admin only)
router.get('/admin', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const links = await prisma.canvaLink.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: links });
  } catch (err) {
    next(err);
  }
});

// POST /api/canva - Create new canva link (Admin only)
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, url, isActive } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ success: false, message: 'Name dan URL harus diisi' });
    }

    const newLink = await prisma.canvaLink.create({
      data: {
        name,
        url,
        isActive: isActive !== undefined ? isActive : true,
      }
    });

    res.json({ success: true, data: newLink });
  } catch (err) {
    next(err);
  }
});

// POST /api/canva/bulk - Bulk create canva links (Admin only)
router.post('/bulk', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { links } = req.body;
    
    if (!links || !Array.isArray(links)) {
      return res.status(400).json({ success: false, message: 'Data links harus berupa array' });
    }

    // Filter invalid links just in case
    const validLinks = links.filter(l => l.name && l.url).map(l => ({
      name: l.name.trim(),
      url: l.url.trim(),
      isActive: true,
    }));

    if (validLinks.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data valid untuk ditambahkan' });
    }

    const created = await prisma.canvaLink.createMany({
      data: validLinks
    });

    res.json({ success: true, message: `Berhasil menambahkan ${created.count} link`, count: created.count });
  } catch (err) {
    next(err);
  }
});

// PUT /api/canva/:id - Edit canva link (Admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, url, isActive } = req.body;

    const link = await prisma.canvaLink.findUnique({ where: { id } });
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link tidak ditemukan' });
    }

    const updated = await prisma.canvaLink.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        url: url !== undefined ? url : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/canva/:id - Delete canva link (Admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.canvaLink.delete({ where: { id } });
    res.json({ success: true, message: 'Link berhasil dihapus' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
