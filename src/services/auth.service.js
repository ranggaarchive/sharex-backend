const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config/env');
const { BadRequestError, UnauthorizedError, ConflictError } = require('../utils/errors');

const prisma = new PrismaClient();

/**
 * Register a new user.
 */
async function register({ email, password }) {
  if (!email || !password) {
    throw new BadRequestError('Email and password are required');
  }

  if (password.length < 6) {
    throw new BadRequestError('Password must be at least 6 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
    },
    select: {
      id: true,
      email: true,
      plan: true,
      role: true,
      createdAt: true,
    },
  });

  const token = generateToken(user);
  return { user, token };
}

/**
 * Login an existing user.
 */
async function login({ email, password, deviceId }) {
  if (!email || !password) {
    throw new BadRequestError('Email and password are required');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Bind device if provided
  if (deviceId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { currentDeviceId: deviceId }
    });
  }

  const token = generateToken(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan,
      role: user.role,
    },
    token,
  };
}

/**
 * Get user profile by ID.
 */
async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      plan: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return user;
}

/**
 * Verify and activate a license key.
 */
async function verifyLicense(userId, licenseKey) {
  // In a real system you'd verify against a license server / payment provider
  // For now, we just set the key and upgrade plan
  const planMap = {
    PRO: /^PRO-/,
    PHANTOM: /^PHANTOM-/,
  };

  let plan = 'FREE';
  for (const [p, regex] of Object.entries(planMap)) {
    if (regex.test(licenseKey)) {
      plan = p;
      break;
    }
  }

  if (plan === 'FREE') {
    throw new BadRequestError('Invalid license key format');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { licenseKey, plan },
    select: {
      id: true,
      email: true,
      plan: true,
      licenseKey: true,
    },
  });

  return user;
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, plan: user.plan },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { register, login, getProfile, verifyLicense };
