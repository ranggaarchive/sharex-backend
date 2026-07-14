const { PrismaClient } = require('@prisma/client');
const { NotFoundError } = require('../utils/errors');

const prisma = new PrismaClient();

/**
 * List all active domains/services, filtered by user plan.
 */
async function listDomains(userPlan) {
  const planHierarchy = { FREE: 0, PRO: 1, PHANTOM: 2 };
  const userLevel = planHierarchy[userPlan] || 0;

  const domains = await prisma.domain.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      accounts: {
        where: { isActive: true, cookieHealth: 'HEALTHY' },
        select: { displayCloneCount: true }
      },
    },
  });

  // Map domains and indicate if user has access
  return domains.map((domain) => {
    const requiredLevel = planHierarchy[domain.requiredPlan] || 0;
    const availableAccounts = domain.accounts.reduce((sum, acc) => sum + (acc.displayCloneCount || 1), 0);
    
    return {
      id: domain.id,
      name: domain.name,
      slug: domain.slug,
      url: domain.url,
      iconUrl: domain.iconUrl,
      category: domain.category,
      requiredPlan: domain.requiredPlan,
      hasAccess: userLevel >= requiredLevel,
      availableAccounts: availableAccounts,
    };
  });
}

/**
 * Get accounts for a specific domain.
 */
async function listAccounts(domainSlug, userPlan, isAdminView = false) {
  const domain = await prisma.domain.findUnique({
    where: { slug: domainSlug },
  });

  if (!domain || !domain.isActive) {
    throw new NotFoundError('Domain');
  }

  // Check plan access
  const planHierarchy = { FREE: 0, PRO: 1, PHANTOM: 2 };
  const userLevel = planHierarchy[userPlan] || 0;
  const requiredLevel = planHierarchy[domain.requiredPlan] || 0;

  if (userLevel < requiredLevel) {
    return { domain, accounts: [], message: `Requires ${domain.requiredPlan} plan` };
  }

  const accounts = await prisma.account.findMany({
    where: {
      domainId: domain.id,
      isActive: true,
    },
    select: {
      id: true,
      label: true,
      cookieHealth: true,
      maxConcurrent: true,
      displayCloneCount: true,
      lastCookieSync: true,
      _count: {
        select: {
          sessions: {
            where: { isActive: true },
          },
        },
      },
    },
    orderBy: { label: 'asc' },
  });

  return {
    domain: {
      id: domain.id,
      name: domain.name,
      slug: domain.slug,
      url: domain.url,
      category: domain.category,
    },
    accounts: accounts.flatMap((acc) => {
      if (isAdminView) {
        return [{
          id: acc.id,
          label: acc.label,
          health: acc.cookieHealth,
          activeSessions: acc._count.sessions,
          maxConcurrent: acc.maxConcurrent,
          displayCloneCount: acc.displayCloneCount,
          isAvailable: acc.cookieHealth === 'HEALTHY' && acc._count.sessions < acc.maxConcurrent,
          lastSync: acc.lastCookieSync,
        }];
      }

      const clones = [];
      const count = acc.displayCloneCount || 1;
      for (let i = 1; i <= count; i++) {
        clones.push({
          id: count > 1 ? `${acc.id}_clone_${i}` : acc.id,
          label: count > 1 ? `${acc.label} ${i}` : acc.label,
          health: acc.cookieHealth,
          activeSessions: acc._count.sessions,
          maxConcurrent: acc.maxConcurrent,
          isAvailable: acc.cookieHealth === 'HEALTHY' && acc._count.sessions < acc.maxConcurrent,
          lastSync: acc.lastCookieSync,
        });
      }
      return clones;
    }),
  };
}

/**
 * Create a new domain (admin).
 */
async function createDomain(data) {
  return prisma.domain.create({ data });
}

/**
 * Update a domain (admin).
 */
async function updateDomain(id, data) {
  return prisma.domain.update({ where: { id }, data });
}

/**
 * Delete a domain (admin).
 */
async function deleteDomain(id) {
  return prisma.domain.delete({ where: { id } });
}

module.exports = {
  listDomains,
  listAccounts,
  createDomain,
  updateDomain,
  deleteDomain,
};
