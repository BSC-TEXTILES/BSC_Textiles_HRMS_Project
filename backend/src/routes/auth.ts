import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';
import { PasswordService } from '../services/passwordService.js';
import { MfaService } from '../services/mfaService.js';
import { SessionService } from '../services/sessionService.js';
import { RegistrationService } from '../services/registrationService.js';
import { AuditService } from '../services/auditService.js';
import { authCriticalLimiter, authSensitiveLimiter } from '../middleware/rateLimiting.js';
import { setCsrfTokenCookie } from '../middleware/csrfProtection.js';
import { sensitiveRateLimit, clientIpOf } from '../middleware/securityGuards.js';
import { securityConfig } from '../config/security.js';
import {
  performLogin,
  exchangeMfaChallenge,
  type LoginRequest,
} from '../services/authentication.js';
import { changeOwnPassword } from '../services/credentials.js';
import {
  clearAuthCookies,
  issueCsrfToken,
  readAccessToken,
  readRefreshToken,
  setAccessCookie,
  setRefreshCookie,
} from '../services/authCookies.js';
import {
  issueFromFamily,
  revokeAccessToken,
  revokeAllUserTokens,
  rotateRefreshToken,
  verifyAccessToken,
  RefreshReuseError,
} from '../services/tokenService.js';
import { raiseSecurityAlert } from '../services/securityAlerts.js';
import { storeGet } from '../services/redisStore.js';
import { container } from '../core/container/ServiceContainer.js';

const router = Router();

/**
 * GET /api/auth/csrf-token
 * Provide CSRF token for web clients
 */
router.get('/csrf-token', (req, res) => {
  const token = setCsrfTokenCookie(req, res);
  res.json({ csrfToken: token });
});

/**
 * POST /api/auth/login
 *
 * Legacy bearer endpoint, kept for the mobile app and the device connector.
 * The accept/reject decision is not duplicated here: it lives in
 * `performLogin`, so a locked account, a missing CAPTCHA or a wrong password
 * behaves identically no matter which route a client uses. The response keeps
 * its historical `token` field and additionally sets the HttpOnly cookies the
 * browser flow relies on.
 */
