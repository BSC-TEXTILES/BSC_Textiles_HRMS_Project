/**
 * AuditService — Tamper-resistant, hash-chained audit logging.
 * Every audit record includes a SHA-256 hash that chains to the previous record,
 * making it detectable if any record is altered or deleted.
 */
import crypto from 'node:crypto';
import { Pool } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';

/** Fields that should never appear in audit log values */
const REDACTED_FIELDS = new Set([
  'password', 'passwordHash', 'secret', 'token', 'tokenHash',
  'resetToken', 'sessionId', 'cookie', 'apiKey', 'accessToken',
  'refreshToken', 'mfaSecret', 'backupCodes', 'creditCard',
  'ssn', 'aadhaarNumber', 'panNumber',
]);

export interface AuditEntry {
  userId: string;
  locationId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
  ipAddress: string;
  userAgent: string;
  correlationId?: string;
  sessionId?: string;
  riskScore?: number;
  tags?: string[];
}

export class AuditService {
  private lastHash: string | null = null;

  constructor(private readonly pool: Pool) {}

  /** Initialize the chain by reading the last audit log hash */
  async initChain(): Promise<void> {
    const [rows] = await this.pool.query(
      'SELECT `hash` FROM auditlog ORDER BY createdAt DESC, id DESC LIMIT 1',
    ) as any;
    this.lastHash = rows[0]?.hash || null;
  }

  /**
   * Write a tamper-resistant audit entry.
   * Sensitive field values are automatically redacted.
   */
  async log(entry: AuditEntry): Promise<string> {
    const id = uuid();
    const now = new Date();
    const oldVal = entry.oldValue ? JSON.stringify(this.redact(entry.oldValue)) : null;
    const newVal = entry.newValue ? JSON.stringify(this.redact(entry.newValue)) : null;

    // Build integrity hash
    const hashInput = [
      id,
      entry.userId,
      entry.action,
      entry.entityType,
      entry.entityId,
      oldVal || '',
      newVal || '',
      now.toISOString(),
      this.lastHash || 'GENESIS',
    ].join('|');

    const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

    await this.pool.query(
      `INSERT INTO auditlog
        (id, userId, locationId, action, entityType, entityId, oldValue, newValue,
         ipAddress, userAgent, correlationId, sessionId, riskScore, tags,
         \`hash\`, previousHash, integrityVerified, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        id,
        entry.userId,
        entry.locationId || null,
        entry.action,
        entry.entityType,
        entry.entityId,
        oldVal,
        newVal,
        entry.ipAddress,
        entry.userAgent,
        entry.correlationId || null,
        entry.sessionId || null,
        entry.riskScore || 0,
        entry.tags ? JSON.stringify(entry.tags) : null,
        hash,
        this.lastHash,
        now,
      ],
    );

    this.lastHash = hash;
    return id;
  }

  /**
   * Verify the integrity of the audit log chain.
   * Returns the number of valid records and any gaps/tampered entries.
   */
  async verifyIntegrity(limit = 1000): Promise<{
    verified: number;
    tampered: string[];
    gaps: string[];
  }> {
    const [rows] = await this.pool.query(
      `SELECT id, userId, action, entityType, entityId, oldValue, newValue,
              createdAt, \`hash\`, previousHash
       FROM auditlog ORDER BY createdAt ASC, id ASC LIMIT ?`,
      [limit],
    ) as any;

    let previousHash: string | null = null;
    let verified = 0;
    const tampered: string[] = [];
    const gaps: string[] = [];

    for (const row of rows) {
      // Check chain continuity
      if (row.previousHash !== previousHash && previousHash !== null) {
        gaps.push(row.id);
      }

      // Recompute hash
      const hashInput = [
        row.id,
        row.userId,
        row.action,
        row.entityType,
        row.entityId,
        row.oldValue || '',
        row.newValue || '',
        new Date(row.createdAt).toISOString(),
        row.previousHash || 'GENESIS',
      ].join('|');

      const expected = crypto.createHash('sha256').update(hashInput).digest('hex');
      if (expected !== row.hash) {
        tampered.push(row.id);
      } else {
        verified++;
      }

      previousHash = row.hash;
    }

    return { verified, tampered, gaps };
  }

  /**
   * Deep-clone an object and replace sensitive field values with '[REDACTED]'.
   */
  private redact(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (REDACTED_FIELDS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redact(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
