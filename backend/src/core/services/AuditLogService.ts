import { AuditLogRepository, AuditLogEntity } from '../repositories/AuditLogRepository.js';

export class AuditLogService {
  constructor(private readonly auditRepo: AuditLogRepository) {}

  public async logAction(data: {
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
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await this.auditRepo.log({
      id,
      ...data,
      entityType: data.entityType || data.entity_type || 'SYSTEM',
    });
  }

  public async getRecentLogs(limit = 50): Promise<AuditLogEntity[]> {
    return this.auditRepo.listRecent(limit);
  }
}
