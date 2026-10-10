import { LeaveRepository, LeaveApplicationEntity } from '../repositories/LeaveRepository.js';
import { LeaveBalanceService } from './LeaveBalanceService.js';
import { AuditLogRepository } from '../repositories/AuditLogRepository.js';

export class LeaveApprovalService {
  constructor(
    private readonly leaveRepo: LeaveRepository,
    private readonly balanceService: LeaveBalanceService,
    private readonly auditRepo: AuditLogRepository
  ) {}

  public async approveApplication(
    applicationId: string,
    reviewerId: string
  ): Promise<LeaveApplicationEntity> {
    const app = await this.leaveRepo.findById(applicationId);
    if (!app) throw new Error('Leave application not found');
    if (app.status !== 'PENDING') {
      throw new Error(`Cannot approve application with status ${app.status}`);
    }

    // Deduct leave balance and audit ledger
    await this.balanceService.deductBalance(
      app.employee_id,
      app.leave_type_id,
      Number(app.days_count),
      app.id,
      `Approved leave from ${app.start_date} to ${app.end_date}`
    );

    // Update application status
    await this.leaveRepo.updateApplicationStatus(applicationId, 'APPROVED', reviewerId);

    // Audit log
    await this.auditRepo.log({
      id: `audit_leave_${Date.now()}`,
      userId: reviewerId,
      action: 'LEAVE_APPROVED',
      entityType: 'LEAVE_APPLICATION',
      entityId: applicationId,
      details: `Approved ${app.days_count} day(s) for employee ${app.employee_id}`,
    });

    return (await this.leaveRepo.findById(applicationId))!;
  }

  public async rejectApplication(
    applicationId: string,
    reviewerId: string,
    reason: string
  ): Promise<LeaveApplicationEntity> {
    if (!reason || reason.trim().length < 3) {
      throw new Error('Rejection reason is required');
    }

    const app = await this.leaveRepo.findById(applicationId);
    if (!app) throw new Error('Leave application not found');
    if (app.status !== 'PENDING') {
      throw new Error(`Cannot reject application with status ${app.status}`);
    }

    // Release pending balance
    const year = new Date().getFullYear();
    await this.leaveRepo.updateBalance(
      app.employee_id,
      app.leave_type_id,
      year,
      0,
      0,
      -Number(app.days_count)
    );

    await this.leaveRepo.updateApplicationStatus(applicationId, 'REJECTED', reviewerId, reason);

    await this.auditRepo.log({
      id: `audit_leave_${Date.now()}`,
      userId: reviewerId,
      action: 'LEAVE_REJECTED',
      entityType: 'LEAVE_APPLICATION',
      entityId: applicationId,
      details: `Rejected leave: ${reason}`,
    });

    return (await this.leaveRepo.findById(applicationId))!;
  }
}
