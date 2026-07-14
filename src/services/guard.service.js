const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Record a heartbeat from the Guard extension.
 */
async function recordHeartbeat({ extensionId, fingerprint }) {
  const heartbeat = await prisma.guardHeartbeat.create({
    data: {
      extensionId,
      fingerprint,
      isValid: true,
    },
  });

  logger.debug(`Guard heartbeat: ${extensionId}`);
  return heartbeat;
}

/**
 * Verify if a Guard extension ID is valid.
 */
async function verifyGuard(extensionId) {
  // Check if we've received recent heartbeats from this guard
  const recentHeartbeat = await prisma.guardHeartbeat.findFirst({
    where: {
      extensionId,
      isValid: true,
      createdAt: {
        gt: new Date(Date.now() - 10 * 60 * 1000), // within last 10 minutes
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    isValid: !!recentHeartbeat,
    lastSeen: recentHeartbeat?.createdAt || null,
  };
}

module.exports = { recordHeartbeat, verifyGuard };
