/**
 * Cookie-based session endpoints.
 *
 * These are the routes the browser uses. They deliberately do not return an
 * access token in a response body — the token goes into an HttpOnly cookie, so
 * it is invisible to page script and to anyone who finds an XSS. The legacy
 * bearer endpoints keep working for the mobile app and the device connector;
 * both paths share `performLogin`, so the accept/reject decision is identical.
 */
import { Router, Request, Response } from 'express';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { sensitiveRateLimit, captchaRateLimit } from '../middleware/securityGuards.js';
import { issueCaptcha, verifyCaptcha } from '../services/captchaService.js';
import { performLogin, exchangeMfaChallenge, consumeTicket, type LoginRequest } from '../services/authentication.js';
import {
  clearAuthCookies,
  issueCsrfToken,
  readAccessToken,
  readRefreshToken,
  setAccessCookie,
  setRefreshCookie,
  visitorId,
} from '../services/authCookies.js';
import { rotateRefreshToken, issueFromFamily, issueTokenPair, verifyAccessToken, revokeAccessToken, InvalidTokenError, RefreshReuseError } from '../services/tokenService.js';
import { SessionService } from '../services/sessionService.js';
import { MfaService } from '../services/mfaService.js';
import { AuditService } from '../services/auditService.js';
import { changeOwnPassword } from '../services/credentials.js';
import { evaluate } from '../services/passwordPolicy.js';
import { getJwks } from '../services/signingKeys.js';
import { readConsent, saveConsent } from '../services/privacy.js';
import { raiseSecurityAlert } from '../services/securityAlerts.js';

const router = Router();

function ipOf(req: Request): string {
  return (req as any).clientIp || req.ip || req.socket.remoteAddress || '127.0.0.1';
}

function uaOf(req: Request): string {
  return String(req.headers['user-agent'] || 'Unknown Device').slice(0, 255);
}

function fail(res: Response, error: any, fallback = 'Request failed'): void {
  const status = error?.status || (error?.code === 'CREDENTIALS_ADMIN_ONLY' ? 403 : 500);
  if (status >= 500) console.error('[session]', error);
  res.status(status === 404 ? 404 : status).json({ error: fallback, message: error?.message || fallback, code: error?.code });
}

// ---------------------------------------------------------------------------
// CAPTCHA
// ---------------------------------------------------------------------------

router.get('/captcha', captchaRateLimit, async (_req: Request, res: Response) => {
  try {
    const challenge = await issueCaptcha();
    res.setHeader('Cache-Control', 'no-store');
    res.json(challenge);
  } catch (error: any) {
    fail(res, error, 'Could not start verification');
  }
});

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

async function respondWithSession(
  res: Response,
  req: Request,
  outcome: Awaited<ReturnType<typeof performLogin>>
): Promise<void> {
  if (outcome.status === 'success' || outcome.status === 'password_expired') {
    setAccessCookie(res, outcome.tokens!.accessToken);
    setRefreshCookie(res, outcome.tokens!.refreshToken);
    const csrf = await issueCsrfToken(res, req, outcome.sessionId ?? null);
    res.json({
      user: outcome.user,
      sessionId: outcome.sessionId,
      ticket: outcome.ticket,
      csrfToken: csrf,
      mustChangePassword: Boolean(outcome.mustChangePassword),
      passwordExpired: outcome.status === 'password_expired',
      expiresIn: outcome.tokens!.accessExpiresIn,
      idleTimeoutSeconds: securityConfig.session.idleTimeoutSeconds,
      absoluteTimeoutSeconds: securityConfig.session.absoluteTimeoutSeconds,
      warningSeconds: securityConfig.session.warningSeconds,
      message: outcome.message,
    });
    return;
  }

  if (outcome.status === 'mfa_required') {
    res.status(202).json({
      mfaRequired: true,
      challengeId: outcome.sessionId,
      message: outcome.message,
      methods: ['totp', 'backup_code'],
    });
    return;
  }

  const status = outcome.status === 'locked' ? 429 : 401;
  if (outcome.retryAfterSeconds) res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
  res.status(status).json({
    error: 'Invalid credentials',
    message: outcome.message || 'Invalid credentials',
    locked: outcome.status === 'locked',
    retryAfterSeconds: outcome.retryAfterSeconds ?? 0,
    captchaRequired: Boolean(outcome.captchaRequired),
  });
}

