const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const checkAdminSkip = (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      if (decoded.role === 'ADMIN') return true;
    } catch (e) {}
  }
  return false;
};

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: checkAdminSkip,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  keyGenerator: (req) => req.ip,
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: checkAdminSkip,
  message: {
    success: false,
    message: 'Too many auth attempts, please try again later.',
  },
});

// Cookie request limiter (prevent abuse)
const cookieLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: checkAdminSkip,
  message: {
    success: false,
    message: 'Too many cookie requests, please slow down.',
  },
});

module.exports = { apiLimiter, authLimiter, cookieLimiter };
