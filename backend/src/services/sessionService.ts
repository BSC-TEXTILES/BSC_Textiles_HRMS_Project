import crypto from 'node:crypto';
import { prisma, pool } from '../db.js';

export interface CreateSessionOptions {
  userId: string;
  ipAddress: string;
  userAgent: string;
  locationId?: string;
  mfaVerified?: boolean;
  permissions?: string[];
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  session?: any;
}

export class SessionService {
  private static readonly MAX_CONCURRENT_SESSIONS = 3;
  private static readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours

  /**
   * Generate deterministic or semi-random device fingerprint
   */
  public static generateDeviceFingerprint(ipAddress: string, userAgent: string): string {
    return crypto
      .createHash('sha256')
      .update(`${ipAddress}:${userAgent}`)
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Create a new session in the database, evicting oldest if max concurrent limit exceeded
   */
  public static async createSession(options: CreateSessionOptions): Promise<string> {
    const sessionId = `sess_${crypto.randomUUID()}`;
    const deviceId = this.generateDeviceFingerprint(options.ipAddress, options.userAgent);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ABSOLUTE_TIMEOUT_MS);

    // Track device fingerprint in device_fingerprint table
    try {
      const existingFp = await prisma.deviceFingerprint.findFirst({
        where: {
          userId: options.userId,
          fingerprint: deviceId,
        },
      });

      if (!existingFp) {
        await prisma.deviceFingerprint.create({
          data: {
            id: `dfp_${crypto.randomUUID()}`,
            userId: options.userId,
            fingerprint: deviceId,
            userAgent: options.userAgent,
            ipAddress: options.ipAddress,
            trusted: 0,
          },
        });
      } else {
        await prisma.deviceFingerprint.update({
          where: { id: existingFp.id },
          data: {
            lastSeenAt: now,
            ipAddress: options.ipAddress,
          },
        });
      }
    } catch (err) {
      console.warn('[SessionService] Device fingerprint tracking error:', err);
    }

    // Check active sessions and evict oldest if limit exceeded
    try {
      const activeSessions = await prisma.session.findMany({
        where: {
          userId: options.userId,
          revoked: 0,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (activeSessions.length >= this.MAX_CONCURRENT_SESSIONS) {
        const excessCount = activeSessions.length - this.MAX_CONCURRENT_SESSIONS + 1;
        const sessionsToEvict = activeSessions.slice(0, excessCount);

        for (const s of sessionsToEvict) {
          await this.revokeSession(s.id, 'CONCURRENT_LIMIT_EXCEEDED');
        }
      }
    } catch (err) {
      console.warn('[SessionService] Session limit eviction error:', err);
    }

    // Create session record
    await prisma.session.create({
      data: {
        id: sessionId,
        userId: options.userId,
        deviceId,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        locationId: options.locationId || null,
        mfaVerified: options.mfaVerified ? 1 : 0,
        riskScore: 0,
        permissions: options.permissions || [],
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
        revoked: 0,
      },
    });

    return sessionId;
  }

  /**
   * Validate session active status, expiry, and idle timeout
   */
  public static async validateSession(sessionId: string): Promise<SessionValidationResult> {
    if (!sessionId) {
      return { valid: false, reason: 'Session ID missing' };
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (session.revoked) {
      return { valid: false, reason: `Session revoked: ${session.revokedReason || 'Unknown'}` };
    }

    const now = Date.now();

    // Check absolute timeout
    if (new Date(session.expiresAt).getTime() < now) {
      await this.revokeSession(sessionId, 'SESSION_EXPIRED');
      return { valid: false, reason: 'Session expired (absolute timeout)' };
    }

    // Check idle timeout
    const lastActivity = new Date(session.lastActivityAt).getTime();
    if (now - lastActivity > this.IDLE_TIMEOUT_MS) {
      await this.revokeSession(sessionId, 'IDLE_TIMEOUT');
      return { valid: false, reason: 'Session expired (idle timeout)' };
    }

    // Update last activity timestamp
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });

    return { valid: true, session };
  }

  /**
   * Revoke a single session
   */
  public static async revokeSession(sessionId: string, reason: string): Promise<void> {
    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.revoked) return;

      const now = new Date();
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          revoked: 1,
          revokedAt: now,
          revokedReason: reason,
        },
      });

      // Insert into revoked_token blocklist
      const validReasons = new Set([
        'LOGOUT',
        'PASSWORD_CHANGE',
        'MFA_CHANGE',
        'ROLE_CHANGE',
        'ADMIN_REVOKE',
        'SESSION_EXPIRED',
        'SECURITY_INCIDENT',
      ]);
      const normalizedReason = validReasons.has(reason) ? reason : 'ADMIN_REVOKE';

      await prisma.revokedToken.create({
        data: {
          id: `rev_${crypto.randomUUID()}`,
          jti: sessionId,
          userId: session.userId,
          reason: normalizedReason as any,
          expiresAt: session.expiresAt,
        },
      }).catch((err: any) => console.warn('[SessionService] RevokedToken insert warning:', err.message));
    } catch (err) {
      console.error('[SessionService] Revoke session error:', err);
    }
  }

  /**
   * Revoke all active sessions for a user (password change, role change, admin action)
   */
  public static async revokeAllUserSessions(userId: string, reason: string): Promise<void> {
    try {
      const activeSessions = await prisma.session.findMany({
        where: {
          userId,
          revoked: 0,
        },
      });

      for (const s of activeSessions) {
        await this.revokeSession(s.id, reason);
      }
    } catch (err) {
      console.error('[SessionService] Revoke all sessions error:', err);
    }
  }

  /**
   * Check if a token JTI/sessionId is in the revoked blocklist
   */
  public static async isRevoked(jti: string): Promise<boolean> {
    if (!jti) return false;
    const count = await prisma.revokedToken.count({
      where: { jti },
    });
    return count > 0;
  }

  /**
   * List active sessions for user management
   */
  public static async getUserSessions(userId: string): Promise<any[]> {
    return await prisma.session.findMany({
      where: {
        userId,
        revoked: 0,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActivityAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        ipAddress: true,
        userAgent: true,
        mfaVerified: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
      },
    });
  }
}