router.post('/login', sensitiveRateLimit, async (req: Request, res: Response) => {
  const request: LoginRequest = {
    identifier: String(req.body?.identifier ?? req.body?.email ?? req.body?.loginId ?? ''),
    password: String(req.body?.password ?? ''),
    captchaId: req.body?.captchaId,
    captchaAnswer: req.body?.captchaAnswer,
    ip: ipOf(req),
    userAgent: uaOf(req),
  };
  try {
    const outcome = await performLogin(request);
    await respondWithSession(res, req, outcome);
  } catch (error: any) {
    fail(res, error, 'Sign-in failed');
  }
});

router.post('/mfa/verify', sensitiveRateLimit, async (req: Request, res: Response) => {
  try {
    const challengeId = String(req.body?.challengeId || '');
    const code = String(req.body?.code || '');
    const challenge = await readMfaChallenge(challengeId);
    if (!challenge) {
      res.status(401).json({ error: 'Invalid credentials', message: 'Your verification step expired. Sign in again.' });
      return;
    }
    const verified = await MfaService.verifyChallenge(challenge.userId, code);
    if (!verified.success) {
      await registerMfaFailure(challenge.userId, ipOf(req));
      res.status(401).json({ error: 'Invalid credentials', message: 'That code is not valid right now.' });
      return;
    }
    const outcome = await exchangeMfaChallenge(challengeId, challenge.userId, ipOf(req), uaOf(req));
    await respondWithSession(res, req, outcome);
  } catch (error: any) {
    fail(res, error, 'Verification failed');
  }
});

async function registerMfaFailure(userId: string, ip: string): Promise<void> {
  await raiseSecurityAlert({
    title: 'Failed second-factor attempt',
    message: `An incorrect authenticator code was submitted for ${userId} from ${ip}.`,
    event: { type: 'ACCOUNT_TAKEOVER_ATTEMPT', severity: 'MEDIUM', userId, ipAddress: ip, riskScore: 55, details: {} },
  });
}

