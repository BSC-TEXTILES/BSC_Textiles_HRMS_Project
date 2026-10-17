import { Request, Response, NextFunction } from 'express';
import { securityConfig } from '../config/security.js';

/**
 * Response headers for the API.
 *
 * The API is a JSON/PDF/XLSX service: it renders no application UI, so its
 * Content-Security-Policy can refuse scripts outright. That is a much stronger
 * posture than the browser-facing policy, and the reason the same string is not
 * simply shared between the two processes.
 *
 * Behind the nginx edge (infra/nginx) these values are superseded, not
 * duplicated: the edge hides upstream copies of these headers and re-emits its
 * own, so exactly one of each reaches the browser. This middleware still has to
 * be correct on its own, because `npm run dev` reaches the API directly.
 */

const FRAME_ANCESTORS = "'self'";

/**
 * /api/docs is a hand-written HTML reference page. It has no script tags, but
 * it does carry an inline <style> block and a Google Fonts stylesheet, so
 * style-src has to allow both. Every other response gets the locked variant.
 */
const DOCS_STYLE_SRC = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";

function buildCsp(pathname: string): string {
  const isDocsPage = pathname.startsWith('/api/docs');
  const directives = [
    "default-src 'none'",
    // The API never returns executable markup. If a feature ever needs to,
    // that is the moment to reconsider this line rather than relax it here.
    "script-src 'none'",
    isDocsPage ? DOCS_STYLE_SRC : "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${FRAME_ANCESTORS}`,
  ];

  if (securityConfig.transport.requireHttps) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Belt and braces: helmet removes this too, but the header is a stack
  // fingerprint and Express re-adds it on some error paths.
  res.removeHeader('X-Powered-By');

  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN, not DENY: the employee-document viewer embeds the API's own
  // PDF preview in an iframe. Cross-origin framing is still refused.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // camera is for enrolment and attendance selfies, geolocation for showroom
  // check-in; nothing on this origin should ever need the rest.
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), camera=(self), microphone=(self), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()'
  );

  res.setHeader('Content-Security-Policy', buildCsp(req.path || req.url));

  // HSTS only when the deployment actually terminates TLS and can guarantee it;
  // emitting it over local HTTP teaches the browser to refuse the dev origin.
  if (securityConfig.transport.requireHttps && securityConfig.transport.hstsHeader) {
    res.setHeader('Strict-Transport-Security', securityConfig.transport.hstsHeader);
  }

  next();
}
