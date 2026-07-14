const { PrismaClient } = require('@prisma/client');
const config = require('../config/env');
const { encrypt, decrypt } = require('../utils/crypto');
const { NotFoundError, BadRequestError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Request cookies for a specific account.
 * Creates a session and returns encrypted cookies.
 */
async function requestCookies(userId, accountId) {
  // 1. Find the account and check health
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { domain: true },
  });

  if (!account || !account.isActive) {
    throw new NotFoundError('Account');
  }

  if (account.cookieHealth !== 'HEALTHY') {
    throw new BadRequestError(
      `Account cookies are ${account.cookieHealth}. Please try another account.`
    );
  }

  if (!account.cookies) {
    throw new BadRequestError('No cookies available for this account.');
  }

  // 2. Check concurrent session limit
  const activeSessions = await prisma.session.count({
    where: {
      accountId,
      isActive: true,
      expiresAt: { gt: new Date() },
    },
  });

  if (activeSessions >= account.maxConcurrent) {
    throw new ConflictError(
      `Account is at max capacity (${account.maxConcurrent}). Please try another account.`
    );
  }

  // 3. Deactivate any existing session for this user on this domain
  await prisma.session.updateMany({
    where: {
      userId,
      account: { domainId: account.domainId },
      isActive: true,
    },
    data: { isActive: false },
  });

  // 4. Create a new session
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + config.session.defaultDurationMinutes);

  const session = await prisma.session.create({
    data: {
      userId,
      accountId,
      expiresAt,
    },
  });

  // 5. Decrypt stored cookies and re-encrypt for transit
  const cookies = typeof account.cookies === 'string'
    ? decrypt(account.cookies)
    : account.cookies;

  const encryptedForTransit = encrypt(cookies);

  logger.info(`Cookie requested: user=${userId}, account=${accountId}`);

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    domain: {
      name: account.domain.name,
      url: account.domain.url,
      cookieDomain: account.domain.cookieDomain,
    },
    encryptedCookies: encryptedForTransit,
  };
}

/**
 * Sync refreshed cookies back from the extension.
 * When a user's browser gets fresh cookies from the target site,
 * the extension sends them back to keep the DB updated.
 */
async function syncCookies(userId, accountId, encryptedCookies) {
  // Verify user has an active session for this account
  const session = await prisma.session.findFirst({
    where: {
      userId,
      accountId,
      isActive: true,
      expiresAt: { gt: new Date() },
    },
  });

  if (!session) {
    throw new BadRequestError('No active session for this account.');
  }

  // Decrypt the incoming cookies
  const cookies = decrypt(encryptedCookies);

  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    throw new BadRequestError('Invalid cookie data.');
  }

  // Re-encrypt and store
  const encryptedForStorage = encrypt(cookies);

  await prisma.account.update({
    where: { id: accountId },
    data: {
      cookies: encryptedForStorage,
      lastCookieSync: new Date(),
      cookieHealth: 'HEALTHY',
    },
  });

  logger.info(`Cookies synced: user=${userId}, account=${accountId}, count=${cookies.length}`);

  return { success: true, syncedAt: new Date() };
}

/**
 * Release a session (user is done using the account).
 */
async function releaseSession(userId, sessionId) {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      isActive: true,
    },
  });

  if (!session) {
    throw new NotFoundError('Active session');
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { isActive: false },
  });

  logger.info(`Session released: user=${userId}, session=${sessionId}`);

  return { success: true };
}

/**
 * Admin: Create a new account for a domain.
 */
async function createAccount({ domainId, label, email, password, maxConcurrent, cookies }) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw new NotFoundError('Domain');

  const encryptedPassword = encrypt(password);
  const encryptedCookies = cookies ? encrypt(cookies) : null;

  return prisma.account.create({
    data: {
      domainId,
      label,
      email,
      password: encryptedPassword,
      maxConcurrent: maxConcurrent || 1,
      cookies: encryptedCookies,
      cookieHealth: cookies ? 'HEALTHY' : 'UNKNOWN',
    },
  });
}

/**
 * Admin: Update account (including cookies).
 */
async function updateAccount(id, data) {
  const updateData = { ...data };

  if (data.password) {
    updateData.password = encrypt(data.password);
  }

  if (data.cookies) {
    updateData.cookies = encrypt(data.cookies);
    updateData.cookieHealth = 'HEALTHY';
    updateData.lastCookieSync = new Date();
  }

  return prisma.account.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Admin: Delete an account.
 */
async function deleteAccount(id) {
  return prisma.account.delete({ where: { id } });
}

/**
 * Cleanup expired sessions (called periodically).
 */
async function cleanupExpiredSessions() {
  const result = await prisma.session.updateMany({
    where: {
      isActive: true,
      expiresAt: { lt: new Date() },
    },
    data: { isActive: false },
  });

  if (result.count > 0) {
    logger.info(`Cleaned up ${result.count} expired sessions`);
  }

  return result;
}

module.exports = {
  requestCookies,
  syncCookies,
  releaseSession,
  createAccount,
  updateAccount,
  deleteAccount,
  cleanupExpiredSessions,
};