router.post('/login', sensitiveRateLimit, validate(schemas.login), async (req: AuthRequest, res) => {
  const ipAddress = clientIpOf(req);
  const userAgent = String(req.headers['user-agent'] || 'Unknown Device').slice(0, 255);

  try {
    const outcome = await performLogin({
      identifier: String(req.body?.identifier ?? req.body?.email ?? ''),
      password: String(req.body?.password ?? ''),
      captchaId: req.body?.captchaId,
      captchaAnswer: req.body?.captchaAnswer,
      ip: ipAddress,
      userAgent,
    });

    if (outcome.status === 'mfa_required') {
      return res.status(202).json({
        mfaRequired: true,
        challengeId: outcome.sessionId,
        message: 'MFA verification required to complete sign-in',
        methods: ['totp', 'backup_code'],
      });
    }

    if ((outcome.status !== 'success' && outcome.status !== 'password_expired') || !outcome.tokens || !outcome.user) {
      const locked = outcome.status === 'locked';
      if (outcome.retryAfterSeconds) res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
      return res.status(locked ? 429 : 401).json({
        error: locked ? 'Account temporarily locked' : 'Invalid credentials',
        message: outcome.message || 'Invalid credentials',
        locked,
        retryAfterSeconds: outcome.retryAfterSeconds ?? 0,
        captchaRequired: Boolean(outcome.captchaRequired),
      });
    }

    setAccessCookie(res, outcome.tokens.accessToken);
    setRefreshCookie(res, outcome.tokens.refreshToken);
    const csrfToken = await issueCsrfToken(res, req, outcome.sessionId ?? null);

    // `token` is the access token: short-lived, and the mobile client refreshes
    // it through /auth/refresh exactly like the browser does.
    res.json({
      user: {
        id: outcome.user.id,
        email: outcome.user.email,
        fullName: outcome.user.fullName,
        role: outcome.user.role,
        permissions: outcome.user.permissions,
        locationId: outcome.user.locationId,
        employeeId: outcome.user.employeeId,
      },
      token: outcome.tokens.accessToken,
      refreshToken: outcome.tokens.refreshToken,
      expiresIn: outcome.tokens.accessExpiresIn,
      sessionId: outcome.sessionId,
      csrfToken,
      mustChangePassword: Boolean(outcome.mustChangePassword),
      passwordExpired: outcome.status === 'password_expired',
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', message: 'Unable to sign in right now.' });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Completes a second-factor challenge started by /login.
 */
router.post('/mfa/verify', sensitiveRateLimit, async (req, res) => {
  const ipAddress = clientIpOf(req);
  const userAgent = String(req.headers['user-agent'] || 'Unknown Device').slice(0, 255);

  try {
    const challengeId = String(req.body?.challengeId || req.body?.tempToken || '');
    const code = String(req.body?.code || '');
    const raw = await storeGet(`sess:mfa:${challengeId}`);
    if (!raw) {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Your verification step expired. Sign in again.' });
    }
    const challenge = JSON.parse(raw);
    const verified = await MfaService.verifyChallenge(challenge.userId, code);
    if (!verified.success) {
      await raiseSecurityAlert({
        title: 'Failed second-factor attempt',
        message: `An incorrect authenticator code was submitted for ${challenge.userId} from ${ipAddress}.`,
        event: { type: 'ACCOUNT_TAKEOVER_ATTEMPT', severity: 'MEDIUM', userId: challenge.userId, ipAddress, riskScore: 55, details: {} },
      });
      return res.status(401).json({ error: 'Invalid credentials', message: 'That code is not valid right now.' });
    }

    const outcome = await exchangeMfaChallenge(challengeId, challenge.userId, ipAddress, userAgent);
    if (outcome.status !== 'success' || !outcome.tokens || !outcome.user) {
      return res.status(401).json({ error: 'Invalid credentials', message: outcome.message || 'Verification failed.' });
    }

    setAccessCookie(res, outcome.tokens.accessToken);
    setRefreshCookie(res, outcome.tokens.refreshToken);
    const csrfToken = await issueCsrfToken(res, req, outcome.sessionId ?? null);
    res.json({
      user: outcome.user,
      token: outcome.tokens.accessToken,
      refreshToken: outcome.tokens.refreshToken,
      expiresIn: outcome.tokens.accessExpiresIn,
      sessionId: outcome.sessionId,
      csrfToken,
      mustChangePassword: Boolean(outcome.mustChangePassword),
    });
  } catch (error: any) {
    console.error('MFA verify error:', error);
    res.status(500).json({ error: 'MFA verification failed', message: 'Unable to verify your code right now.' });
  }
});

/**
 * POST /api/auth/register
 *
 * Self-registration is refused by default: accounts and credentials are created
 * by an Admin, which is the control requirement 1 asks for. The service layer
 * behind this stays in place for the HR onboarding flow, and
 * ALLOW_SELF_REGISTRATION=true re-enables the endpoint.
 */
router.post('/register', authCriticalLimiter, validate(schemas.register), async (req: AuthRequest, res) => {
  if (!securityConfig.login.allowSelfRegistration) {
    return res.status(403).json({
      error: 'Self-registration is disabled',
      message: 'Accounts are created by an administrator. Please contact HR or IT.',
      code: 'SELF_REGISTRATION_DISABLED',
    });
  }
  try {
    const result = await RegistrationService.registerUser(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
});

/**
 * GET /api/auth/verify-email
 * Process email verification link
 */
router.get('/verify-email', authSensitiveLimiter, async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const result = await RegistrationService.verifyEmail(token);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      message: result.message,
      user: result.user,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Email verification failed', message: error.message });
  }
});

/**
 * GET /api/auth/pending-approvals
 * HR View: List registrations pending review
 */
router.get('/pending-approvals', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE'), async (req: AuthRequest, res) => {
  try {
    const pending = await RegistrationService.getPendingApprovals();
    res.json({ pendingApprovals: pending });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch pending approvals', message: error.message });
  }
});

/**
 * POST /api/auth/approve/:userId
 * HR Action: Approve account registration
 */
router.post('/approve/:userId', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { role, permissions } = req.body;

    const approvedUser = await RegistrationService.approveRegistration(userId, req.user!.id, role, permissions);

    await AuditService.log({
      userId: req.user!.id,
      locationId: approvedUser.locationId,
      action: 'APPROVE_USER_REGISTRATION',
      entityType: 'User',
      entityId: userId,
      ipAddress: req.ip,
      tags: ['hr-approval', 'user-lifecycle'],
      after: { approvedBy: req.user!.id, role: approvedUser.role, status: 'ACTIVE' },
    });

    // Publish notification for account approval
    await container.notificationService.publishEvent({
      eventId: 'AUTH.APPROVED',
      title: 'Account Approved',
      message: `Account for ${approvedUser.fullName} (${approvedUser.email}) has been approved with role ${approvedUser.role}.`,
      type: 'INFO',
      severity: 'MEDIUM',
      entityType: 'user',
      entityId: userId,
      locationId: approvedUser.locationId,
      actionUrl: '/auth/login',
      correlationId: `auth_approved_${userId}`,
      metadata: { role: approvedUser.role, approvedBy: req.user!.id },
    });

    res.json({ message: 'User approved successfully', user: approvedUser });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Approval failed' });
  }
});

/**
 * POST /api/auth/reject/:userId
 * HR Action: Reject account registration
 */
router.post('/reject/:userId', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const rejectedUser = await RegistrationService.rejectRegistration(userId, req.user!.id, reason);

    await AuditService.log({
      userId: req.user!.id,
      locationId: rejectedUser.locationId,
      action: 'REJECT_USER_REGISTRATION',
      entityType: 'User',
      entityId: userId,
      ipAddress: req.ip,
      tags: ['hr-rejection', 'user-lifecycle'],
      after: { rejectedBy: req.user!.id, reason },
    });

    // Publish notification for account rejection
    await container.notificationService.publishEvent({
      eventId: 'AUTH.REJECTED',
      title: 'Account Registration Rejected',
      message: `Account registration for ${rejectedUser.fullName} (${rejectedUser.email}) has been rejected. Reason: ${reason}`,
      type: 'WARNING',
      severity: 'HIGH',
      entityType: 'user',
      entityId: userId,
      locationId: rejectedUser.locationId,
      actionUrl: '/admin/registrations',
      correlationId: `auth_rejected_${userId}`,
      metadata: { reason, rejectedBy: req.user!.id },
    });

    res.json({ message: 'Registration rejected', user: rejectedUser });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Rejection failed' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Disabled by design — see /reset-password. ALLOW_PUBLIC_PASSWORD_RESET=true
 * re-enables it, and then only with the rate limiter and single-use token that
 * used to live here.
 */
router.post('/forgot-password', authSensitiveLimiter, async (_req, res) => {
  if (!securityConfig.login.allowPublicPasswordReset) {
    return res.status(410).json({
      error: 'Password reset is administered',
      message: 'There is no self-service password reset. An administrator issues and resets credentials.',
      code: 'PUBLIC_RESET_DISABLED',
    });
  }
  return res.status(501).json({ error: 'Password reset is not configured on this deployment' });
});

/**
 * POST /api/auth/reset-password
 *
 * Public password reset is off: this deployment issues credentials through an
 * Admin, so there is no email-link path for an attacker to phish. The route
 * stays wired (and returns 410 rather than 404) so a stale client learns the
 * flow is gone instead of retrying a missing endpoint.
 */
router.post('/reset-password', authSensitiveLimiter, async (_req, res) => {
  if (!securityConfig.login.allowPublicPasswordReset) {
    return res.status(410).json({
      error: 'Password reset is administered',
      message: 'Password resets are issued by an administrator. Please contact HR or IT to regain access.',
      code: 'PUBLIC_RESET_DISABLED',
    });
  }
  return res.status(501).json({ error: 'Password reset is not configured on this deployment' });
});

/**
 * POST /api/auth/mfa/enroll
 * Start TOTP setup
 */
router.post('/mfa/enroll', authenticate, async (req: AuthRequest, res) => {
  try {
    const details = await MfaService.generateTotpEnrollment(req.user!.id, req.user!.email);
    res.json(details);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to initialize MFA enrollment', message: error.message });
  }
});

/**
 * POST /api/auth/mfa/confirm
 * Complete TOTP setup by verifying first code
 */
router.post('/mfa/confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification code is required' });

    const confirmed = await MfaService.confirmTotpEnrollment(req.user!.id, token);
    if (!confirmed) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    await AuditService.log({
      userId: req.user!.id,
      action: 'MFA_ENROLLED',
      entityType: 'MfaDevice',
      entityId: req.user!.id,
      ipAddress: req.ip,
      tags: ['mfa', 'security'],
    });

    res.json({ message: 'Two-factor authentication successfully enabled' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to confirm MFA', message: error.message });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA (Requires password confirmation)
 */
router.post('/mfa/disable', authenticate, async (req: AuthRequest, res) => {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Password re-authentication required' });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validPassword = await PasswordService.verifyPassword(currentPassword, user.passwordHash);
    if (!validPassword.valid) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    await MfaService.disableMfa(req.user!.id);

    await AuditService.log({
      userId: req.user!.id,
      action: 'MFA_DISABLED',
      entityType: 'MfaDevice',
      entityId: req.user!.id,
      ipAddress: req.ip,
      riskScore: 60,
      tags: ['mfa', 'security-alert'],
    });

    res.json({ message: 'Two-factor authentication disabled' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to disable MFA', message: error.message });
  }
});

/**
 * GET /api/auth/sessions
 * List active user sessions
 */
router.get('/sessions', authenticate, async (req: AuthRequest, res) => {
  try {
    const sessions = await SessionService.getUserSessions(req.user!.id);
    res.json({ sessions, currentSessionId: req.user!.sessionId });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve sessions' });
  }
});

/**
 * POST /api/auth/sessions/:id/revoke
 * Revoke specific session
 */
router.post('/sessions/:id/revoke', authenticate, async (req: AuthRequest, res) => {
  try {
    await SessionService.revokeSession(req.params.id, 'USER_INITIATED_REVOKE');
    res.json({ message: 'Session revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

/**
 * POST /api/auth/logout
 * Revokes the session and the outstanding tokens, then clears the cookies.
 */
router.post('/logout', async (req: AuthRequest, res) => {
  try {
    // This route is intentionally not behind `authenticate` so logout stays
    // idempotent (an expired token must still clear cookies instead of 401ing
    // the user into a loop). The token is therefore verified best-effort here:
    // without it `req.user` is undefined and the session, the access token and
    // every refresh token would silently survive a "successful" logout.
    let userId = req.user?.id || null;
    let sessionId = req.user?.sessionId || null;
    let jti: string | null = null;
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const token = bearer || readAccessToken(req);
    if (token && (!userId || !sessionId)) {
      try {
        const claims = await verifyAccessToken(token);
        userId = userId || claims.sub || null;
        sessionId = sessionId || claims.sid || null;
        jti = claims.jti ?? null;
      } catch {
        /* already invalid — cookies still get cleared below */
      }
    }
    if (sessionId) await SessionService.revokeSession(sessionId, 'LOGOUT').catch(() => undefined);
    if (userId) await revokeAllUserTokens(userId, 'LOGOUT').catch(() => undefined);
    if (userId && jti) {
      await revokeAccessToken(jti, userId, 'LOGOUT', securityConfig.tokens.accessTtlSeconds).catch(() => undefined);
    }
    clearAuthCookies(res);
    await AuditService.log({
      userId: userId || undefined,
      locationId: req.user?.locationId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: userId || undefined,
      ipAddress: clientIpOf(req),
      userAgent: String(req.headers['user-agent'] || 'Client'),
      sessionId: sessionId || undefined,
      tags: ['auth', 'logout'],
    }).catch(() => undefined);
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error);
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile with active permissions and session metadata
 */
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        locationId: true,
        employeeId: true,
        status: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            location: { select: { id: true, name: true, code: true } },
            floor: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            shift: { select: { id: true, name: true, startTime: true, endTime: true } },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * POST /api/auth/refresh
 *
 * Rotates the refresh token: the presented one is spent, a new one is issued in
 * the same family, and presenting a spent token revokes the whole family.
 * Accepts the cookie (browser) or a `refreshToken` body field (mobile).
 */
router.post('/refresh', sensitiveRateLimit, async (req: AuthRequest, res) => {
  const presented = readRefreshToken(req);
  if (!presented) return res.status(401).json({ error: 'Authentication required', code: 'NO_REFRESH_TOKEN' });

  try {
    const rotated = await rotateRefreshToken(presented, { ip: clientIpOf(req), userAgent: String(req.headers['user-agent'] || 'Client') });
    if (!rotated) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Session expired', message: 'Please sign in again.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { id: true, email: true, fullName: true, role: true, permissions: true, locationId: true, employeeId: true, isActive: true, status: true, tokenVersion: true, mfaEnabled: true, mustChangePassword: true },
    });
    if (!user || !user.isActive || (user.status && user.status !== 'ACTIVE')) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Account is not active' });
    }

    const pair = await issueFromFamily(
      { id: user.id, email: user.email, role: user.role, tokenVersion: Number(user.tokenVersion || 0) },
      rotated,
      { ip: clientIpOf(req), userAgent: String(req.headers['user-agent'] || 'Client'), authMethod: user.mfaEnabled ? 'pwd+mfa' : 'pwd' }
    );
    setAccessCookie(res, pair.accessToken);
    setRefreshCookie(res, pair.refreshToken);

    res.json({
      token: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.accessExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions: user.permissions,
        locationId: user.locationId,
        employeeId: user.employeeId,
      },
      mustChangePassword: Boolean(user.mustChangePassword),
    });
  } catch (error: any) {
    if (error instanceof RefreshReuseError) {
      clearAuthCookies(res);
      await SessionService.revokeAllUserSessions(error.userId, 'SECURITY_INCIDENT').catch(() => undefined);
      await raiseSecurityAlert({
        title: 'Refresh token reuse detected',
        message: `A spent refresh token was replayed for user ${error.userId} from ${clientIpOf(req)}. All of that user's sessions were ended.`,
        event: {
          type: 'SESSION_HIJACK_ATTEMPT',
          severity: 'CRITICAL',
          userId: error.userId,
          ipAddress: clientIpOf(req),
          riskScore: 90,
          details: { familyId: error.familyId },
        },
      });
      return res.status(401).json({ error: 'Session ended for security reasons', code: 'TOKEN_REUSE' });
    }
    console.error('Token refresh failed:', error);
    clearAuthCookies(res);
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

/**
 * PUT /api/auth/change-password
 *
 * Delegates to the same service the credential screen uses, so "verify the
 * current password, satisfy the policy, no reuse of the last N, notify the
 * owner and the Admins, sign every session out" is one implementation rather
 * than two that can drift.
 */
router.put('/change-password', authenticate, sensitiveRateLimit, async (req: AuthRequest, res) => {
  try {
    await changeOwnPassword(
      req.user!.id,
      {
        currentPassword: String(req.body?.currentPassword || ''),
        newPassword: String(req.body?.newPassword || ''),
      },
      { sessionId: req.user!.sessionId, ip: clientIpOf(req), userAgent: String(req.headers['user-agent'] || 'Client') }
    );
    clearAuthCookies(res);
    res.json({ message: 'Password updated. Please sign in again with your new password.', signedOut: true });
  } catch (error: any) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500) console.error('Change password error:', error);
    res.status(status).json({
      error: status === 401 ? 'Current password incorrect' : 'Failed to change password',
      message: error?.message || 'Unable to change your password right now.',
      code: error?.code,
    });
  }
});

export default router;