import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { authenticate, AuthRequest, generateToken, requireRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';
import { JWT_SECRET } from '../config/env.js';
import { PasswordService } from '../services/passwordService.js';
import { MfaService } from '../services/mfaService.js';
import { SessionService } from '../services/sessionService.js';
import { RegistrationService } from '../services/registrationService.js';
import { EmailNotificationService } from '../services/emailNotificationService.js';
import { SecurityMonitoringService } from '../services/securityMonitoringService.js';
import { AuditService } from '../services/auditService.js';
import { authCriticalLimiter, authSensitiveLimiter } from '../middleware/rateLimiting.js';
import { setCsrfTokenCookie } from '../middleware/csrfProtection.js';

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
 * Enterprise-grade authentication with Argon2id, lockout, session management & MFA
 */
router.post('/login', authCriticalLimiter, validate(schemas.login), async (req: AuthRequest, res) => {
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || 'Unknown Device';

  try {
    const { email, password } = req.body;
    const identifier = (email || '').trim();
    const cleanEmail = identifier.toLowerCase();

    // 1. Look up user by email or employee code
    let user: any = null;
    if (cleanEmail.includes('@')) {
      user = await prisma.user.findUnique({
        where: { email: cleanEmail },
        include: { employee: true },
      });
    } else {
      // Find employee by employee code
      const emp = await prisma.employee.findFirst({
        where: { employeeCode: identifier },
      });
      if (emp) {
        user = await prisma.user.findFirst({
          where: { employeeId: emp.id },
          include: { employee: true },
        });
      }
      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: cleanEmail },
          include: { employee: true },
        });
      }
    }

    // 2. Reject if user does not exist (Generic error to prevent account enumeration)
    if (!user) {
      await SecurityMonitoringService.recordLoginAttempt({
        email: cleanEmail,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'User not found',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Check account lockout
    const lockCheck = await PasswordService.isAccountLocked(user);
    if (lockCheck.locked) {
      await SecurityMonitoringService.recordLoginAttempt({
        email: cleanEmail,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Account locked',
        userId: user.id,
      });
      return res.status(403).json({
        error: 'Account temporarily locked',
        message: `Too many failed login attempts. Please wait ${lockCheck.remainingSeconds} seconds before trying again.`,
      });
    }

    // 4. Verify password (supports Argon2id and legacy bcrypt)
    const verification = await PasswordService.verifyPassword(password, user.passwordHash);

    if (!verification.valid) {
      const lockResult = await PasswordService.recordFailedLogin(user.id);
      await SecurityMonitoringService.recordLoginAttempt({
        email: cleanEmail,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Invalid password',
        userId: user.id,
      });

      if (lockResult.locked) {
        return res.status(403).json({
          error: 'Account temporarily locked',
          message: `Too many failed attempts. Account locked for ${lockResult.remainingSeconds} seconds.`,
        });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 5. Successful password match: Reset failed login count
    await PasswordService.resetFailedLogins(user.id);

    // 6. Transparent Migration: Upgrade legacy bcrypt hash to Argon2id on successful login
    if (verification.isLegacyBcrypt) {
      try {
        const upgradedHash = await PasswordService.hashPassword(password);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: upgradedHash, passwordChangedAt: new Date() },
        });
        await PasswordService.recordPasswordHistory(user.id, upgradedHash);
        console.log(`[Security] Upgraded password hash to Argon2id for user: ${user.email}`);
      } catch (upgradeErr) {
        console.warn('[Security] Failed to upgrade password hash:', upgradeErr);
      }
    }

    // 7. Check account status lifecycle
    if (user.status && user.status !== 'ACTIVE') {
      if (user.status === 'PENDING_EMAIL_VERIFICATION') {
        return res.status(403).json({
          error: 'Email verification required',
          status: user.status,
          message: 'Please verify your email address to activate your account.',
        });
      }
      if (user.status === 'PENDING_APPROVAL') {
        return res.status(403).json({
          error: 'Account pending approval',
          status: user.status,
          message: 'Your account has been submitted and is currently awaiting HR approval.',
        });
      }
      return res.status(403).json({
        error: 'Account suspended or inactive',
        status: user.status,
        message: 'Your account is not active. Please contact HR management.',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // 8. Multi-Factor Authentication Check
    const hasMfaEnabled = await MfaService.isMfaEnabled(user.id);
    const requiresMfa = MfaService.isMfaRequired(user.role);

    if (hasMfaEnabled || user.mfaEnabled) {
      // Issue a short-lived temporary MFA challenge token (valid 5 minutes)
      const mfaTempToken = jwt.sign(
        {
          userId: user.id,
          mfaPending: true,
          iss: 'bsc-textiles-hrms',
        },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '5m' }
      );

      return res.status(202).json({
        mfaRequired: true,
        message: 'MFA verification required to complete sign-in',
        tempToken: mfaTempToken,
        methods: ['totp', 'backup_code'],
      });
    }

    // 9. Create server-side session
    const sessionId = await SessionService.createSession({
      userId: user.id,
      ipAddress,
      userAgent,
      locationId: user.locationId || undefined,
      mfaVerified: false,
      permissions: Array.isArray(user.permissions) ? (user.permissions as string[]) : [],
    });

    // 10. Generate JWT token bound to session
    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        locationId: user.locationId || undefined,
        employeeId: user.employeeId || undefined,
      },
      { sessionId, mfaVerified: false }
    );

    // 11. Record successful login audit & monitoring events
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await SecurityMonitoringService.recordLoginAttempt({
      email: cleanEmail,
      ipAddress,
      userAgent,
      success: true,
      userId: user.id,
      locationId: user.locationId || undefined,
    });

    await AuditService.log({
      userId: user.id,
      locationId: user.locationId || undefined,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
      userAgent,
      sessionId,
      riskScore: 0,
      tags: ['auth', 'login'],
    });

    // 12. Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions: user.permissions,
        locationId: user.locationId,
        employeeId: user.employeeId,
      },
      token,
      sessionId,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', message: error?.message || 'Internal server error' });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Complete 2FA login challenge using TOTP code or Backup code
 */
router.post('/mfa/verify', authCriticalLimiter, async (req, res) => {
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || 'Unknown Device';

  try {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
      return res.status(400).json({ error: 'MFA challenge token and code are required' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'MFA challenge session has expired. Please log in again.' });
    }

    if (!decoded.userId || !decoded.mfaPending) {
      return res.status(401).json({ error: 'Invalid MFA challenge token' });
    }

    // Verify TOTP or backup code
    const challengeResult = await MfaService.verifyChallenge(decoded.userId, code);
    if (!challengeResult.success) {
      await SecurityMonitoringService.recordLoginAttempt({
        email: 'MFA_CHALLENGE',
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Invalid MFA verification code',
        userId: decoded.userId,
      });
      return res.status(401).json({ error: 'Invalid verification code or backup code' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { employee: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Create session with mfaVerified=true
    const sessionId = await SessionService.createSession({
      userId: user.id,
      ipAddress,
      userAgent,
      locationId: user.locationId || undefined,
      mfaVerified: true,
      permissions: Array.isArray(user.permissions) ? (user.permissions as string[]) : [],
    });

    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        locationId: user.locationId || undefined,
        employeeId: user.employeeId || undefined,
      },
      { sessionId, mfaVerified: true }
    );

    await AuditService.log({
      userId: user.id,
      locationId: user.locationId || undefined,
      action: `MFA_LOGIN_SUCCESS_${challengeResult.method.toUpperCase()}`,
      entityType: 'User',
      entityId: user.id,
      ipAddress,
      userAgent,
      sessionId,
      riskScore: 0,
      tags: ['auth', 'mfa'],
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions: user.permissions,
        locationId: user.locationId,
        employeeId: user.employeeId,
      },
      token,
      sessionId,
      verifiedVia: challengeResult.method,
    });
  } catch (error: any) {
    console.error('MFA verify error:', error);
    res.status(500).json({ error: 'MFA verification failed', message: error?.message });
  }
});

/**
 * POST /api/auth/register
 * Register a new employee account (Lifecycle: PENDING_EMAIL_VERIFICATION -> PENDING_APPROVAL -> ACTIVE)
 */
router.post('/register', authCriticalLimiter, validate(schemas.register), async (req: AuthRequest, res) => {
  try {
    const result = await RegistrationService.registerUser(req.body);

    res.status(201).json({
      message: 'Registration submitted successfully. A verification email has been dispatched to your address.',
      email: result.email,
      status: 'PENDING_EMAIL_VERIFICATION',
    });
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

    res.json({ message: 'Registration rejected', user: rejectedUser });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Rejection failed' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request single-use password reset link (Generic response prevents email enumeration)
 */
router.post('/forgot-password', authSensitiveLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (user && user.isActive) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await prisma.passwordResetToken.create({
        data: {
          id: `rst_${crypto.randomUUID()}`,
          userId: user.id,
          tokenHash,
          expiresAt,
          used: 0,
        },
      });

      await EmailNotificationService.sendPasswordReset({
        to: user.email,
        fullName: user.fullName,
        token: rawToken,
      });
    }

    // Generic safe response
    res.json({
      message: 'If an account matches that email address, a password reset link has been dispatched.',
    });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /api/auth/reset-password
 * Complete password reset using single-use token
 */
router.post('/reset-password', authSensitiveLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const resetRecord = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        used: 0,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRecord) {
      return res.status(400).json({ error: 'Password reset link is invalid or has expired' });
    }

    // Validate strength
    const strength = PasswordService.validateStrength(newPassword);
    if (!strength.isValid) {
      return res.status(400).json({ error: `Password policy: ${strength.errors.join(', ')}` });
    }

    // Check breach
    const isPwned = await PasswordService.checkCompromised(newPassword);
    if (isPwned) {
      return res.status(400).json({ error: 'Password was found in a known data breach' });
    }

    // Check history (last 12)
    const inHistory = await PasswordService.isPasswordInHistory(resetRecord.userId, newPassword);
    if (inHistory) {
      return res.status(400).json({ error: 'Cannot reuse any of your last 12 passwords' });
    }

    // Hash with Argon2id
    const passwordHash = await PasswordService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: 0,
      },
    });

    // Mark reset token used
    await prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { used: 1, usedAt: new Date() },
    });

    // Record in history
    await PasswordService.recordPasswordHistory(resetRecord.userId, passwordHash);

    // Revoke all existing sessions
    await SessionService.revokeAllUserSessions(resetRecord.userId, 'PASSWORD_CHANGE');

    const user = await prisma.user.findUnique({ where: { id: resetRecord.userId } });
    if (user) {
      await EmailNotificationService.sendPasswordChangedAlert({
        to: user.email,
        fullName: user.fullName,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Browser',
      });
    }

    res.json({ message: 'Password has been reset successfully. Please sign in with your new password.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to reset password', message: error.message });
  }
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
 * Revoke session and clear cookies
 */
