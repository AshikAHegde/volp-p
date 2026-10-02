/**
 * rate-limit.middleware.js - Standard Express Rate Limiter using express-rate-limit
 *
 * Provides isolated rate-limiting buckets:
 * 1. strictLimiter: Max 10 requests / 15 minutes (live VOLP sync and login)
 * 2. simpleLimiter: Max 100 requests / 1 minute (fast database-only queries)
 */
import rateLimit from 'express-rate-limit';

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded for external VOLP live sync. Max 10 syncs per 15 minutes to protect college servers.',
  },
});

export const simpleLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'Too many requests',
    message: 'Too many requests. Please slow down.',
  },
});

// Dedicated routes connecting to external college servers or triggering reminders
const strictRoutes = new Set([
  '/api/auth/login',
  '/api/assignments/sync-courses',
  '/api/assignments/sync-assignments',
  '/api/assignments/trigger-8pm-reminder',
]);

/**
 * Global rate limiter router middleware.
 * Dispatches to strictLimiter for live sync/auth and simpleLimiter for DB-only routes.
 */
export function projectRateLimiter(req, res, next) {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const normalizedPath = req.path.endsWith('/') && req.path.length > 1
    ? req.path.slice(0, -1)
    : req.path;

  if (strictRoutes.has(normalizedPath)) {
    return strictLimiter(req, res, next);
  }

  return simpleLimiter(req, res, next);
}

