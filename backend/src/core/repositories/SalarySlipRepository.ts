import { BaseRepository } from './BaseRepository.js';

export interface PayslipItemEntity {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  basic_salary: number;
  allowances: number;
  early_incentive: number;
  sales_incentive: number;
  attendance_incentive: number;
  overtime_pay: number;
  late_penalties: number;
  break_penalties: number;
  statutory_deductions: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  created_at: Date;
  employee_code?: string;
  employee_name?: string;
  department_name?: string;
  designation?: string;
  location_name?: string;
  period_start?: string;
  period_end?: string;
  run_status?: string;
}

export interface PayslipVersionEntity {
  id: string;
  payroll_item_id: string;
  payroll_run_id: string;
  employee_id: string;
  version: number;
  is_superseded: boolean;
  basic_salary: number;
  allowances: number;
  incentives: number;
  overtime_pay: number;
  penalties: number;
  statutory_deductions: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  pdf_path: string | null;
  edited_by: string | null;
  edit_reason: string | null;
  created_at: Date;
}

export class SalarySlipRepository extends BaseRepository<PayslipItemEntity> {
  protected readonly tableName = 'payroll_items';

  public async getPayslipById(id: string): Promise<PayslipItemEntity | null> {
    const sql = `
      SELECT pi.*, pr.period_start, pr.period_end, pr.status as run_status,
             e.employee_code, e.full_name as employee_name,
             l.name as location_name, d.name as department_name
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.id = ? LIMIT 1
    `;
    return this.queryOne<PayslipItemEntity>(sql, [id]);
  }

  public async listByEmployee(employeeId: string): Promise<PayslipItemEntity[]> {
    const sql = `
      SELECT pi.*, pr.period_start, pr.period_end, pr.status as run_status,
             e.employee_code, e.full_name as employee_name,
             l.name as location_name, d.name as department_name
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.employee_id = ?
      ORDER BY pr.period_start DESC
    `;
    return this.query<PayslipItemEntity>(sql, [employeeId]);
  }

  public async getLatestVersion(payrollItemId: string): Promise<number> {
    const res = await this.queryOne<{ max_version: number }>(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM payslip_versions WHERE payroll_item_id = ?`,
      [payrollItemId]
    );
    return Number(res?.max_version || 0);
  }

  public async recordVersion(data: {
    id: string;
    payroll_item_id: string;
    payroll_run_id: string;
    employee_id: string;
    version: number;
    basic_salary: number;
    allowances: number;
    incentives: number;
    overtime_pay: number;
    penalties: number;
    statutory_deductions: number;
    gross_earnings: number;
    total_deductions: number;
    net_pay: number;
    pdf_path?: string | null;
    edited_by?: string | null;
    edit_reason?: string | null;
  }): Promise<void> {
    // Mark previous versions as superseded
    await this.execute(
      `UPDATE payslip_versions SET is_superseded = TRUE WHERE payroll_item_id = ?`,
      [data.payroll_item_id]
    );

    const sql = `
      INSERT INTO payslip_versions (
        id, payroll_item_id, payroll_run_id, employee_id, version, is_superseded,
        basic_salary, allowances, incentives, overtime_pay, penalties, statutory_deductions,
        gross_earnings, total_deductions, net_pay, pdf_path, edited_by, edit_reason
      ) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      data.id,
      data.payroll_item_id,
      data.payroll_run_id,
      data.employee_id,
      data.version,
      data.basic_salary,
      data.allowances,
      data.incentives,
      data.overtime_pay,
      data.penalties,
      data.statutory_deductions,
      data.gross_earnings,
      data.total_deductions,
      data.net_pay,
      data.pdf_path || null,
      data.edited_by || null,
      data.edit_reason || null,
    ]);
  }

  public async getVersions(payrollItemId: string): Promise<PayslipVersionEntity[]> {
    return this.query<PayslipVersionEntity>(
      `SELECT * FROM payslip_versions WHERE payroll_item_id = ? ORDER BY version DESC`,
      [payrollItemId]
    );
  }

  public async updatePayrollItemAmounts(
    id: string,
    amounts: {
      basic_salary: number;
      allowances: number;
      statutory_deductions: number;
      gross_earnings: number;
      total_deductions: number;
      net_pay: number;
    }
  ): Promise<void> {
    await this.execute(
      `UPDATE payroll_items 
       SET basic_salary = ?, allowances = ?, statutory_deductions = ?, 
           gross_earnings = ?, total_deductions = ?, net_pay = ?
       WHERE id = ?`,
      [
        amounts.basic_salary,
        amounts.allowances,
        amounts.statutory_deductions,
        amounts.gross_earnings,
        amounts.total_deductions,
        amounts.net_pay,
        id,
      ]
    );
  }
}
