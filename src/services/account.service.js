const { PrismaClient } = require('@prisma/client');
const { NotFoundError } = require('../utils/errors');

const prisma = new PrismaClient();

const GROUPY_API_URL = process.env.GROUPY_API_URL || 'http://195.88.211.169:1337';
const GROUPY_TOKEN = process.env.GROUPY_TOKEN || '22c3abb70e2244a874bbcac4f1b1d6b03f69d7f5dd766c01608c0f582eb87acd';

/**
 * List all active accounts/services, filtered by user plan.
 */
async function listAccounts(userPlan) {
  const planHierarchy = { FREE: 0, PRO: 1, PHANTOM: 2 };
  const userLevel = planHierarchy[userPlan] || 0;

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      groupyId: true,
      name: true,
      category: true,
      url: true,
      iconUrl: true,
      requiredPlan: true,
      loginMethod: true,
      cookieHealth: true,
      maxConcurrent: true,
      displayCloneCount: true,
      _count: {
        select: {
          sessions: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  return accounts.map((acc) => {
    const requiredLevel = planHierarchy[acc.requiredPlan] || 0;
    
    return {
      id: acc.id,
      groupyId: acc.groupyId,
      name: acc.name,
      category: acc.category,
      url: acc.url,
      iconUrl: acc.iconUrl,
      requiredPlan: acc.requiredPlan,
      loginMethod: acc.loginMethod,
      health: acc.cookieHealth,
      hasAccess: userLevel >= requiredLevel,
      isAvailable: acc.cookieHealth === 'HEALTHY' && acc._count.sessions < acc.maxConcurrent,
      activeSessions: acc._count.sessions,
      maxConcurrent: acc.maxConcurrent,
    };
  });
}

/**
 * Sync accounts from Groupy API.
 * This should be called by an admin or a background cron job.
 */
async function syncAccountsFromGroupy() {
  try {
    const response = await fetch(`${GROUPY_API_URL}/services?token=${GROUPY_TOKEN}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch from Groupy API: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.message || !Array.isArray(data.message)) {
      throw new Error('Invalid response format from Groupy API');
    }

    const services = data.message;
    let added = 0;
    let updated = 0;

    for (const service of services) {
      // Map category to Prisma Enum (STREAMING, PRODUCTIVITY, etc)
      const categoryMap = {
        'streaming': 'STREAMING',
        'productivity': 'PRODUCTIVITY',
        'education': 'EDUCATION',
        'design': 'DESIGN',
        'music': 'MUSIC',
        'utilities': 'UTILITIES',
      };
      
      const mappedCategory = categoryMap[service.category?.toLowerCase()] || 'STREAMING';

      // Bulk fetch the service details to get the cookies (key array) and URL
      let serviceUrl = null;
      let isHealthy = false;
      try {
        const detailRes = await fetch(`${GROUPY_API_URL}/service/${service.id}?token=${GROUPY_TOKEN}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.message) {
            if (detailData.message.url) serviceUrl = detailData.message.url;
            if (detailData.message.key) isHealthy = true; // Has cookies
          }
        }
      } catch (err) {
        // Silently fail and keep UNKNOWN health if we can't fetch details
      }

      const existingAccount = await prisma.account.findUnique({
        where: { groupyId: String(service.id) }
      });

      if (existingAccount) {
        await prisma.account.update({
          where: { groupyId: String(service.id) },
          data: {
            name: service.name,
            iconUrl: service.logo,
            category: mappedCategory,
            url: serviceUrl,
            cookieHealth: isHealthy ? 'HEALTHY' : existingAccount.cookieHealth,
            lastHealthCheck: new Date(),
          }
        });
        updated++;
      } else {
        await prisma.account.create({
          data: {
            groupyId: String(service.id),
            name: service.name,
            iconUrl: service.logo,
            category: mappedCategory,
            url: serviceUrl,
            cookieHealth: isHealthy ? 'HEALTHY' : 'UNKNOWN',
            lastHealthCheck: new Date(),
            requiredPlan: 'FREE', // Default plan, admin can change later
            loginMethod: 'INJECT',
            maxConcurrent: 1,
          }
        });
        added++;
      }
    }

    return { success: true, added, updated, total: services.length };
  } catch (error) {
    console.error('Error syncing accounts:', error);
    throw new Error('Failed to sync accounts from Groupy API');
  }
}

/**
 * Update an account (admin).
 */
async function updateAccount(id, data) {
  return prisma.account.update({ where: { id }, data });
}

module.exports = {
  listAccounts,
  syncAccountsFromGroupy,
  updateAccount,
};
