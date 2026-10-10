/**
 * SessionService — Server-side session management with revocation,
 * idle timeout, and device fingerprinting.
 */
import crypto from 'node:crypto';
import { Pool } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;   // 12 hours
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;        // 30 min idle
const MAX_SESSIONS_PER_USER = 5;

export interface SessionRecord {
  id: string;
  userId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  locationId: string | null;
  mfaVerified: boolean;
  riskScore: number;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

export class SessionService {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a new server-side session. Evicts oldest sessions if the user
   * exceeds the maximum concurrent session count.
   */
  async createSession(params: {
    userId: string;
    ipAddress: string;
    userAgent: string;
    locationId?: string | null;
    mfaVerified?: boolean;
  }): Promise<SessionRecord> {
    const id = uuid();
    const deviceId = this.fingerprint(params.userAgent, params.ipAddress);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    await this.pool.query(
      `INSERT INTO session
        (id, userId, deviceId, ipAddress, userAgent, locationId, mfaVerified, riskScore, createdAt, lastActivityAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        id,
        params.userId,
        deviceId,
        params.ipAddress,
        params.userAgent,
        params.locationId || null,
        params.mfaVerified ? 1 : 0,
        now,
        now,
        expiresAt,
      ],
    );

    // Evict excess sessions (keep newest MAX_SESSIONS_PER_USER)
    await this.pool.query(
      `UPDATE session SET revoked = 1, revokedAt = NOW(3), revokedReason = 'SESSION_LIMIT'
       WHERE userId = ? AND revoked = 0 AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM session WHERE userId = ? AND revoked = 0
           ORDER BY createdAt DESC LIMIT ?
         ) AS keep
       )`,
      [params.userId, params.userId, MAX_SESSIONS_PER_USER],
    );

    // Record device fingerprint
    await this.upsertDeviceFingerprint(params.userId, deviceId, params.ipAddress, params.userAgent);

    return {
      id,
      userId: params.userId,
      deviceId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      locationId: params.locationId || null,
      mfaVerified: params.mfaVerified || false,
      riskScore: 0,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      revoked: false,
    };
  }

  /**
   * Validate a session. Returns the session if it is active, not expired,
   * not idle-timed-out, and not revoked. Also updates lastActivityAt.
   */
  async validateSession(sessionId: string): Promise<SessionRecord | null> {
    const [rows] = await this.pool.query(
      'SELECT * FROM session WHERE id = ? AND revoked = 0',
      [sessionId],
    ) as any;

    if (!rows.length) return null;
    const row = rows[0];

    const now = new Date();
    if (new Date(row.expiresAt) < now) {
      await this.revokeSession(sessionId, 'SESSION_EXPIRED');
      return null;
    }

    // Idle timeout
    const lastActivity = new Date(row.lastActivityAt);
    if (now.getTime() - lastActivity.getTime() > IDLE_TIMEOUT_MS) {
      await this.revokeSession(sessionId, 'SESSION_EXPIRED');
      return null;
    }

    // Touch — update lastActivityAt
    await this.pool.query(
      'UPDATE session SET lastActivityAt = NOW(3) WHERE id = ?',
      [sessionId],
    );

    return this.mapRow(row);
  }

  /** Revoke a single session */
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE session SET revoked = 1, revokedAt = NOW(3), revokedReason = ?
       WHERE id = ? AND revoked = 0`,
      [reason, sessionId],
    );
  }

  /** Revoke ALL sessions for a user (password change, security incident, etc.) */
  async revokeAllUserSessions(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    let sql = `UPDATE session SET revoked = 1, revokedAt = NOW(3), revokedReason = ?
               WHERE userId = ? AND revoked = 0`;
    const params: any[] = [reason, userId];
    if (exceptSessionId) {
      sql += ' AND id != ?';
      params.push(exceptSessionId);
    }
    const [result] = await this.pool.query(sql, params) as any;
    return result.affectedRows;
  }

  /** List active sessions for a user (for the security dashboard) */
  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const [rows] = await this.pool.query(
      `SELECT * FROM session WHERE userId = ? AND revoked = 0
       AND expiresAt > NOW(3) ORDER BY lastActivityAt DESC`,
      [userId],
    ) as any;
    return rows.map((r: any) => this.mapRow(r));
  }

  /** Check if this is a new device for the user */
  async isNewDevice(userId: string, userAgent: string, ipAddress: string): Promise<boolean> {
    const deviceId = this.fingerprint(userAgent, ipAddress);
    const [rows] = await this.pool.query(
      'SELECT id FROM device_fingerprint WHERE userId = ? AND fingerprint = ?',
      [userId, deviceId],
    ) as any;
    return rows.length === 0;
  }

  /** Clean up expired sessions (call periodically) */
  async cleanupExpired(): Promise<number> {
    const [result] = await this.pool.query(
      `DELETE FROM session WHERE expiresAt < NOW(3) AND revoked = 1`,
    ) as any;
    return result.affectedRows;
  }

  // ─── Private Helpers ────────────────────────────────────────────────
  private fingerprint(userAgent: string, ipAddress: string): string {
    return crypto
      .createHash('sha256')
      .update(`${userAgent}::${ipAddress}`)
      .digest('hex')
      .slice(0, 32);
  }

  private async upsertDeviceFingerprint(
    userId: string,
    fingerprint: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_fingerprint (id, userId, fingerprint, userAgent, ipAddress, createdAt, lastSeenAt)
       VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE lastSeenAt = NOW(3), ipAddress = VALUES(ipAddress)`,
      [uuid(), userId, fingerprint, userAgent, ipAddress],
    );
  }

  private mapRow(row: any): SessionRecord {
    return {
      id: row.id,
      userId: row.userId,
      deviceId: row.deviceId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      locationId: row.locationId,
      mfaVerified: !!row.mfaVerified,
      riskScore: row.riskScore,
      createdAt: new Date(row.createdAt),
      lastActivityAt: new Date(row.lastActivityAt),
      expiresAt: new Date(row.expiresAt),
      revoked: !!row.revoked,
    };
  }
}
