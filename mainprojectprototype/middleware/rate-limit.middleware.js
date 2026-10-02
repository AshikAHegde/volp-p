import rateLimit from 'express-rate-limit';

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded for external VOLP live sync. Max 10 syncs per 15 minutes to protect college servers.',
  },
});

export const simpleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'Too many requests',
    message: 'Too many requests. Please slow down.',
  },
});

const strictRoutes = new Set([
  '/api/auth/login',
  '/api/assignments/sync-courses',
  '/api/assignments/sync-assignments',
  '/api/assignments/trigger-8pm-reminder',
]);

// Dispatches incoming API requests to strict or simple rate limiters based on endpoint sensitivity.
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
