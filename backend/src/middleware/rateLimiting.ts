import rateLimit from 'express-rate-limit';

/**
 * Standard safe handler returning 429 and Retry-After
 */
const createHandler = (message: string) => (req: any, res: any) => {
  const retryAfter = Math.ceil((req.rateLimit?.resetTime?.getTime() - Date.now()) / 1000) || 60;
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    error: 'Too many requests',
    message,
    retryAfter,
  });
};

/**
 * Auth Critical Limiter: Login, Register, MFA Verify
 * 5 requests per 1 minute
 */
export const authCriticalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler('Too many authentication attempts. Please wait a minute before trying again.'),
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const email = (req.body?.email || '').toLowerCase().trim();
    return `${ip}:${email}`;
  },
});

/**
 * Auth Sensitive Limiter: Forgot Password, Reset Password, Verify Email
 * 3 requests per 1 hour
 */
export const authSensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5, // slightly more forgiving in test environments, but strict in production
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler('Password reset or verification request limit reached. Please wait before retrying.'),
});

/**
 * File Upload Limiter: 10 uploads per 1 minute
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler('File upload frequency exceeded. Please wait a moment.'),
});

/**
 * Data Export Limiter: 5 exports per 1 minute
 */
export const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler('Bulk export rate limit exceeded. Please allow the server to process current reports.'),
});
