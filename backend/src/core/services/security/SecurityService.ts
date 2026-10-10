/**
 * SecurityService — Login tracking, brute-force protection,
 * account lockout, and security event detection.
 */
import { Pool } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;   // 15 min lockout
const BRUTE_FORCE_WINDOW_MS = 15 * 60 * 1000; // 15 min window
const IP_RATE_LIMIT = 20;                      // max failed per IP in window

export type SecurityEventType =
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

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export class SecurityService {
  constructor(private readonly pool: Pool) {}

  // ─── Login Attempt Tracking ─────────────────────────────────────────
  async recordLoginAttempt(params: {
    email: string;
    ipAddress: string;
    userAgent: string;
    success: boolean;
    failureReason?: string;
    userId?: string;
    locationId?: string;
    deviceFingerprint?: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO login_attempt
        (id, email, ipAddress, userAgent, success, failureReason, userId, locationId, deviceFingerprint, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        uuid(),
        params.email,
        params.ipAddress,
        params.userAgent,
        params.success ? 1 : 0,
        params.failureReason || null,
        params.userId || null,
        params.locationId || null,
        params.deviceFingerprint || null,
      ],
    );
  }

  // ─── Account Lockout ────────────────────────────────────────────────
  async checkAccountLocked(userId: string): Promise<{ locked: boolean; lockedUntil?: Date }> {
    const [rows] = await this.pool.query(
      'SELECT lockedUntil, failedLoginAttempts FROM `user` WHERE id = ?',
      [userId],
    ) as any;

    if (!rows.length) return { locked: false };
    const user = rows[0];

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return { locked: true, lockedUntil: new Date(user.lockedUntil) };
    }

    return { locked: false };
  }

  async incrementFailedAttempts(userId: string): Promise<{ locked: boolean; attempts: number }> {
    // Increment counter
    await this.pool.query(
      `UPDATE \`user\` SET
        failedLoginAttempts = failedLoginAttempts + 1,
        lastFailedLoginAt = NOW(3)
       WHERE id = ?`,
      [userId],
    );

    // Check if lockout threshold reached
    const [rows] = await this.pool.query(
      'SELECT failedLoginAttempts FROM `user` WHERE id = ?',
      [userId],
    ) as any;

    const attempts = rows[0]?.failedLoginAttempts || 0;

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await this.pool.query(
        'UPDATE `user` SET lockedUntil = ? WHERE id = ?',
        [lockedUntil, userId],
      );

      // Raise security event
      await this.createSecurityEvent({
        type: 'BRUTE_FORCE',
        severity: 'HIGH',
        userId,
        details: { attempts, lockoutMinutes: LOCKOUT_DURATION_MS / 60000 },
      });

      return { locked: true, attempts };
    }

    return { locked: false, attempts };
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE `user` SET failedLoginAttempts = 0, lockedUntil = NULL, lastFailedLoginAt = NULL WHERE id = ?',
      [userId],
    );
  }

  // ─── IP-based Rate Check ─────────────────────────────────────────────
  async isIpRateLimited(ipAddress: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) as cnt FROM login_attempt
       WHERE ipAddress = ? AND success = 0
       AND createdAt > DATE_SUB(NOW(3), INTERVAL ? SECOND)`,
      [ipAddress, BRUTE_FORCE_WINDOW_MS / 1000],
    ) as any;

    return (rows[0]?.cnt || 0) >= IP_RATE_LIMIT;
  }

  // ─── Security Events ─────────────────────────────────────────────────
  async createSecurityEvent(params: {
    type: SecurityEventType;
    severity: SecuritySeverity;
    userId?: string;
    ipAddress?: string;
    locationId?: string;
    deviceId?: string;
    details: Record<string, any>;
    riskScore?: number;
  }): Promise<string> {
    const id = uuid();
    await this.pool.query(
      `INSERT INTO security_event
        (id, type, severity, userId, ipAddress, locationId, deviceId, details, riskScore, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        id,
        params.type,
        params.severity,
        params.userId || null,
        params.ipAddress || null,
        params.locationId || null,
        params.deviceId || null,
        JSON.stringify(params.details),
        params.riskScore || 0,
      ],
    );
    return id;
  }

  // ─── Security Dashboard Queries ────────────────────────────────────
  async getRecentLoginAttempts(options: {
    userId?: string;
    email?: string;
    limit?: number;
    offset?: number;
    success?: boolean;
  }): Promise<{ attempts: any[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.userId) {
      conditions.push('userId = ?');
      params.push(options.userId);
    }
    if (options.email) {
      conditions.push('email = ?');
      params.push(options.email);
    }
    if (options.success !== undefined) {
      conditions.push('success = ?');
      params.push(options.success ? 1 : 0);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = Math.min(options.limit || 50, 200);
    const offset = options.offset || 0;

    const [rows] = await this.pool.query(
      `SELECT * FROM login_attempt ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ) as any;

    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) as total FROM login_attempt ${where}`,
      params,
    ) as any;

    return { attempts: rows, total: countRows[0]?.total || 0 };
  }

  async getSecurityEvents(options: {
    type?: SecurityEventType;
    severity?: SecuritySeverity;
    acknowledged?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ events: any[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }
    if (options.acknowledged !== undefined) {
      conditions.push('acknowledged = ?');
      params.push(options.acknowledged ? 1 : 0);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = Math.min(options.limit || 50, 200);
    const offset = options.offset || 0;

    const [rows] = await this.pool.query(
      `SELECT * FROM security_event ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ) as any;

    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) as total FROM security_event ${where}`,
      params,
    ) as any;

    return { events: rows, total: countRows[0]?.total || 0 };
  }

  async acknowledgeSecurityEvent(eventId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE security_event SET acknowledged = 1, acknowledgedById = ?, acknowledgedAt = NOW(3), updatedAt = NOW(3)
       WHERE id = ?`,
      [userId, eventId],
    );
  }

  async resolveSecurityEvent(
    eventId: string,
    userId: string,
    notes: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE security_event SET
        resolved = 1, resolvedById = ?, resolvedAt = NOW(3),
        resolutionNotes = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      [userId, notes, eventId],
    );
  }

  /** Get summary counts for the security dashboard */
  async getDashboardSummary(): Promise<{
    totalEvents: number;
    unresolvedEvents: number;
    criticalEvents: number;
    failedLoginsLast24h: number;
    activeSessions: number;
    lockedAccounts: number;
  }> {
    const [eventRows] = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved,
        SUM(CASE WHEN severity = 'CRITICAL' AND resolved = 0 THEN 1 ELSE 0 END) as critical
       FROM security_event`,
    ) as any;

    const [loginRows] = await this.pool.query(
      `SELECT COUNT(*) as cnt FROM login_attempt
       WHERE success = 0 AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    ) as any;

    const [sessionRows] = await this.pool.query(
      'SELECT COUNT(*) as cnt FROM session WHERE revoked = 0 AND expiresAt > NOW()',
    ) as any;

    const [lockedRows] = await this.pool.query(
      'SELECT COUNT(*) as cnt FROM `user` WHERE lockedUntil IS NOT NULL AND lockedUntil > NOW()',
    ) as any;

    const ev = eventRows[0] || {};
    return {
      totalEvents: Number(ev.total || 0),
      unresolvedEvents: Number(ev.unresolved || 0),
      criticalEvents: Number(ev.critical || 0),
      failedLoginsLast24h: Number(loginRows[0]?.cnt || 0),
      activeSessions: Number(sessionRows[0]?.cnt || 0),
      lockedAccounts: Number(lockedRows[0]?.cnt || 0),
    };
  }
}
