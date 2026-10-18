import { SettlementRepository, SettlementEntity } from '../repositories/SettlementRepository.js';
import { EmployeeExitRepository } from '../repositories/EmployeeExitRepository.js';
import { EmployeeRepository } from '../repositories/EmployeeRepository.js';
import { LeaveRepository } from '../repositories/LeaveRepository.js';
import { SettlementCalculationService } from './SettlementCalculationService.js';
import { SettlementPdfService } from './SettlementPdfService.js';

export class FullFinalSettlementService {
  constructor(
    private readonly settlementRepo: SettlementRepository,
    private readonly exitRepo: EmployeeExitRepository,
    private readonly employeeRepo: EmployeeRepository,
    private readonly leaveRepo: LeaveRepository,
    private readonly calcService: SettlementCalculationService,
    private readonly pdfService: SettlementPdfService
  ) {}

  public async getSettlementByExitId(exitId: string): Promise<SettlementEntity | null> {
    return this.settlementRepo.findByExitId(exitId);
  }

  public async calculateAndPrepareSettlement(exitId: string, preparedBy?: string): Promise<SettlementEntity> {
    const exit = await this.exitRepo.getExitWithDetails(exitId);
    if (!exit) throw new Error(`Exit record ${exitId} not found`);

    const employee = await this.employeeRepo.findById(exit.employee_id);
    if (!employee) throw new Error(`Employee ${exit.employee_id} not found`);

    // Fetch leave balance for encashment (Earned Leave)
    const balances = await this.leaveRepo.getBalancesByEmployee(exit.employee_id, new Date().getFullYear());
    const elBalance = balances.find((b) => b.leave_type_code === 'EL')?.balance || 0;

    // Calculate preliminary settlement
    const calc = this.calcService.calculate({
      baseMonthlySalary: Number(employee.base_salary || 0),
      lastWorkingDay: String(exit.last_working_day),
      resignationDate: String(exit.resignation_date),
      noticePeriodDays: exit.notice_period_days || 30,
      unpaidSalaryDays: 30, // Default full month salary or pro-rated
      encashableLeaveDays: elBalance,
      dateOfJoining: employee.date_of_joining,
    });

    const settlementId = `fnf_${exit.id.replace('exit_', '')}`;
    const settlementData: Partial<SettlementEntity> = {
      id: settlementId,
      exit_id: exit.id,
      employee_id: exit.employee_id,
      status: 'HR_REVIEW',
      approved_last_working_day: String(exit.last_working_day),
      unpaid_salary_days: 30,
      unpaid_salary_amount: calc.unpaidSalaryAmount,
      gratuity_amount: calc.gratuityAmount,
      leave_encashment_days: elBalance,
      leave_encashment_amount: calc.leaveEncashmentAmount,
      bonus_incentive_amount: calc.bonusIncentiveAmount,
      other_earnings: calc.otherEarnings,
      total_earnings: calc.totalEarnings,
      notice_shortfall_days: calc.noticeShortfallDays,
      notice_recovery_amount: calc.noticeRecoveryAmount,
      salary_advance_recovery: calc.salaryAdvanceRecovery,
      loan_balance_recovery: calc.loanBalanceRecovery,
      asset_damage_recovery: calc.assetDamageRecovery,
      statutory_deductions: calc.statutoryDeductions,
      other_deductions: calc.otherDeductions,
      total_deductions: calc.totalDeductions,
      net_payable: calc.netPayable,
      calculation_breakdown_json: calc.breakdown,
      remarks: 'Automated policy calculation prepared for HR review',
      prepared_by: preparedBy || null,
    };

    await this.settlementRepo.saveSettlement(settlementData);
    await this.exitRepo.updateExitStatus(exit.id, 'HR_REVIEW');

    const created = await this.settlementRepo.findByExitId(exitId);
    if (!created) throw new Error('Failed to retrieve prepared settlement');
    return created;
  }

  /**
   * Settlement fields HR may edit, with audit reason. Anything else is rejected
   * so an arbitrary caller-supplied field name cannot reach the UPDATE.
   */
  private static readonly EDITABLE_COMPONENT_FIELDS = new Set([
    'unpaid_salary_days',
    'unpaid_salary_amount',
    'gratuity_amount',
    'leave_encashment_days',
    'leave_encashment_amount',
    'bonus_incentive_amount',
    'other_earnings',
    'notice_shortfall_days',
    'notice_recovery_amount',
    'salary_advance_recovery',
    'loan_balance_recovery',
    'asset_damage_recovery',
    'other_deductions',
  ]);

