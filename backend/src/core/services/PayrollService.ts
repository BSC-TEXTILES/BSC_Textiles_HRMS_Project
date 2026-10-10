import { PayrollRepository, PayrollRunEntity } from '../repositories/PayrollRepository.js';
import { SalarySlipPdfService } from './SalarySlipPdfService.js';
import { SalarySlipRepository } from '../repositories/SalarySlipRepository.js';

export class PayrollService {
  constructor(
    private readonly payrollRepo: PayrollRepository,
    private readonly slipRepo: SalarySlipRepository,
    private readonly pdfService: SalarySlipPdfService
  ) {}

  public async getLatestRun(locationId?: string): Promise<PayrollRunEntity | null> {
    return this.payrollRepo.getLatestRun(locationId);
  }

  public async getItemsForRun(runId: string): Promise<any[]> {
    return this.payrollRepo.getItemsForRun(runId);
  }

  /**
   * Section 6.1: Automatic bulk PDF payslip generation upon payroll finalization
   */
  public async finalizeAndGeneratePdfs(runId: string): Promise<{ generatedCount: number; runId: string }> {
    const items = await this.payrollRepo.getItemsForRun(runId);
    let count = 0;

    for (const item of items) {
      try {
        const pdf = await this.pdfService.generatePdf({
          payslipId: item.id,
          version: 1,
          employeeName: item.employee_name || 'Staff Member',
          employeeCode: item.employee_code || 'EMP',
          departmentName: item.department_name,
          locationName: item.location_name,
          periodStart: item.period_start || new Date().toISOString(),
          periodEnd: item.period_end || new Date().toISOString(),
          basicSalary: Number(item.basic_salary),
          allowances: Number(item.allowances),
          earlyIncentive: Number(item.early_incentive),
          salesIncentive: Number(item.sales_incentive),
          attendanceIncentive: Number(item.attendance_incentive),
          overtimePay: Number(item.overtime_pay),
          latePenalties: Number(item.late_penalties),
          breakPenalties: Number(item.break_penalties),
          statutoryDeductions: Number(item.statutory_deductions),
          grossEarnings: Number(item.gross_earnings),
          totalDeductions: Number(item.total_deductions),
          netPay: Number(item.net_pay),
        });

        await this.slipRepo.recordVersion({
          id: `pv_${item.id}_v1`,
          payroll_item_id: item.id,
          payroll_run_id: runId,
          employee_id: item.employee_id,
          version: 1,
          basic_salary: Number(item.basic_salary),
          allowances: Number(item.allowances),
          incentives: Number(item.early_incentive || 0) + Number(item.sales_incentive || 0),
          overtime_pay: Number(item.overtime_pay || 0),
          penalties: Number(item.late_penalties || 0) + Number(item.break_penalties || 0),
          statutory_deductions: Number(item.statutory_deductions || 0),
          gross_earnings: Number(item.gross_earnings),
          total_deductions: Number(item.total_deductions),
          net_pay: Number(item.net_pay),
          pdf_path: pdf.filePath,
        });

        count++;
      } catch (err: any) {
        console.warn(`[PayrollService] Failed to generate PDF for payslip ${item.id}:`, err.message);
      }
    }

    await this.payrollRepo.updateRunStatus(runId, 'FINALIZED');
    return { generatedCount: count, runId };
  }
}
