import { query } from '../pool.js';

export interface AuditLogRow {
  id: string;
  user_id: string;
  location_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export class AuditRepository {
  static async record(
    id: string,
    userId: string,
    locationId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any = null,
    newValue: any = null,
    ipAddress: string | null = null,
    userAgent: string | null = null
  ): Promise<void> {
    await query(
      `INSERT INTO audit_logs 
       (id, user_id, location_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        id,
        userId,
        locationId,
        action,
        entityType,
        entityId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress,
        userAgent,
      ]
    );
  }

  static async listRecent(limit: number = 50): Promise<AuditLogRow[]> {
    return query<AuditLogRow>(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
  }
}
