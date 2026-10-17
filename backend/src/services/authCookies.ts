/**
 * Authentication cookies.
 *
 * Tokens live in HttpOnly cookies the browser script cannot read — that is the
 * whole point: an XSS on the dashboard must not be able to lift a session token
 * out of `localStorage`. In production the `__Host-` prefix additionally pins
 * each cookie to this exact origin, with no domain and no path, so no other
 * host on the estate can set or read it.
 *
 * The prefix requires `Secure`, which requires HTTPS, so plain-HTTP local
 * development drops it (a browser would silently reject the cookie otherwise).
 * Everything else — HttpOnly, SameSite, Path=/, no Domain — is identical in
 * both modes, so nothing about the session shape differs between dev and prod.
 */
import { Response, Request } from 'express';
import crypto from 'node:crypto';
import { securityConfig } from '../config/security.js';
import { KEY_PREFIX, storeDel, storeGet, storeSet } from './redisStore.js';

export const ACCESS_COOKIE = 'bsc_at';
export const REFRESH_COOKIE = 'bsc_rt';
export const CSRF_COOKIE = 'csrf_token';
export const VISITOR_COOKIE = 'bsc_visitor';

export function cookieNames() {
  const prefix = securityConfig.cookies.prefix;
  return {
    access: `${prefix}${ACCESS_COOKIE}`,
    refresh: `${prefix}${REFRESH_COOKIE}`,
    csrf: CSRF_COOKIE,
    visitor: VISITOR_COOKIE,
  };
}

function baseOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: securityConfig.cookies.secure,
    sameSite: securityConfig.cookies.sameSite as 'strict' | 'lax',
    path: securityConfig.cookies.path,
    maxAge: maxAgeSeconds * 1000,
    // No `domain`: with __Host- it is forbidden, and without it a domain cookie
    // can be set by any subdomain.
    ...(securityConfig.cookies.domain ? { domain: securityConfig.cookies.domain } : {}),
  };
}

export function setAccessCookie(res: Response, token: string): void {
  const { access } = cookieNames();
  res.cookie(access, token, baseOptions(securityConfig.tokens.accessTtlSeconds));
}

export function setRefreshCookie(res: Response, token: string): void {
  const { refresh } = cookieNames();
  // The refresh cookie is scoped to the one path that can use it, so a
  // compromised asset route cannot echo it back.
  res.cookie(refresh, token, {
    ...baseOptions(securityConfig.tokens.refreshTtlSeconds),
    path: '/api/auth/session',
  });
}

export function clearAuthCookies(res: Response): void {
  const names = cookieNames();
  for (const name of [names.access, names.refresh]) {
    res.clearCookie(name, { path: securityConfig.cookies.path });
  }
  res.clearCookie(names.refresh, { path: '/api/auth/session' });
}

/** The CSRF cookie is deliberately readable: the double-submit pattern needs it. */
export async function issueCsrfToken(res: Response, req: Request, sessionId?: string | null): Promise<string> {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = existing || crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: securityConfig.cookies.secure,
    sameSite: securityConfig.cookies.sameSite,
    path: '/',
    maxAge: securityConfig.session.absoluteTimeoutSeconds * 1000,
  });
  if (sessionId) {
    // Server-side binding turns a pure double-submit (attacker who can set a
    // cookie) into a failure: the token must also be known to this session.
    await storeSet(`${KEY_PREFIX.session}csrf:${sessionId}`, token, securityConfig.session.absoluteTimeoutSeconds * 1000);
  }
  return token;
}

export async function verifyCsrfBinding(sessionId: string | null | undefined, headerToken: string | undefined): Promise<boolean> {
  if (!sessionId) return true; // bearer-token clients have no session to bind to
  const stored = await storeGet(`${KEY_PREFIX.session}csrf:${sessionId}`);
  if (!stored) return true; // nothing bound yet (first request after login)
  if (!headerToken) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(headerToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Stable first-party visitor id for consent records on signed-out browsers. */
export function visitorId(req: Request, res: Response): string {
  const { visitor } = cookieNames();
  const existing = req.cookies?.[visitor];
  if (existing && /^[a-z0-9_-]{16,40}$/i.test(existing)) return existing;
  const created = crypto.randomBytes(16).toString('base64url');
  res.cookie(visitor, created, {
    httpOnly: false,
    secure: securityConfig.cookies.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return created;
}

export function readAccessToken(req: Request): string | null {
  const { access } = cookieNames();
  const bearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : null;
  return bearer || req.cookies?.[access] || req.cookies?.[ACCESS_COOKIE] || null;
}

export function readRefreshToken(req: Request): string | null {
  const { refresh } = cookieNames();
  return req.cookies?.[refresh] || req.cookies?.[REFRESH_COOKIE] || (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null);
}
