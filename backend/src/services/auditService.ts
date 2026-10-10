import crypto from 'node:crypto';
import { prisma, pool } from '../db.js';

export interface AuditLogEntry {
  userId?: string;
  locationId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  sessionId?: string;
  deviceId?: string;
  riskScore?: number;
  tags?: string[];
  before?: any;
  after?: any;
}

export class AuditService {
  private static readonly SENSITIVE_FIELDS = new Set([
    'password',
    'passwordhash',
    'token',
    'secret',
    'credentialid',
    'publickey',
    'backupcodes',
    'emailverificationtoken',
    'tokenhash',
    'refreshtoken',
    'accesstoken',
  ]);

  /**
   * Redact sensitive fields from state snapshots
   */
  public static redactSensitive(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactSensitive(item));
    }

    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (this.SENSITIVE_FIELDS.has(key.toLowerCase())) {
        cleaned[key] = '[REDACTED]';
      } else if (typeof val === 'object' && val !== null) {
        cleaned[key] = this.redactSensitive(val);
      } else {
        cleaned[key] = val;
      }
    }
    return cleaned;
  }

  /**
   * Record a tamper-resistant audit log entry with SHA-256 hash chaining
   */
  public static async log(entry: AuditLogEntry): Promise<string> {
    const id = `aud_${crypto.randomUUID()}`;
    const now = new Date();

    // 1. Fetch previous hash from the latest auditlog entry
    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    try {
      const [latestRows]: any = await pool.query(
        'SELECT hash FROM auditlog WHERE hash IS NOT NULL ORDER BY createdAt DESC LIMIT 1'
      );
      if (latestRows && latestRows.length > 0 && latestRows[0].hash) {
        previousHash = latestRows[0].hash;
      }
    } catch (err) {
      console.warn('[AuditService] Failed to read previous audit hash:', err);
    }

    // 2. Normalize and redact sensitive values
    const userId = entry.userId || '';
    const entityId = entry.entityId || 'SYS_RESOURCE';
    const ipAddress = entry.ipAddress || '127.0.0.1';
    const correlationId = entry.correlationId || '';
    const redactedBefore = entry.before ? this.redactSensitive(entry.before) : null;
    const redactedAfter = entry.after ? this.redactSensitive(entry.after) : null;

    // 3. Compute deterministic SHA-256 hash of this record chained to previousHash
    const payloadToHash = JSON.stringify({
      previousHash,
      id,
      userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId,
      ipAddress,
      correlationId,
    });

    const hash = crypto.createHash('sha256').update(payloadToHash).digest('hex');

    // 4. Insert into database
    await prisma.auditLog.create({
      data: {
        id,
        createdAt: now,
        userId: entry.userId || null,
        locationId: entry.locationId || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId,
        oldValue: redactedBefore,
        newValue: redactedAfter,
        ipAddress,
        userAgent: entry.userAgent || 'Internal System',
        correlationId: correlationId || null,
        sessionId: entry.sessionId || null,
        deviceId: entry.deviceId || null,
        riskScore: entry.riskScore || 0,
        tags: entry.tags || [],
        hash,
        previousHash,
        integrityVerified: 1,
      },
    });

    return id;
  }

  /**
   * Verify the integrity of the audit log hash chain
   */
  public static async verifyIntegrity(limit: number = 100): Promise<{
    valid: boolean;
    recordsChecked: number;
    tamperedId?: string;
  }> {
    try {
      const [rows]: any = await pool.query(
        'SELECT * FROM auditlog WHERE hash IS NOT NULL ORDER BY createdAt ASC LIMIT ?',
        [limit]
      );

      if (!rows || rows.length === 0) {
        return { valid: true, recordsChecked: 0 };
      }

      let expectedPrev = '0000000000000000000000000000000000000000000000000000000000000000';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (i === 0 && row.previousHash) {
          expectedPrev = row.previousHash;
        }

        if (row.previousHash !== expectedPrev) {
          return {
            valid: false,
            recordsChecked: i,
            tamperedId: row.id,
          };
        }

        const payloadToHash = JSON.stringify({
          previousHash: row.previousHash,
          id: row.id,
          userId: row.userId || '',
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId || 'SYS_RESOURCE',
          ipAddress: row.ipAddress || '',
          correlationId: row.correlationId || '',
        });

        const recomputed = crypto.createHash('sha256').update(payloadToHash).digest('hex');
        if (recomputed !== row.hash) {
          return {
            valid: false,
            recordsChecked: i,
            tamperedId: row.id,
          };
        }

        expectedPrev = row.hash;
      }

      return { valid: true, recordsChecked: rows.length };
    } catch (err) {
      console.error('[AuditService] Integrity verification error:', err);
      return { valid: false, recordsChecked: 0 };
    }
  }
}
