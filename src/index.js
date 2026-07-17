const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimit');

// Routes
const authRoutes = require('./routes/auth.routes');
const domainRoutes = require('./routes/domain.routes');
const cookieRoutes = require('./routes/cookie.routes');
const guardRoutes = require('./routes/guard.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentRoutes = require('./routes/payment.routes');

const app = express();

// Trust proxy for Railway and express-rate-limit
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(apiLimiter);

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/cookies', cookieRoutes);
app.use('/api/guard', guardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error Handler
app.use((err, req, res, next) => {
  logger.error(err);

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
  });
});

// Start Server
app.listen(config.port, () => {
  logger.info(`ShareX API server running in ${config.nodeEnv} mode on port ${config.port}`);
  
  // Start background workers
  require('./workers/healthChecker');
});