async function readMfaChallenge(challengeId: string): Promise<{ userId: string } | null> {
  const { storeGet } = await import('../services/redisStore.js');
  const raw = await storeGet(`sess:mfa:${challengeId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** One-time ticket exchange so the Next.js layer never handles a password. */
router.post('/exchange', async (req: Request, res: Response) => {
  try {
    const exchanged = await consumeTicket(String(req.body?.ticket || ''), ipOf(req), uaOf(req));
    if (!exchanged) {
      res.status(401).json({ error: 'Invalid exchange' });
      return;
    }
    const [rows]: any = await pool.query(
      'SELECT `id`, `email`, `loginId`, `fullName`, `role`, `permissions`, `locationId`, `employeeId`, `mfaEnabled`, `mustChangePassword` FROM `user` WHERE `id` = ? LIMIT 1',
      [exchanged.userId]
    );
    if (!rows?.length) return void res.status(401).json({ error: 'Invalid exchange' });
    const user = rows[0];
    res.json({
      user: {
        id: user.id,
        email: user.email,
        loginId: user.loginId,
        fullName: user.fullName,
        role: user.role,
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
        locationId: user.locationId,
        employeeId: user.employeeId,
        mfaEnabled: Boolean(user.mfaEnabled),
        mustChangePassword: Boolean(user.mustChangePassword),
        sessionId: exchanged.sessionId,
      },
    });
  } catch (error: any) {
    fail(res, error, 'Exchange failed');
  }
});

router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.user?.sessionId || null;
    if (sessionId) await SessionService.revokeSession(sessionId, 'LOGOUT');
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : readAccessToken(req);
    if (token) {
      try {
        const claims = await verifyAccessToken(token);
        await revokeAccessToken(claims.jti, claims.sub, 'LOGOUT', securityConfig.tokens.accessTtlSeconds);
      } catch {
        /* already invalid */
      }
    }
    if (req.user?.id) {
      const { revokeAllUserTokens } = await import('../services/tokenService.js');
      await revokeAllUserTokens(req.user.id, 'LOGOUT').catch(() => undefined);
    }
    clearAuthCookies(res);
    await AuditService.log({
      userId: req.user?.id,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: req.user?.id,
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      sessionId: sessionId || undefined,
      tags: ['auth'],
    }).catch(() => undefined);
    res.json({ message: 'Signed out' });
  } catch (error: any) {
    fail(res, error, 'Sign-out failed');
  }
});

// ---------------------------------------------------------------------------
// Refresh rotation
// ---------------------------------------------------------------------------

router.post('/refresh', sensitiveRateLimit, async (req: Request, res: Response) => {
  const presented = readRefreshToken(req);
  if (!presented) {
    res.status(401).json({ error: 'Invalid session', message: 'No session to refresh.' });
    return;
  }
  try {
    const rotated = await rotateRefreshToken(presented, { ip: ipOf(req), userAgent: uaOf(req) });
    if (!rotated) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Invalid session', message: 'Your session has ended. Please sign in again.' });
      return;
    }
    const [rows]: any = await pool.query('SELECT * FROM `user` WHERE `id` = ? LIMIT 1', [rotated.userId]);
    const user = rows?.[0];
    if (!user || !user.isActive || (user.status && user.status !== 'ACTIVE')) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    const pair = await issueFromFamily(
      { id: user.id, email: user.email, role: user.role, tokenVersion: Number(user.tokenVersion || 0) },
      rotated,
      { ip: ipOf(req), userAgent: uaOf(req), authMethod: user.mfaEnabled ? 'pwd+mfa' : 'pwd' }
    );
    if (rotated.sessionId) {
      await SessionService.touchSession(rotated.sessionId).catch(() => undefined);
    }
    setAccessCookie(res, pair.accessToken);
    setRefreshCookie(res, pair.refreshToken);
    const csrf = await issueCsrfToken(res, req, rotated.sessionId);
    res.json({
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      csrfToken: csrf,
      expiresIn: pair.accessExpiresIn,
      mustChangePassword: Boolean(user.mustChangePassword),
    });
  } catch (error: any) {
    if (error instanceof RefreshReuseError) {
      clearAuthCookies(res);
      await SessionService.revokeAllUserSessions(error.userId, 'SECURITY_INCIDENT').catch(() => undefined);
      await raiseSecurityAlert({
        title: 'Refresh token reuse detected — sessions revoked',
        message: `A spent refresh token was presented for user ${error.userId} from ${ipOf(req)}. The whole token family was revoked and the user must sign in again.`,
        event: {
          type: 'SESSION_HIJACK_ATTEMPT',
          severity: 'CRITICAL',
          userId: error.userId,
          ipAddress: ipOf(req),
          riskScore: 90,
          details: { familyId: error.familyId },
        },
      });
      res.status(401).json({ error: 'Invalid session', message: 'Your session was ended for security reasons.' });
      return;
    }
    clearAuthCookies(res);
    res.status(401).json({ error: 'Invalid session', message: 'Please sign in again.' });
  }
});

// ---------------------------------------------------------------------------
// Session status and idle extension (drives the warning modal)
// ---------------------------------------------------------------------------

router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  const session = req.user?.sessionId ? await SessionService.peekSession(req.user.sessionId) : null;

  // Re-bind the CSRF token on every poll. The guard compares a readable cookie
  // against a server-side binding, and that binding is lost whenever the API
  // restarts with the in-process store (or the cookie is cleared while the
  // database session survives) — at which point every POST, PUT and DELETE
  // fails with CSRF_FAILED and the user has no way to recover short of signing
  // out. This endpoint is already called on a timer by SessionGuard, so
  // re-issuing here makes that dead end self-healing. issueCsrfToken reuses the
  // value already in the cookie, so a healthy session sees no churn.
  const csrfToken = await issueCsrfToken(res, req, req.user?.sessionId ?? null);

  res.json({
    authenticated: true,
    user: {
      id: req.user!.id,
      email: req.user!.email,
      fullName: req.user!.fullName,
      role: req.user!.role,
      loginId: req.user!.loginId ?? null,
    },
    mustChangePassword: Boolean(req.user!.mustChangePassword),
    passwordExpiresAt: req.user!.passwordExpiresAt ?? null,
    sessionId: req.user!.sessionId ?? null,
    csrfToken,
    idleTimeoutSeconds: securityConfig.session.idleTimeoutSeconds,
    absoluteTimeoutSeconds: securityConfig.session.absoluteTimeoutSeconds,
    warningSeconds: securityConfig.session.warningSeconds,
    expiresAt: session?.expiresAt ?? null,
    idleExpiresAt: session?.idleExpiresAt ?? null,
    serverTime: new Date().toISOString(),
  });
});

/** "Stay signed in" — extends the idle deadline, never the absolute one. */
router.post('/extend', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.sessionId) {
      res.status(400).json({ error: 'No session', message: 'Sign in again to continue.' });
      return;
    }
    const extended = await SessionService.extendIdle(req.user.sessionId);
    res.json({
      idleExpiresAt: extended.idleExpiresAt,
      expiresAt: extended.expiresAt,
      idleTimeoutSeconds: securityConfig.session.idleTimeoutSeconds,
    });
  } catch (error: any) {
    fail(res, error, 'Could not extend the session');
  }
});

// ---------------------------------------------------------------------------
// Self-service password change
// ---------------------------------------------------------------------------

router.post('/password/change', sensitiveRateLimit, authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await changeOwnPassword(
      req.user!.id,
      { currentPassword: String(req.body?.currentPassword || ''), newPassword: String(req.body?.newPassword || '') },
      { sessionId: req.user!.sessionId, ip: ipOf(req), userAgent: uaOf(req) }
    );
    // The password changed, so this session's tokens are already invalid.
    clearAuthCookies(res);
    res.json({
      message: 'Password updated. Please sign in again with your new password.',
      signedOut: true,
    });
  } catch (error: any) {
    fail(res, error, error?.message || 'Could not change your password');
  }
});

/**
 * Strength meter for the change-password screen. The server is the only copy of
 * the policy, so the UI mirrors it rather than re-implementing the rules — and
 * this is available to any signed-in user, unlike the Admin's credential
 * preview which additionally checks the login ID and name of the target.
 */
router.post('/password/evaluate', authenticate, async (req: AuthRequest, res: Response) => {
  const result = evaluate(String(req.body?.password || ''), {
    loginId: req.user!.loginId ?? null,
    fullName: req.user!.fullName,
    email: req.user!.email,
  });
  res.json({
    ...result,
    minLength: securityConfig.password.minLength,
    historyCount: securityConfig.password.historyCount,
    expiryDays: securityConfig.password.expiryDays,
  });
});

// ---------------------------------------------------------------------------
// Cookie consent
// ---------------------------------------------------------------------------

router.get('/consent', async (req: Request, res: Response) => {
  res.json(await readConsent(req, visitorId(req, res)));
});

router.post('/consent', async (req: Request, res: Response) => {
  try {
    const saved = await saveConsent(req, res, visitorId(req, res), req.body || {}, (req as AuthRequest).user?.id);
    res.json(saved);
  } catch (error: any) {
    fail(res, error, 'Could not save your consent choice');
  }
});

// ---------------------------------------------------------------------------
// JWKS
// ---------------------------------------------------------------------------

router.get('/jwks.json', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ keys: await getJwks() });
});

export default router;

/** Public alias so standard JWT libraries can be pointed at the well-known URL. */
export async function jwksHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ keys: await getJwks() });
}

export { verifyCaptcha };