  public async updateSettlementComponent(
    settlementId: string,
    field: string,
    newValue: number | string,
    reason: string,
    changedBy: string
  ): Promise<SettlementEntity> {
    if (!FullFinalSettlementService.EDITABLE_COMPONENT_FIELDS.has(field)) {
      throw new Error(`Field "${field}" is not an editable settlement component`);
    }
    const numeric = Number(newValue);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`Value for ${field} must be a non-negative number`);
    }

    const existing = await this.settlementRepo.findById(settlementId);
    if (!existing) throw new Error(`Settlement ${settlementId} not found`);
    if (existing.status === 'PAID' || existing.status === 'CLOSED') {
      throw new Error('Cannot modify a finalized/paid settlement without reversal workflow');
    }

    const oldValue = String((existing as any)[field] ?? '');

    // Record adjustment audit
    const adjId = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await this.settlementRepo.recordAdjustment({
      id: adjId,
      settlement_id: settlementId,
      field_name: field,
      old_value: oldValue,
      new_value: String(numeric),
      reason,
      changed_by: changedBy,
    });

    // Update field. Day-based edits also refresh the dependent rupee amounts
    // (daily rate = monthly salary / 30, same convention as the original
    // calculation) so totals reflect the change instead of drifting.
    const dailyWageRate = await this.getDailyWageRate(existing);
    const updatedRecord: any = { ...existing, [field]: numeric };
    if (field === 'unpaid_salary_days') {
      updatedRecord.unpaid_salary_amount = Math.round(dailyWageRate * numeric * 100) / 100;
    } else if (field === 'leave_encashment_days') {
      updatedRecord.leave_encashment_amount = Math.round(dailyWageRate * numeric * 100) / 100;
    } else if (field === 'notice_shortfall_days') {
      updatedRecord.notice_recovery_amount = Math.round(dailyWageRate * numeric * 100) / 100;
    }

    // Statutory deductions track the unpaid salary amount (PF 12% capped at
    // ₹1800, PT ₹200 above ₹15000) — same rules as SettlementCalculationService.
    if (field === 'unpaid_salary_days' || field === 'unpaid_salary_amount') {
      const unpaidSalaryAmount = Number(updatedRecord.unpaid_salary_amount || 0);
      const pfDeduction = Math.round(Math.min(1800, unpaidSalaryAmount * 0.12) * 100) / 100;
      const professionalTax = unpaidSalaryAmount > 15000 ? 200 : 0;
      updatedRecord.statutory_deductions = Math.round((pfDeduction + professionalTax) * 100) / 100;
    }

    const totalEarnings =
      Number(updatedRecord.unpaid_salary_amount || 0) +
      Number(updatedRecord.leave_encashment_amount || 0) +
      Number(updatedRecord.gratuity_amount || 0) +
      Number(updatedRecord.bonus_incentive_amount || 0) +
      Number(updatedRecord.other_earnings || 0);

    const totalDeductions =
      Number(updatedRecord.notice_recovery_amount || 0) +
      Number(updatedRecord.salary_advance_recovery || 0) +
      Number(updatedRecord.loan_balance_recovery || 0) +
      Number(updatedRecord.asset_damage_recovery || 0) +
      Number(updatedRecord.statutory_deductions || 0) +
      Number(updatedRecord.other_deductions || 0);

    const netPayable = Math.round((totalEarnings - totalDeductions) * 100) / 100;

    await this.settlementRepo.saveSettlement({
      ...updatedRecord,
      total_earnings: totalEarnings,
      total_deductions: totalDeductions,
      net_payable: netPayable,
    });

    const refreshed = await this.settlementRepo.findById(settlementId);
    return refreshed!;
  }

  /** Daily wage rate for the settlement's employee (monthly salary / 30). */
  private async getDailyWageRate(settlement: SettlementEntity): Promise<number> {
    const employee = await this.employeeRepo.findById(settlement.employee_id);
    const monthlySalary = Math.max(0, Number(employee?.base_salary || 0));
    return Math.round((monthlySalary / 30) * 100) / 100;
  }

  /**
   * Move a settlement from HR review into the management sign-off queue.
   */
  public async submitForApproval(settlementId: string, submittedBy: string): Promise<SettlementEntity> {
    const existing = await this.settlementRepo.findById(settlementId);
    if (!existing) throw new Error('Settlement not found');
    if (existing.status !== 'HR_REVIEW' && existing.status !== 'DRAFT') {
      throw new Error(`Only a settlement in HR review can be submitted for approval (current: ${existing.status})`);
    }

    await this.settlementRepo.recordAdjustment({
      id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      settlement_id: settlementId,
      field_name: 'status',
      old_value: existing.status,
      new_value: 'PENDING_APPROVAL',
      reason: 'Submitted for management sign-off',
      changed_by: submittedBy,
    });
    await this.settlementRepo.updateStatus(settlementId, 'PENDING_APPROVAL');
    await this.exitRepo.updateExitStatus(existing.exit_id, 'PAYMENT_PENDING');

    const refreshed = await this.settlementRepo.findById(settlementId);
    return refreshed!;
  }

  /**
   * Send a management rejection back to HR review with the stated reason.
   */
  public async rejectSettlement(settlementId: string, rejectedBy: string, reason: string): Promise<SettlementEntity> {
    const existing = await this.settlementRepo.findById(settlementId);
    if (!existing) throw new Error('Settlement not found');
    if (existing.status !== 'PENDING_APPROVAL' && existing.status !== 'APPROVED') {
      throw new Error(`Only a settlement awaiting/holding approval can be rejected (current: ${existing.status})`);
    }
    if (!reason || !reason.trim()) {
      throw new Error('A rejection reason is required');
    }

    await this.settlementRepo.recordAdjustment({
      id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      settlement_id: settlementId,
      field_name: 'status',
      old_value: existing.status,
      new_value: 'HR_REVIEW',
      reason: reason.trim(),
      changed_by: rejectedBy,
    });
    await this.settlementRepo.updateStatus(settlementId, 'HR_REVIEW');
    await this.exitRepo.updateExitStatus(existing.exit_id, 'HR_REVIEW');

    const refreshed = await this.settlementRepo.findById(settlementId);
    return refreshed!;
  }

  public async approveSettlement(settlementId: string, approvedBy: string): Promise<SettlementEntity> {
    const existing = await this.settlementRepo.findById(settlementId);
    if (!existing) throw new Error('Settlement not found');

    await this.settlementRepo.approveSettlement(settlementId, approvedBy);
    await this.exitRepo.updateExitStatus(existing.exit_id, 'APPROVED');

    // Generate Statement PDF
    const exit = await this.exitRepo.getExitWithDetails(existing.exit_id);
    if (exit) {
      const pdf = await this.pdfService.generatePdf({
        settlementId: existing.id,
        employeeName: exit.employee_name || 'Staff Member',
        employeeCode: exit.employee_code || 'EMP',
        departmentName: exit.department_name,
        locationName: exit.location_name,
        lastWorkingDay: String(existing.approved_last_working_day),
        resignationDate: String(exit.resignation_date),
        totalEarnings: Number(existing.total_earnings),
        totalDeductions: Number(existing.total_deductions),
        netPayable: Number(existing.net_payable),
        unpaidSalaryAmount: Number(existing.unpaid_salary_amount),
        leaveEncashmentAmount: Number(existing.leave_encashment_amount),
        gratuityAmount: Number(existing.gratuity_amount),
        bonusIncentiveAmount: Number(existing.bonus_incentive_amount),
        noticeRecoveryAmount: Number(existing.notice_recovery_amount),
        salaryAdvanceRecovery: Number(existing.salary_advance_recovery),
        statutoryDeductions: Number(existing.statutory_deductions),
        otherDeductions: Number(existing.other_deductions),
      });
      await this.settlementRepo.updatePdfPath(settlementId, pdf.filePath);
    }

    const refreshed = await this.settlementRepo.findById(settlementId);
    return refreshed!;
  }

  public async recordPayment(
    settlementId: string,
    paymentRef: string,
    paymentMode: string,
    paymentDate: string
  ): Promise<SettlementEntity> {
    const existing = await this.settlementRepo.findById(settlementId);
    if (!existing) throw new Error('Settlement not found');

    await this.settlementRepo.recordPayment(settlementId, paymentRef, paymentMode, paymentDate);
    await this.exitRepo.updateExitStatus(existing.exit_id, 'PAID');
    await this.employeeRepo.updateStatus(existing.employee_id, 'EX_EMPLOYEE');

    const refreshed = await this.settlementRepo.findById(settlementId);
    return refreshed!;
  }

  public async getStatementPdfBuffer(settlementId: string): Promise<Buffer> {
    const settlement = await this.settlementRepo.findById(settlementId);
    if (!settlement) throw new Error('Settlement not found');
    const exit = await this.exitRepo.getExitWithDetails(settlement.exit_id);
    if (!exit) throw new Error('Exit details not found');

    const pdf = await this.pdfService.generatePdf({
      settlementId: settlement.id,
      employeeName: exit.employee_name || 'Staff Member',
      employeeCode: exit.employee_code || 'EMP',
      departmentName: exit.department_name,
      locationName: exit.location_name,
      lastWorkingDay: String(settlement.approved_last_working_day),
      resignationDate: String(exit.resignation_date),
      totalEarnings: Number(settlement.total_earnings),
      totalDeductions: Number(settlement.total_deductions),
      netPayable: Number(settlement.net_payable),
      unpaidSalaryAmount: Number(settlement.unpaid_salary_amount),
      leaveEncashmentAmount: Number(settlement.leave_encashment_amount),
      gratuityAmount: Number(settlement.gratuity_amount),
      bonusIncentiveAmount: Number(settlement.bonus_incentive_amount),
      noticeRecoveryAmount: Number(settlement.notice_recovery_amount),
      salaryAdvanceRecovery: Number(settlement.salary_advance_recovery),
      statutoryDeductions: Number(settlement.statutory_deductions),
      otherDeductions: Number(settlement.other_deductions),
      paymentReference: settlement.payment_reference,
      paymentDate: settlement.payment_date,
      paymentMode: settlement.payment_mode,
    });

    return pdf.buffer;
  }
}
