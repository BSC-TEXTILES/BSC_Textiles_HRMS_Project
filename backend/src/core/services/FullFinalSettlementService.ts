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

  public async updateSettlementComponent(
    settlementId: string,
    field: string,
    newValue: number | string,
    reason: string,
    changedBy: string
  ): Promise<SettlementEntity> {
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
      new_value: String(newValue),
      reason,
      changed_by: changedBy,
    });

    // Update field and recalculate totals
    const updatedRecord: any = { ...existing, [field]: Number(newValue) };
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
