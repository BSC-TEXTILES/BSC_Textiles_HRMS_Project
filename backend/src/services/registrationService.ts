import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { PasswordService } from './passwordService.js';
import { EmailNotificationService } from './emailNotificationService.js';

export interface RegistrationInput {
  email: string;
  password: string;
  fullName: string;
  role?: string;
  locationId?: string;
  employeeId?: string;
}

export class RegistrationService {
  private static readonly TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Submit registration for a new account.
   * Creates user in PENDING_EMAIL_VERIFICATION status and dispatches verification email.
   */
  public static async registerUser(input: RegistrationInput): Promise<{ userId: string; email: string }> {
    const cleanEmail = (input.email || '').trim().toLowerCase();

    // 1. Check uniqueness
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existing) {
      // Security: Throw standard conflict error
      throw new Error('Email is already registered');
    }

    // 2. Validate password strength
    const strength = PasswordService.validateStrength(input.password);
    if (!strength.isValid) {
      throw new Error(`Password policy violation: ${strength.errors.join(', ')}`);
    }

    // 3. Check compromised password
    const isPwned = await PasswordService.checkCompromised(input.password);
    if (isPwned) {
      throw new Error('Password was found in a known data breach. Please choose a different password.');
    }

    // 4. Hash password with Argon2id
    const passwordHash = await PasswordService.hashPassword(input.password);

    // 5. Generate secure verification token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_MS);

    // 6. Create user record
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        fullName: input.fullName,
        role: input.role || 'EMPLOYEE',
        permissions: ['VIEW'],
        locationId: input.locationId || null,
        employeeId: input.employeeId || null,
        status: 'PENDING_EMAIL_VERIFICATION',
        isActive: 0,
        emailVerificationToken: tokenHash,
        emailVerificationExpiresAt: expiresAt,
      },
    });

    // 7. Record password in history
    await PasswordService.recordPasswordHistory(user.id, passwordHash);

    // 8. Dispatch verification email
    await EmailNotificationService.sendEmailVerification({
      to: cleanEmail,
      fullName: input.fullName,
      token: rawToken,
    }).catch((err) => console.error('[RegistrationService] Failed to send verification email:', err));

    return { userId: user.id, email: user.email };
  }

  /**
   * Verify email via the one-time token and transition account to PENDING_APPROVAL
   */
  public static async verifyEmail(rawToken: string): Promise<{ success: boolean; message: string; user?: any }> {
    if (!rawToken) {
      return { success: false, message: 'Invalid verification token' };
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        emailVerificationExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      return { success: false, message: 'Verification link is invalid or has expired' };
    }

    // Transition status to PENDING_APPROVAL
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'PENDING_APPROVAL',
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    // Notify HR of pending approval
    await EmailNotificationService.notifyHrPendingApproval({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        locationId: user.locationId,
      },
    }).catch((err) => console.error('[RegistrationService] HR notification error:', err));

    return {
      success: true,
      message: 'Email successfully verified. Your account is now pending HR review and approval.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: 'PENDING_APPROVAL',
      },
    };
  }

  /**
   * Get all users pending HR approval
   */
  public static async getPendingApprovals(): Promise<any[]> {
    return await prisma.user.findMany({
      where: {
        status: 'PENDING_APPROVAL',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        locationId: true,
        employeeId: true,
        createdAt: true,
        emailVerifiedAt: true,
        location: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve a pending user account
   */
  public static async approveRegistration(
    targetUserId: string,
    approverUserId: string,
    roleOverride?: string,
    permissionsOverride?: string[]
  ): Promise<any> {
    // 1. Prevent self-approval
    if (targetUserId === approverUserId) {
      throw new Error('Self-approval is strictly forbidden by enterprise security policy');
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== 'PENDING_APPROVAL') {
      throw new Error(`Cannot approve account in status '${user.status}'`);
    }

    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        status: 'ACTIVE',
        isActive: 1,
        approvedById: approverUserId,
        approvedAt: now,
        ...(roleOverride ? { role: roleOverride } : {}),
        ...(permissionsOverride ? { permissions: permissionsOverride } : {}),
      },
    });

    // Dispatch approval notification to employee
    await EmailNotificationService.sendAccountApproved({
      to: user.email,
      fullName: user.fullName,
      role: updated.role,
    }).catch((err) => console.error('[RegistrationService] Notification error:', err));

    return updated;
  }

  /**
   * Reject a pending user account
   */
  public static async rejectRegistration(
    targetUserId: string,
    reviewerUserId: string,
    reason: string
  ): Promise<any> {
    if (targetUserId === reviewerUserId) {
      throw new Error('Self-rejection is not allowed');
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        status: 'REJECTED',
        isActive: 0,
        rejectedById: reviewerUserId,
        rejectedAt: now,
        rejectionReason: reason || 'Not specified by HR administrator',
      },
    });

    // Dispatch rejection notification
    await EmailNotificationService.sendAccountRejected({
      to: user.email,
      fullName: user.fullName,
      reason: reason || 'Requirements not met',
    }).catch((err) => console.error('[RegistrationService] Notification error:', err));

    return updated;
  }
}
