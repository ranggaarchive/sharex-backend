const axios = require('axios');
const logger = require('../utils/logger');
const crypto = require('crypto');
const config = require('../config/env');
// The Python Flask Server URL
const REMOTE_LOGGER_URL = process.env.REMOTE_LOGGER_URL || 'https://aconite.fandrest.my.id/log';

// UUID v4 generator (no external dependency needed)
function generateUUID() {
  return crypto.randomUUID();
}

// Parse query string from URL
function parseQueryParams(url) {
  try {
    const urlObj = new URL(url, 'http://localhost');
    const params = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return Object.keys(params).length > 0 ? params : null;
  } catch {
    return null;
  }
}

// Redact sensitive header values
function redactHeaderValue(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 8) return '[REDACTED]';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

// Extract and sanitize important request headers
function extractHeaders(headers) {
  const important = [
    'content-type',
    'authorization',
    'x-device-id',
    'x-extension-version',
    'x-envelope',
    'x-forwarded-for',
    'x-real-ip',
    'accept',
    'origin',
    'referer',
    'user-agent',
    'x-request-id',
    'x-groupy-token',
  ];

  const result = {};
  for (const key of important) {
    const value = headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()];
    if (value) {
      if (key === 'authorization') {
        // Redact auth tokens but preserve type
        const parts = value.split(' ');
        if (parts.length >= 2) {
          result[key] = parts[0] + ' ' + redactHeaderValue(parts.slice(1).join(' '));
        } else {
          result[key] = redactHeaderValue(value);
        }
      } else if (key === 'x-groupy-token') {
        result[key] = redactHeaderValue(value);
      } else {
        result[key] = value;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Derive event category from URL path
function deriveEventCategory(url) {
  if (!url) return 'UNKNOWN';
  const lower = url.toLowerCase();
  if (lower.includes('/auth')) return 'AUTH';
  if (lower.includes('/payment') || lower.includes('/trx') || lower.includes('/confirm')) return 'PAYMENT';
  if (lower.includes('/cookies')) return 'COOKIE';
  if (lower.includes('/admin')) return 'ADMIN';
  if (lower.includes('/guard')) return 'GUARD';
  if (lower.includes('/referral')) return 'REFERRAL';
  if (lower.includes('/domains') || lower.includes('/config') || lower.includes('/promo') || lower.includes('/canva') || lower.includes('/quiz')) return 'CONFIG';
  if (lower.includes('/accounts')) return 'ACCOUNTS';
  return 'UNKNOWN';
}

// Infer log level from HTTP status code
function inferLogLevel(statusCode) {
  if (!statusCode) return 'INFO';
  if (statusCode >= 500) return 'CRITICAL';
  if (statusCode >= 400) return 'WARNING';
  return 'INFO';
}

// Sensitive fields to redact from request body
const SENSITIVE_BODY_FIELDS = [
  'password',
  'loginPassword',
  'licenseKey',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'privateKey',
  'qrisConfirmSecret',
];

// Massive fields to redact entirely (they're encrypted blobs)
const LARGE_DATA_FIELDS = [
  'encryptedCookies',
  'encryptedLocalStorage',
  'cookies',
  'rawCookies',
];

/**
 * Sanitize request body for logging — redact secrets, truncate large blobs.
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;

  const sanitized = { ...body };

  for (const field of SENSITIVE_BODY_FIELDS) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  for (const field of LARGE_DATA_FIELDS) {
    if (sanitized[field]) {
      sanitized[field] = '[ENCRYPTED_DATA]';
    }
  }

  return sanitized;
}

/**
 * Middleware to log detailed user actions and send them to Aconite.
 * Captures: timing, routing context, request metadata, response metadata,
 * and server metadata — for every single backend request.
 */
function actionLogger(req, res, next) {
  const startTime = Date.now();

  // Check for incoming trace ID (from X-Request-ID header)
  const incomingTraceId = req.headers['x-request-id'];
  const traceId = incomingTraceId || generateUUID();

  // Parse query params
  const queryParams = parseQueryParams(req.originalUrl || req.url);

  // Extract important headers
  const requestHeaders = extractHeaders(req.headers);

  // Sanitize body
  const sanitizedBody = sanitizeBody(req.body);

  // Get device ID and extension version from headers
  const deviceId = req.headers['x-device-id'] || null;
  const extensionVersion = req.headers['x-extension-version'] || null;

  // Get X-Forwarded-For chain
  const xForwardedFor = req.headers['x-forwarded-for'] || null;

  // Get Referer and Origin
  const referer = req.headers['referer'] || req.headers['referrer'] || null;
  const origin = req.headers['origin'] || null;

  // Determine event category from URL
  const eventCategory = deriveEventCategory(req.originalUrl || req.url);

  // Hook into response finish event to capture final state
  res.on('finish', async () => {
    const durationMs = Date.now() - startTime;

    // Infer log level from status
    const logLevel = inferLogLevel(res.statusCode);

    // Get response content length
    const contentLength = res.get('Content-Length');
    const responseContentLength = contentLength ? parseInt(contentLength, 10) : null;

    // Get rate limit remaining (from the standard rate limit headers)
    const rateLimitRemaining = res.get('X-RateLimit-Remaining');
    const rateLimitRemainingInt = rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : null;

    // Collect service name from accountId in body (existing behavior)
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

    // If no service name from DB, derive from URL
    if (!serviceName) {
      serviceName = deriveServiceName(req.originalUrl || req.url);
    }

    // Merge any enriched context set by route handlers
    // Route handlers can attach req._logContext._enrichedBody or res._logContext
    // to add extra context to the logged body
    let enrichedBody = sanitizedBody;
    if (req._logContext && req._logContext._enrichedBody) {
      enrichedBody = {
        ...sanitizedBody,
        ...req._logContext._enrichedBody,
      };
    }
    if (res._logContext) {
      enrichedBody = {
        ...enrichedBody,
        ...res._logContext,
      };
    }

    // Build the complete log payload
    const logData = {
      // Core request info
      timestamp: new Date().toISOString(),
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      user_id: req.user ? req.user.id : null,
      user_email: req.user ? req.user.email : null,

      // Body (sanitized and enriched with handler context)
      body: enrichedBody,

      // Client info
      user_agent: req.headers['user-agent'],
      service_name: serviceName,

      // NEW: Timing
      duration_ms: durationMs,

      // NEW: Query params
      query_params: queryParams,

      // NEW: Request headers
      request_headers: requestHeaders,

      // NEW: Response metadata
      response_content_length: responseContentLength,

      // NEW: Network
      x_forwarded_for: xForwardedFor,
      referer: referer,
      origin: origin,

      // NEW: Trace/correlation
      trace_id: traceId,

      // NEW: Severity
      log_level: logLevel,

      // NEW: Category
      event_category: eventCategory,

      // NEW: Client identifiers
      device_id: deviceId,
      extension_version: extensionVersion,

      // NEW: Server metadata
      server_hostname: config.serverHostname,
      service_version: config.serviceVersion,
    };

    // Send asynchronously to remote server (do not await — fire and forget)
    axios.post(REMOTE_LOGGER_URL, logData, { timeout: 3000 })
      .catch(err => {
        // Log locally if remote logging fails
        logger.error(`Failed to send log to Aconite: ${err.message}`);
      });
  });

  // Set trace ID on response header for client correlation
  res.set('X-Trace-ID', traceId);

  next();
}

/**
 * Derive a service name string from the URL path when no DB lookup was done.
 * e.g. /api/accounts -> accounts, /api/quiz/solve -> quiz
 */
function deriveServiceName(url) {
  if (!url) return null;
  // Strip leading/trailing slashes and split
  const parts = url.replace(/^\/|\/$/g, '').split('/');
  if (parts.length >= 2) {
    // Return the second segment as the service (e.g. "accounts" from "/api/accounts")
    return parts[1] || null;
  }
  return null;
}

module.exports = { actionLogger };
