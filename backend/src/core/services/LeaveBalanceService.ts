import { LeaveRepository, LeaveBalanceEntity } from '../repositories/LeaveRepository.js';

export class LeaveBalanceService {
  constructor(private readonly leaveRepo: LeaveRepository) {}

  public async getBalancesForEmployee(employeeId: string, year = 2026): Promise<LeaveBalanceEntity[]> {
    return this.leaveRepo.getBalancesByEmployee(employeeId, year);
  }

  public async getBalanceForType(employeeId: string, leaveTypeId: string, year = 2026): Promise<LeaveBalanceEntity | null> {
    return this.leaveRepo.getBalanceForType(employeeId, leaveTypeId, year);
  }

  public async deductBalance(
    employeeId: string,
    leaveTypeId: string,
    days: number,
    applicationId: string,
    description: string
  ): Promise<void> {
    const year = new Date().getFullYear();
    const current = await this.leaveRepo.getBalanceForType(employeeId, leaveTypeId, year);
    if (!current) throw new Error('Leave balance not initialized for employee');

    const newBalance = Math.max(0, current.balance - days);
    await this.leaveRepo.updateBalance(employeeId, leaveTypeId, year, days, -days, -days);

    await this.leaveRepo.recordLedger({
      id: `ll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      application_id: applicationId,
      transaction_type: 'DEBIT',
      days,
      balance_after: newBalance,
      description,
    });
  }

  public async creditBalance(
    employeeId: string,
    leaveTypeId: string,
    days: number,
    description: string
  ): Promise<void> {
    const year = new Date().getFullYear();
    const current = await this.leaveRepo.getBalanceForType(employeeId, leaveTypeId, year);
    const initialBalance = current ? current.balance : 0;
    const newBalance = initialBalance + days;

    await this.leaveRepo.updateBalance(employeeId, leaveTypeId, year, 0, days, 0);

    await this.leaveRepo.recordLedger({
      id: `ll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      transaction_type: 'CREDIT',
      days,
      balance_after: newBalance,
      description,
    });
  }
}
