import { BaseRepository } from './BaseRepository.js';

export interface AuditLogEntity {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export class AuditLogRepository extends BaseRepository<AuditLogEntity> {
  protected readonly tableName = 'audit_logs';

  public async log(data: {
    id: string;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: string | null;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO audit_logs (id, userId, action, entityType, entityId, details, ipAddress, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          data.id,
          data.userId || null,
          data.action,
          data.entityType,
          data.entityId || null,
          data.details || null,
          data.ipAddress || null,
        ]
      );
    } catch (err: any) {
      console.warn('[AuditLogRepository] Logging fallback error:', err.message);
    }
  }

  public async listRecent(limit = 50): Promise<AuditLogEntity[]> {
    return this.query<AuditLogEntity>(
      `SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT ?`,
      [limit]
    );
  }
}
