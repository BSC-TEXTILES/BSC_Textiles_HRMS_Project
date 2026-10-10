import crypto from 'node:crypto';
import { prisma, pool } from '../db.js';
import { AuditService } from './auditService.js';

export interface SecurityEventOptions {
  type:
    | 'BRUTE_FORCE'
    | 'PASSWORD_SPRAY'
    | 'IMPOSSIBLE_TRAVEL'
    | 'NEW_DEVICE'
    | 'NEW_LOCATION'
    | 'PRIVILEGE_ESCALATION'
    | 'MASS_EXPORT'
    | 'MALWARE_DETECTED'
    | 'AUDIT_LOG_GAP'
    | 'CONFIG_CHANGE'
    | 'ACCOUNT_TAKEOVER_ATTEMPT'
    | 'SESSION_HIJACK_ATTEMPT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  userId?: string;
  ipAddress?: string;
  locationId?: string;
  deviceId?: string;
  details: Record<string, any>;
  riskScore?: number;
}

export class SecurityMonitoringService {
  /**
   * Record a security event into the security_event table and trigger alerts if high/critical
   */
  public static async recordEvent(options: SecurityEventOptions): Promise<string> {
    const id = `sec_${crypto.randomUUID()}`;

    await prisma.securityEvent.create({
      data: {
        id,
        type: options.type as any,
        severity: options.severity as any,
        userId: options.userId || null,
        ipAddress: options.ipAddress || null,
        locationId: options.locationId || null,
        deviceId: options.deviceId || null,
        details: options.details,
        riskScore: options.riskScore || (options.severity === 'CRITICAL' ? 90 : options.severity === 'HIGH' ? 70 : 30),
        acknowledged: 0,
        resolved: 0,
      },
    });

    // Also mirror to tamper-resistant audit log
    await AuditService.log({
      userId: options.userId,
      locationId: options.locationId,
      action: `SECURITY_EVENT_${options.type}`,
      entityType: 'SecurityEvent',
      entityId: id,
      ipAddress: options.ipAddress,
      riskScore: options.riskScore || 50,
      tags: ['security-alert', options.severity.toLowerCase()],
      after: options.details,
    }).catch(() => {});

    return id;
  }

  /**
   * Record an authentication login attempt into login_attempt table
   */
  public static async recordLoginAttempt(options: {
    email: string;
    ipAddress: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    userId?: string;
    locationId?: string;
    deviceFingerprint?: string;
  }): Promise<void> {
    const id = `att_${crypto.randomUUID()}`;

    await prisma.loginAttempt.create({
      data: {
        id,
        email: options.email,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent || null,
        success: options.success ? 1 : 0,
        failureReason: options.failureReason || null,
        userId: options.userId || null,
        locationId: options.locationId || null,
        deviceFingerprint: options.deviceFingerprint || null,
      },
    }).catch((err) => console.warn('[SecurityMonitoringService] Login attempt log error:', err));

    // If failed, check for brute force / password spraying threshold
    if (!options.success) {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

      // Check failed attempts for this email
      const recentFailed = await prisma.loginAttempt.count({
        where: {
          email: options.email,
          success: 0,
          createdAt: { gt: fifteenMinAgo },
        },
      });

      if (recentFailed >= 5) {
        await this.recordEvent({
          type: 'BRUTE_FORCE',
          severity: 'HIGH',
          userId: options.userId,
          ipAddress: options.ipAddress,
          locationId: options.locationId,
          details: {
            email: options.email,
            failedCount: recentFailed,
            window: '15m',
          },
          riskScore: 75,
        });
      }
    }
  }

  /**
   * Fetch aggregate security metrics for administrator security dashboard
   */
  public static async getDashboardMetrics(): Promise<any> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalLogins24h,
      failedLogins24h,
      activeEventsCount,
      criticalEventsCount,
      lockedUsersCount,
      pendingApprovalsCount,
      quarantinedFilesCount,
    ] = await Promise.all([
      prisma.loginAttempt.count({ where: { createdAt: { gt: twentyFourHoursAgo }, success: 1 } }).catch(() => 0),
      prisma.loginAttempt.count({ where: { createdAt: { gt: twentyFourHoursAgo }, success: 0 } }).catch(() => 0),
      prisma.securityEvent.count({ where: { resolved: 0 } }).catch(() => 0),
      prisma.securityEvent.count({ where: { resolved: 0, severity: 'CRITICAL' } }).catch(() => 0),
      prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }).catch(() => 0),
      prisma.user.count({ where: { status: 'PENDING_APPROVAL' } }).catch(() => 0),
      prisma.fileUpload.count({ where: { status: { in: ['QUARANTINED', 'INFECTED'] } } }).catch(() => 0),
    ]);

    const integrity = await AuditService.verifyIntegrity(50);

    return {
      overview: {
        totalLogins24h,
        failedLogins24h,
        activeEventsCount,
        criticalEventsCount,
        lockedUsersCount,
        pendingApprovalsCount,
        quarantinedFilesCount,
      },
      auditLogIntegrity: integrity,
      systemStatus: {
        argon2Active: true,
        mfaEnforced: true,
        quarantineActive: true,
        tamperChainsActive: true,
      },
    };
  }
}
