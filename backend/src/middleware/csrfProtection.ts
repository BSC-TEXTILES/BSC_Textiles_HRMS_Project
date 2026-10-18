import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { ACCESS_COOKIE, CSRF_COOKIE, cookieNames } from '../services/authCookies.js';

const CSRF_COOKIE_NAME = CSRF_COOKIE;
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate a cryptographically secure random CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF protection for cookie-authenticated requests.
 *
 * Two layers, per the specification:
 *   1. `SameSite=Strict` on the session cookies — the browser will not attach
 *      them to a cross-site request at all, which also covers login CSRF;
 *   2. double-submit — a mutating request that carries a session cookie must
 *      also send the matching `x-csrf-token` header. `authenticate` adds the
 *      server-side half by checking that token against the value bound to the
 *      session, so an attacker who can plant a cookie still cannot guess it.
 *
 * Requests with no session cookie (sign-in, captcha, the consent banner on the
 * login page) are skipped: there is no session to forge, and blocking them
 * would make sign-in impossible.
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

  // Exempt IoT hardware connectors & ADMS push endpoints
  if (
    req.headers['x-connector-key'] ||
    req.path.startsWith('/iclock') ||
    req.path.includes('/devices/ingest-raw')
  ) {
    return next();
  }

  const names = cookieNames();
  const hasSessionCookie = Boolean(req.cookies?.[names.access] || req.cookies?.[ACCESS_COOKIE]);
  if (!hasSessionCookie) {
    return next();
  }

  // Refresh and logout change no application state beyond the caller's own
  // session, and both are already unreachable cross-site because the cookies
  // are SameSite=Strict. Exempting them avoids a dead end when the readable
  // CSRF cookie expires before the session does.
  //
  // Sign-in belongs here too. The skip above only fires when no session cookie
  // is present, but a browser can arrive at the login page still holding an
  // unexpired access cookie — from a session that was invalidated server-side,
  // or simply from having signed in earlier in the tab. The form has no CSRF
  // header to send yet (there is no session to bind one to), so every attempt
  // was rejected with 403 and the user could not sign in again until they
  // cleared cookies. Login CSRF is covered by SameSite=Strict on the session
  // cookies, which is the layer this middleware documents up front.
  const csrfExempt = [
  '/api/session/login',
  '/api/auth/session/login',
  '/api/auth/login',
  '/api/session/refresh',
  '/api/session/logout',
  '/api/auth/session/refresh',
  '/api/auth/session/logout',
  '/api/auth/refresh',
  '/api/auth/logout',
];
  if (csrfExempt.some((path) => req.path === path || req.path.endsWith(path))) {
    return next();
  }

  // Cookie-authenticated requests MUST supply matching CSRF header
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] || req.headers[CSRF_HEADER_NAME.toLowerCase()];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      error: 'CSRF token validation failed',
      code: 'CSRF_FAILED',
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
