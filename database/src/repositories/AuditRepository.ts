import { query } from '../pool.js';

export interface AuditLogRow {
  id: string;
  userId: string;
  locationId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export class AuditRepository {
  static async record(
    id: string,
    userId: string,
    locationId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: unknown = null,
    newValue: unknown = null,
    ipAddress: string | null = null,
    userAgent: string | null = null
  ): Promise<void> {
    await query(
      `INSERT INTO AuditLog
       (id, userId, locationId, action, entityType, entityId, oldValue, newValue, ipAddress, userAgent, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        id,
        userId,
        locationId,
        action,
        entityType,
        entityId,
        oldValue != null ? JSON.stringify(oldValue) : null,
        newValue != null ? JSON.stringify(newValue) : null,
        ipAddress,
        userAgent,
      ]
    );
  }

  static async listRecent(limit: number = 50): Promise<AuditLogRow[]> {
    return query<AuditLogRow>(`SELECT * FROM AuditLog ORDER BY createdAt DESC LIMIT ?`, [limit]);
  }
}
