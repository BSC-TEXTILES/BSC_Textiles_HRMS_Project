import { LeaveRepository, LeaveTypeEntity, LeaveApplicationEntity } from '../repositories/LeaveRepository.js';
import { LeaveBalanceService } from './LeaveBalanceService.js';
import { LeaveApprovalService } from './LeaveApprovalService.js';

export class LeaveManagementService {
  constructor(
    private readonly leaveRepo: LeaveRepository,
    private readonly balanceService: LeaveBalanceService,
    private readonly approvalService: LeaveApprovalService
  ) {}

  public async getLeaveTypes(): Promise<LeaveTypeEntity[]> {
    return this.leaveRepo.getLeaveTypes();
  }

  public async applyForLeave(data: {
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    isHalfDay?: boolean;
    halfDaySession?: 'FIRST_HALF' | 'SECOND_HALF' | null;
    reason: string;
    documentUrl?: string | null;
  }): Promise<LeaveApplicationEntity> {
    if (!data.startDate || !data.endDate) {
      throw new Error('Start date and end date are required');
    }
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new Error('Start date cannot be after end date');
    }

    // Check for overlapping applications
    const hasOverlap = await this.leaveRepo.checkOverlap(data.employeeId, data.startDate, data.endDate);
    if (hasOverlap) {
      throw new Error('You already have a pending or approved leave request during this date range');
    }

    // Calculate requested days
    let daysCount = 1;
    if (data.isHalfDay) {
      daysCount = 0.5;
    } else {
      const diffMs = new Date(data.endDate).getTime() - new Date(data.startDate).getTime();
      daysCount = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    }

    // Verify balance availability (unless LOP)
    const year = new Date().getFullYear();
    const balance = await this.balanceService.getBalanceForType(data.employeeId, data.leaveTypeId, year);
    if (balance && balance.is_paid && balance.balance < daysCount) {
      throw new Error(`Insufficient leave balance. Available: ${balance.balance} days, Requested: ${daysCount} days`);
    }

    const applicationId = `la_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await this.leaveRepo.createApplication({
      id: applicationId,
      employee_id: data.employeeId,
      leave_type_id: data.leaveTypeId,
      start_date: data.startDate,
      end_date: data.endDate,
      is_half_day: Boolean(data.isHalfDay),
      half_day_session: data.halfDaySession || null,
      days_count: daysCount,
      reason: data.reason,
      document_url: data.documentUrl || null,
    });

    // Mark as pending in balance
    if (balance && balance.is_paid) {
      await this.leaveRepo.updateBalance(data.employeeId, data.leaveTypeId, year, 0, 0, daysCount);
    }

    const created = await this.leaveRepo.findById(applicationId);
    return created!;
  }

  public async cancelApplication(applicationId: string, employeeId: string): Promise<void> {
    const app = await this.leaveRepo.findById(applicationId);
    if (!app) throw new Error('Application not found');
    if (app.employee_id !== employeeId) throw new Error('Access denied');
    if (app.status !== 'PENDING') throw new Error('Only pending applications can be cancelled');

    const year = new Date().getFullYear();
    await this.leaveRepo.updateBalance(employeeId, app.leave_type_id, year, 0, 0, -Number(app.days_count));
    await this.leaveRepo.updateApplicationStatus(applicationId, 'CANCELLED');
  }

  public async listApplications(options: {
    employeeId?: string;
    locationId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ applications: LeaveApplicationEntity[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.max(1, Number(options.limit || 20));
    const offset = (page - 1) * limit;

    const { applications, total } = await this.leaveRepo.listApplications({
      employeeId: options.employeeId,
      locationId: options.locationId,
      status: options.status,
      limit,
      offset,
    });

    return { applications, total, page, limit };
  }

  public async approve(applicationId: string, reviewerId: string): Promise<LeaveApplicationEntity> {
    return this.approvalService.approveApplication(applicationId, reviewerId);
  }

  public async reject(applicationId: string, reviewerId: string, reason: string): Promise<LeaveApplicationEntity> {
    return this.approvalService.rejectApplication(applicationId, reviewerId, reason);
  }
}
