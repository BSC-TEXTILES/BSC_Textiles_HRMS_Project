import { EmployeeExitRepository, EmployeeExitEntity, ExitClearanceTaskEntity } from '../repositories/EmployeeExitRepository.js';
import { EmployeeRepository } from '../repositories/EmployeeRepository.js';

export class EmployeeExitService {
  constructor(
    private readonly exitRepo: EmployeeExitRepository,
    private readonly employeeRepo: EmployeeRepository
  ) {}

  public async initiateExit(data: {
    employeeId: string;
    exitType: 'RESIGNATION' | 'TERMINATION' | 'RETIREMENT' | 'ABSCONDING';
    resignationDate: string;
    noticePeriodDays?: number;
    lastWorkingDay: string;
    reason: string;
    initiatorId?: string;
  }): Promise<EmployeeExitEntity> {
    const employee = await this.employeeRepo.findById(data.employeeId);
    if (!employee) throw new Error(`Employee ${data.employeeId} not found`);

    const exitId = `exit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const noticeDays = data.noticePeriodDays || 30;

    await this.exitRepo.createExit({
      id: exitId,
      employee_id: data.employeeId,
      exit_type: data.exitType,
      resignation_date: data.resignationDate,
      notice_period_days: noticeDays,
      last_working_day: data.lastWorkingDay,
      reason: data.reason,
      status: 'CLEARANCE_PENDING',
      initiator_id: data.initiatorId,
    });

    // Create 5 departmental clearance checklist tasks
    const clearanceTasks = [
      { id: `cl_${exitId}_it`, exit_id: exitId, department: 'IT', task_name: 'Email revocation, POS terminal ID disabled & hardware return' },
      { id: `cl_${exitId}_acc`, exit_id: exitId, department: 'ACCOUNTS', task_name: 'Zero advance check, pending travel bills & loan recovery verification' },
      { id: `cl_${exitId}_hr`, exit_id: exitId, department: 'HR', task_name: 'ID badge returned, insurance cancellation & statutory exit interview' },
      { id: `cl_${exitId}_ops`, exit_id: exitId, department: 'STORE_OPS', task_name: 'Cash register drawer audit, store keys & uniform handover' },
      { id: `cl_${exitId}_sec`, exit_id: exitId, department: 'SECURITY', task_name: 'Biometric template revoked & store exit gate clearance' },
    ];
    await this.exitRepo.createClearanceTasks(clearanceTasks);

    // Update employee status to RESIGNED or TERMINATED without deleting profile!
    const newStatus = data.exitType === 'TERMINATION' ? 'TERMINATED' : 'RESIGNED';
    await this.employeeRepo.updateStatus(data.employeeId, newStatus);

    const created = await this.exitRepo.getExitWithDetails(exitId);
    return created!;
  }

  public async getExitDetails(exitId: string): Promise<{
    exit: EmployeeExitEntity;
    clearanceTasks: ExitClearanceTaskEntity[];
  }> {
    const exit = await this.exitRepo.getExitWithDetails(exitId);
    if (!exit) throw new Error(`Exit ${exitId} not found`);

    const clearanceTasks = await this.exitRepo.getClearanceTasks(exitId);
    return { exit, clearanceTasks };
  }

  public async updateClearance(
    taskId: string,
    status: 'CLEARED' | 'REJECTED' | 'WAIVED',
    remarks: string,
    clearedBy: string
  ): Promise<void> {
    await this.exitRepo.updateClearanceTask(taskId, status, remarks, clearedBy);
  }
}
