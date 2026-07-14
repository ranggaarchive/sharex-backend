require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cookieEncryption: {
    key: process.env.COOKIE_ENCRYPTION_KEY || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  },

  guard: {
    extensionId: process.env.GUARD_EXTENSION_ID || '',
    mainExtensionId: process.env.MAIN_EXTENSION_ID || '',
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@sharex.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  },

  session: {
    defaultDurationMinutes: 120, // 2 hours default session
  },

  healthCheck: {
    intervalMinutes: 30,
  },
};
