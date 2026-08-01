const axios = require('axios');
const logger = require('../utils/logger');

// The Python Flask Server URL
const REMOTE_LOGGER_URL = process.env.REMOTE_LOGGER_URL || 'http://127.0.0.1:5000/log';

/**
 * Middleware to log detailed user actions and send them to a remote Python Flask server.
 */
function actionLogger(req, res, next) {
  // Capture request start time (optional, to calculate duration if needed)
  const startTime = Date.now();

  // Clone and sanitize request body
  let sanitizedBody = null;
  if (req.body) {
    sanitizedBody = { ...req.body };
    const sensitiveFields = ['password', 'loginPassword', 'licenseKey'];
    for (const field of sensitiveFields) {
      if (sanitizedBody[field]) {
        sanitizedBody[field] = '[REDACTED]';
      }
    }
    
    // Some routes have encrypted cookies / localstorage which are huge, we may want to truncate them or remove them.
    // For cookies/sync route, `encryptedCookies` can be massive.
    if (sanitizedBody.encryptedCookies) {
      sanitizedBody.encryptedCookies = '[ENCRYPTED_DATA_REDACTED]';
    }
    if (sanitizedBody.encryptedLocalStorage) {
      sanitizedBody.encryptedLocalStorage = '[ENCRYPTED_DATA_REDACTED]';
    }
  }

  // Hook into the response finish event to capture the final state
  res.on('finish', async () => {
    let serviceName = null;
    if (sanitizedBody && sanitizedBody.accountId) {
      try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const realAccountId = sanitizedBody.accountId.includes('_clone_') 
           ? sanitizedBody.accountId.split('_clone_')[0] 
           : sanitizedBody.accountId;
        const account = await prisma.account.findUnique({ 
           where: { id: realAccountId }, 
           select: { name: true } 
        });
        if (account) {
           serviceName = account.name;
        }
      } catch (e) {
        logger.error(`Error fetching service name for logger: ${e.message}`);
      }
    }

    // Collect the data
    const logData = {
      timestamp: new Date().toISOString(),
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      user_id: req.user ? req.user.id : null,
      user_email: req.user ? req.user.email : null,
      body: sanitizedBody,
      user_agent: req.headers['user-agent'],
      service_name: serviceName
    };

    // Send asynchronously to remote server (do not await, to not block)
    axios.post(REMOTE_LOGGER_URL, logData)
      .catch(err => {
        // Log locally if remote logging fails
        logger.error(`Failed to send log to remote server: ${err.message}`);
      });
  });

  next();
}

module.exports = { actionLogger };
