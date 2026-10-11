import { BaseRepository } from './BaseRepository.js';

export interface AuditLogEntity {
  id: string;
  user_id?: string | null;
  userId?: string | null;
  location_id?: string | null;
  locationId?: string | null;
  action: string;
  entity_type?: string;
  entityType?: string;
  entity_id?: string | null;
  entityId?: string | null;
  old_value?: any;
  oldValue?: any;
  new_value?: any;
  newValue?: any;
  details?: string | null;
  ip_address?: string | null;
  ipAddress?: string | null;
  user_agent?: string | null;
  userAgent?: string | null;
  created_at?: Date;
  createdAt?: Date;
}

const VALID_AUDIT_ACTIONS = [
  'CREATE', 'READ', 'UPDATE', 'DELETE',
  'LOGIN', 'LOGOUT', 'SCAN', 'VERIFY', 'APPROVE'
];

export class AuditLogRepository extends BaseRepository<AuditLogEntity> {
  protected readonly tableName = 'audit_logs';

  private normalizeAction(rawAction: string): string {
    const upper = (rawAction || '').trim().toUpperCase();
    if (VALID_AUDIT_ACTIONS.includes(upper)) return upper;
    if (upper.includes('APPROVE')) return 'APPROVE';
    if (upper.includes('CREATE') || upper.includes('INSERT') || upper.includes('ADD')) return 'CREATE';
    if (upper.includes('DELETE') || upper.includes('REMOVE')) return 'DELETE';
    if (upper.includes('LOGIN')) return 'LOGIN';
    if (upper.includes('LOGOUT')) return 'LOGOUT';
    if (upper.includes('SCAN')) return 'SCAN';
    if (upper.includes('VERIFY')) return 'VERIFY';
    return 'UPDATE';
  }

  public async log(data: {
    id: string;
    userId?: string | null;
    user_id?: string | null;
    locationId?: string | null;
    location_id?: string | null;
    action: string;
    entityType?: string;
    entity_type?: string;
    entityId?: string | null;
    entity_id?: string | null;
    details?: string | null;
    ipAddress?: string | null;
    ip_address?: string | null;
    userAgent?: string | null;
    user_agent?: string | null;
    oldValue?: any;
    old_value?: any;
    newValue?: any;
    new_value?: any;
  }): Promise<void> {
    try {
      const id = data.id;
      const userId = data.userId || data.user_id || 'SYSTEM';
      const locationId = data.locationId || data.location_id || null;
      const action = this.normalizeAction(data.action);
      const entityType = data.entityType || data.entity_type || 'SYSTEM';
      const entityId = data.entityId || data.entity_id || id;
      const rawNew = data.newValue ?? data.new_value ?? (data.details ? { details: data.details, originalAction: data.action } : { originalAction: data.action });
      const rawOld = data.oldValue ?? data.old_value ?? null;
      const newValue = rawNew != null ? JSON.stringify(rawNew) : null;
      const oldValue = rawOld != null ? JSON.stringify(rawOld) : null;
      const ipAddress = data.ipAddress || data.ip_address || null;
      const userAgent = data.userAgent || data.user_agent || null;

      // 1. Persist to snake_case audit_logs table
      await this.execute(
        `INSERT INTO audit_logs (id, user_id, location_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [id, userId, locationId, action, entityType, entityId, oldValue, newValue, ipAddress, userAgent]
      );

      // 2. Also persist to camelCase auditlog table if available
      try {
        await this.execute(
          `INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, oldValue, newValue, ipAddress, userAgent, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [id, userId, locationId, action, entityType, entityId, oldValue, newValue, ipAddress, userAgent]
        );
      } catch {
        // Optional fallback sync
      }
    } catch (err: any) {
      console.warn('[AuditLogRepository] Logging fallback error:', err.message);
    }
  }

  public async listRecent(limit = 50): Promise<AuditLogEntity[]> {
    const rows = await this.query<any>(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );

    return rows.map((r: any) => {
      let detailsStr = '';
      if (typeof r.new_value === 'string') {
        try {
          const parsed = JSON.parse(r.new_value);
          detailsStr = parsed.details || r.new_value;
        } catch {
          detailsStr = r.new_value;
        }
      } else if (r.new_value?.details) {
        detailsStr = r.new_value.details;
      }

      return {
        id: r.id,
        user_id: r.user_id,
        userId: r.user_id,
        location_id: r.location_id,
        locationId: r.location_id,
        action: r.action,
        entity_type: r.entity_type,
        entityType: r.entity_type,
        entity_id: r.entity_id,
        entityId: r.entity_id,
        old_value: r.old_value,
        oldValue: r.old_value,
        new_value: r.new_value,
        newValue: r.new_value,
        details: detailsStr || null,
        ip_address: r.ip_address,
        ipAddress: r.ip_address,
        user_agent: r.user_agent,
        userAgent: r.user_agent,
        created_at: r.created_at,
        createdAt: r.created_at,
      };
    });
  }
}