router.post('/logout', async (req: AuthRequest, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
        if (decoded?.sessionId) {
          await SessionService.revokeSession(decoded.sessionId, 'LOGOUT');
        }
        if (decoded?.userId) {
          await AuditService.log({
            userId: decoded.userId,
            action: 'LOGOUT',
            entityType: 'User',
            entityId: decoded.userId,
            ipAddress: req.ip,
          });
        }
      } catch {
        // Token was expired or invalid
      }
    }
  } finally {
    res.clearCookie('token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
    res.json({ message: 'Logged out successfully' });
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
 * Refresh token with rotation
 */
router.post('/refresh', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, role: true, permissions: true, locationId: true, employeeId: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const token = generateToken(user, {
      sessionId: req.user!.sessionId,
      mfaVerified: req.user!.mfaVerified,
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * PUT /api/auth/change-password
 * Change password with Argon2id, history validation, and session revocation
 */
router.put('/change-password', authenticate, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }

    // Validate strength
    const strength = PasswordService.validateStrength(newPassword);
    if (!strength.isValid) {
      return res.status(400).json({ error: `Password policy: ${strength.errors.join(', ')}` });
    }

    // Check breach
    const isPwned = await PasswordService.checkCompromised(newPassword);
    if (isPwned) {
      return res.status(400).json({ error: 'Password was found in a known breach' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await PasswordService.verifyPassword(currentPassword, user.passwordHash);
    if (!validPassword.valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Check history (last 12)
    const inHistory = await PasswordService.isPasswordInHistory(req.user!.id, newPassword);
    if (inHistory) {
      return res.status(400).json({ error: 'Cannot reuse any of your last 12 passwords' });
    }

    const passwordHash = await PasswordService.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: 0,
      },
    });

    await PasswordService.recordPasswordHistory(req.user!.id, passwordHash);

    // Revoke other active sessions
    await SessionService.revokeAllUserSessions(req.user!.id, 'PASSWORD_CHANGE');

    await AuditService.log({
      userId: req.user!.id,
      locationId: req.user!.locationId,
      action: 'PASSWORD_CHANGE_SUCCESS',
      entityType: 'User',
      entityId: req.user!.id,
      ipAddress: req.ip,
      tags: ['auth', 'password'],
    });

    await EmailNotificationService.sendPasswordChangedAlert({
      to: user.email,
      fullName: user.fullName,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'Browser',
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password', message: error.message });
  }
});

export default router;