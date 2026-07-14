const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Authenticate requests using JWT Bearer token.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Check device binding
    const deviceId = req.headers['x-device-id'];
    if (deviceId) {
      const userRecord = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { currentDeviceId: true, banWarningCount: true, isActive: true }
      });
      
      if (!userRecord || !userRecord.isActive) {
        return next(new UnauthorizedError('Account is deactivated'));
      }
      
      if (userRecord.currentDeviceId && userRecord.currentDeviceId !== deviceId) {
        const newCount = userRecord.banWarningCount + 1;
        const willBan = newCount >= 3;
        
        await prisma.user.update({
          where: { id: decoded.id },
          data: { 
            banWarningCount: newCount,
            isActive: !willBan
          }
        });
        
        return res.status(403).json({
          success: false,
          error: 'DEVICE_MISMATCH',
          message: willBan ? 'Account banned due to repeated sharing violations' : 'Account accessed from another device. Sharing is prohibited.'
        });
      }
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

/**
 * Require admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
}

/**
 * Require specific plan level or higher.
 */
function requirePlan(...plans) {
  return async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      if (!user || !user.isActive) {
        return next(new UnauthorizedError('User not found or inactive'));
      }

      if (!plans.includes(user.plan)) {
        return next(new ForbiddenError(`This feature requires one of: ${plans.join(', ')}`));
      }

      req.userRecord = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authenticate, requireAdmin, requirePlan };
