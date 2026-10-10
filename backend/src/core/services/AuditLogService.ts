import { AuditLogRepository, AuditLogEntity } from '../repositories/AuditLogRepository.js';

export class AuditLogService {
  constructor(private readonly auditRepo: AuditLogRepository) {}

  public async logAction(data: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: string | null;
    ipAddress?: string | null;
  }): Promise<void> {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await this.auditRepo.log({ id, ...data });
  }

  public async getRecentLogs(limit = 50): Promise<AuditLogEntity[]> {
    return this.auditRepo.listRecent(limit);
  }
}
