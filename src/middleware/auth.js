const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Authenticate requests using JWT Bearer token.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
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
