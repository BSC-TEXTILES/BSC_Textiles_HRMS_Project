import { SalarySlipRepository, PayslipItemEntity, PayslipVersionEntity } from '../repositories/SalarySlipRepository.js';
import { SalarySlipPdfService } from './SalarySlipPdfService.js';
import { AuditLogRepository } from '../repositories/AuditLogRepository.js';

export class SalarySlipService {
  constructor(
    private readonly slipRepo: SalarySlipRepository,
    private readonly pdfService: SalarySlipPdfService,
    private readonly auditRepo: AuditLogRepository
  ) {}

  public async getPayslipsForEmployee(employeeId: string): Promise<PayslipItemEntity[]> {
    return this.slipRepo.listByEmployee(employeeId);
  }

  public async getPayslipById(payslipId: string, requestingUser: { id: string; role: string; employeeId?: string }): Promise<PayslipItemEntity> {
    const slip = await this.slipRepo.getPayslipById(payslipId);
    if (!slip) throw new Error('Payslip not found');

    // IDOR Protection: Employees can only view their own payslip
    if (requestingUser.role === 'EMPLOYEE' || requestingUser.role === 'SALES_EMPLOYEE') {
      if (slip.employee_id !== requestingUser.employeeId) {
        throw new Error('Access denied: You are only authorized to view your own salary slip');
      }
    }

    return slip;
  }

  public async getPayslipPdfBuffer(payslipId: string, requestingUser: { id: string; role: string; employeeId?: string }): Promise<Buffer> {
    const slip = await this.getPayslipById(payslipId, requestingUser);
    const version = await this.slipRepo.getLatestVersion(payslipId);

    const pdf = await this.pdfService.generatePdf({
      payslipId: slip.id,
      version: Math.max(1, version),
      employeeName: slip.employee_name || 'Staff Member',
      employeeCode: slip.employee_code || 'EMP',
      departmentName: slip.department_name,
      locationName: slip.location_name,
      periodStart: slip.period_start || new Date().toISOString(),
      periodEnd: slip.period_end || new Date().toISOString(),
      basicSalary: Number(slip.basic_salary),
      allowances: Number(slip.allowances),
      earlyIncentive: Number(slip.early_incentive),
      salesIncentive: Number(slip.sales_incentive),
      attendanceIncentive: Number(slip.attendance_incentive),
      overtimePay: Number(slip.overtime_pay),
      latePenalties: Number(slip.late_penalties),
      breakPenalties: Number(slip.break_penalties),
      statutoryDeductions: Number(slip.statutory_deductions),
      grossEarnings: Number(slip.gross_earnings),
      totalDeductions: Number(slip.total_deductions),
      netPay: Number(slip.net_pay),
    });

    return pdf.buffer;
  }

  public async editPayslipByHr(
    payslipId: string,
    edits: {
      basicSalary?: number;
      allowances?: number;
      statutoryDeductions?: number;
      editReason: string;
    },
    hrUser: { id: string; role: string }
  ): Promise<PayslipItemEntity> {
    // Only HR or Admin can edit payslips
    if (hrUser.role !== 'SUPER_ADMIN' && hrUser.role !== 'ADMIN' && hrUser.role !== 'HR_MANAGER' && hrUser.role !== 'HR') {
      throw new Error('Forbidden: Only authorized HR staff can edit payslips');
    }

    if (!edits.editReason || edits.editReason.trim().length < 5) {
      throw new Error('Mandatory documented audit reason required for editing payslips');
    }

    const current = await this.slipRepo.getPayslipById(payslipId);
    if (!current) throw new Error('Payslip not found');

    const basicSalary = edits.basicSalary !== undefined ? Number(edits.basicSalary) : Number(current.basic_salary);
    const allowances = edits.allowances !== undefined ? Number(edits.allowances) : Number(current.allowances);
    const statutoryDeductions = edits.statutoryDeductions !== undefined ? Number(edits.statutoryDeductions) : Number(current.statutory_deductions);

    // Recalculate dependent totals
    const grossEarnings = basicSalary + allowances +
      Number(current.early_incentive || 0) +
      Number(current.sales_incentive || 0) +
      Number(current.attendance_incentive || 0) +
      Number(current.overtime_pay || 0);

    const totalDeductions = statutoryDeductions +
      Number(current.late_penalties || 0) +
      Number(current.break_penalties || 0);

    const netPay = Math.round((grossEarnings - totalDeductions) * 100) / 100;

    const currentVersion = await this.slipRepo.getLatestVersion(payslipId);
    const nextVersion = currentVersion + 1;

    // Record previous version as superseded in payslip_versions
    await this.slipRepo.recordVersion({
      id: `pv_${payslipId}_v${nextVersion}`,
      payroll_item_id: payslipId,
      payroll_run_id: current.payroll_run_id,
      employee_id: current.employee_id,
      version: nextVersion,
      basic_salary: basicSalary,
      allowances,
      incentives: Number(current.early_incentive || 0) + Number(current.sales_incentive || 0),
      overtime_pay: Number(current.overtime_pay || 0),
      penalties: Number(current.late_penalties || 0) + Number(current.break_penalties || 0),
      statutory_deductions: statutoryDeductions,
      gross_earnings: grossEarnings,
      total_deductions: totalDeductions,
      net_pay: netPay,
      edited_by: hrUser.id,
      edit_reason: edits.editReason,
    });

    // Update active amounts in payroll_items
    await this.slipRepo.updatePayrollItemAmounts(payslipId, {
      basic_salary: basicSalary,
      allowances,
      statutory_deductions: statutoryDeductions,
      gross_earnings: grossEarnings,
      total_deductions: totalDeductions,
      net_pay: netPay,
    });

    // Audit log
    await this.auditRepo.log({
      id: `audit_slip_${Date.now()}`,
      userId: hrUser.id,
      action: 'PAYSLIP_EDITED',
      entityType: 'PAYSLIP',
      entityId: payslipId,
      details: `Version ${nextVersion} created. Reason: ${edits.editReason}. Net Pay recalculated from ₹${current.net_pay} to ₹${netPay}`,
    });

    return (await this.slipRepo.getPayslipById(payslipId))!;
  }

  public async getVersionHistory(payslipId: string): Promise<PayslipVersionEntity[]> {
    return this.slipRepo.getVersions(payslipId);
  }
}
