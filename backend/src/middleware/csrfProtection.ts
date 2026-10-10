import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate a cryptographically secure random CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF Protection Middleware using the Double Submit Cookie pattern.
 * Applies to mutating methods (POST, PUT, DELETE, PATCH).
 * Requests using Bearer tokens in Authorization header are API clients and exempt.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Safe HTTP methods do not mutate state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Exempt mobile apps or API clients using standard Bearer token in Authorization header
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  // Exempt auth bootstrap endpoints (login/register/refresh/forgot-password)
  const exemptPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-email',
  ];
  if (exemptPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  // Cookie-authenticated requests MUST supply matching CSRF header
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] || req.headers[CSRF_HEADER_NAME.toLowerCase()];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      error: 'CSRF token validation failed',
      message: 'Invalid or missing CSRF token for state-changing request',
    });
  }

  next();
}

/**
 * Handler to set or refresh CSRF cookie and return token
 */
export function setCsrfTokenCookie(req: Request, res: Response): string {
  let token = req.cookies?.[CSRF_COOKIE_NAME];
  if (!token) {
    token = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by frontend JS to set header
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  return token;
}
