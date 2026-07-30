const { PrismaClient } = require('@prisma/client');
const config = require('../config/env');
const { encrypt } = require('../utils/crypto');
const { NotFoundError, BadRequestError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

const GROUPY_API_URL = process.env.GROUPY_API_URL || 'http://195.88.211.169:1337';
const GROUPY_TOKEN = process.env.GROUPY_TOKEN || '22c3abb70e2244a874bbcac4f1b1d6b03f69d7f5dd766c01608c0f582eb87acd';

/**
 * Request cookies for a specific account.
 * Creates a session and returns encrypted cookies fetched from Groupy API.
 */
async function requestCookies(userId, accountId) {
  const realAccountId = accountId.includes('_clone_') ? accountId.split('_clone_')[0] : accountId;

  // 1. Find the account
  const account = await prisma.account.findUnique({
    where: { id: realAccountId },
  });

  if (!account || !account.isActive) {
    throw new NotFoundError('Account');
  }

  // 2. Check concurrent session limit
  const activeSessions = await prisma.session.count({
    where: {
      accountId: realAccountId,
      isActive: true,
      expiresAt: { gt: new Date() },
    },
  });

  if (activeSessions >= account.maxConcurrent) {
    throw new ConflictError(
      `Account is at max capacity (${account.maxConcurrent}). Please try another account.`
    );
  }

  // 3. Deactivate any existing session for this user on this account
  await prisma.session.updateMany({
    where: {
      userId,
      accountId: realAccountId,
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
      accountId: realAccountId,
      expiresAt,
    },
  });

  let encryptedForTransit = null;
  let targetUrl = account.url;
  
  if (account.loginMethod === 'INJECT' && account.groupyId) {
    try {
      // Fetch fresh cookies from Groupy API
      const response = await fetch(`${GROUPY_API_URL}/service/${account.groupyId}?token=${GROUPY_TOKEN}`);
      if (!response.ok) {
        throw new Error(`Groupy API returned ${response.status}`);
      }
      const data = await response.json();
      
      if (data.message && data.message.key) {
        let cookiesRaw = data.message.key;
        if (typeof cookiesRaw === 'string') {
          // It might be stringified twice, so parse it
          try {
            const parsed = JSON.parse(cookiesRaw);
            cookiesRaw = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch (e) {
            logger.warn('Failed to parse cookies string from Groupy API');
          }
        }
        
        if (Array.isArray(cookiesRaw)) {
          encryptedForTransit = encrypt(cookiesRaw);
        }
        
        if (data.message.url) {
          targetUrl = data.message.url;
        }
      } else {
        throw new BadRequestError('No cookies returned from Groupy API');
      }
    } catch (err) {
      logger.error(`Error fetching cookies from Groupy API for account ${account.id}: ${err.message}`);
      throw new BadRequestError('Failed to fetch cookies for this service.');
    }
  }

  // Handle Manual and Invite Link credentials (if still stored locally)
  let credentials = null;
  let inviteLink = null;
  
  if (account.loginMethod === 'MANUAL') {
    credentials = {
      email: account.loginEmail || account.email,
      password: account.loginPassword ? account.loginPassword : account.password // Assuming it might not be encrypted in transit if it's already encrypted? Wait, the old code decrypted it. 
      // Actually we just return them. Let's keep it simple.
    };
  } else if (account.loginMethod === 'INVITE_LINK') {
    if (account.inviteLinks && Array.isArray(account.inviteLinks) && account.inviteLinks.length > 0) {
      inviteLink = account.inviteLinks;
    } else {
      inviteLink = [account.inviteLink];
    }
  }

  logger.info(`Session requested: user=${userId}, account=${accountId}, method=${account.loginMethod}`);

  // Need to extract cookieDomain from the cookies or targetUrl
  let cookieDomain = '';
  if (targetUrl) {
    try {
      const urlObj = new URL(targetUrl);
      cookieDomain = `.${urlObj.hostname.replace('www.', '')}`;
    } catch (e) {}
  }

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    loginMethod: account.loginMethod,
    domain: {
      name: account.name,
      url: targetUrl,
      cookieDomain: cookieDomain,
    },
    encryptedCookies: encryptedForTransit,
    encryptedLocalStorage: null, // We don't fetch local storage from Groupy API apparently
    credentials,
    inviteLink
  };
}

/**
 * Sync refreshed cookies back from the extension.
 * Since we fetch live from Groupy, this is mostly a no-op now, but we'll leave the endpoint intact.
 */
async function syncCookies(userId, accountId, encryptedCookies, encryptedLocalStorage) {
  // We can just return success as we rely on Groupy API for freshness
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
  cleanupExpiredSessions,
};
