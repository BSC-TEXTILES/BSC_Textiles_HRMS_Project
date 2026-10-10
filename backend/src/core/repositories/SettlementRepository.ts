import { BaseRepository } from './BaseRepository.js';

export interface SettlementEntity {
  id: string;
  exit_id: string;
  employee_id: string;
  status: 'DRAFT' | 'HR_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAYMENT_PENDING' | 'PAID' | 'CLOSED' | 'CANCELLED';
  approved_last_working_day: string;
  unpaid_salary_days: number;
  unpaid_salary_amount: number;
  gratuity_amount: number;
  leave_encashment_days: number;
  leave_encashment_amount: number;
  bonus_incentive_amount: number;
  other_earnings: number;
  total_earnings: number;
  notice_shortfall_days: number;
  notice_recovery_amount: number;
  salary_advance_recovery: number;
  loan_balance_recovery: number;
  asset_damage_recovery: number;
  statutory_deductions: number;
  other_deductions: number;
  total_deductions: number;
  net_payable: number;
  calculation_breakdown_json: any;
  statement_pdf_path: string | null;
  remarks: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  payment_reference: string | null;
  payment_mode: string | null;
  payment_date: string | null;
  created_at: Date;
  updated_at: Date;
}

export class SettlementRepository extends BaseRepository<SettlementEntity> {
  protected readonly tableName = 'fnf_settlements';

  public async findByExitId(exitId: string): Promise<SettlementEntity | null> {
    return this.queryOne<SettlementEntity>(
      `SELECT * FROM ${this.tableName} WHERE exit_id = ? LIMIT 1`,
      [exitId]
    );
  }

  public async findByEmployeeId(employeeId: string): Promise<SettlementEntity | null> {
    return this.queryOne<SettlementEntity>(
      `SELECT * FROM ${this.tableName} WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1`,
      [employeeId]
    );
  }

  public async saveSettlement(data: Partial<SettlementEntity>): Promise<void> {
    const sql = `
      INSERT INTO fnf_settlements (
        id, exit_id, employee_id, status, approved_last_working_day,
        unpaid_salary_days, unpaid_salary_amount, gratuity_amount,
        leave_encashment_days, leave_encashment_amount, bonus_incentive_amount,
        other_earnings, total_earnings, notice_shortfall_days, notice_recovery_amount,
        salary_advance_recovery, loan_balance_recovery, asset_damage_recovery,
        statutory_deductions, other_deductions, total_deductions, net_payable,
        calculation_breakdown_json, remarks, prepared_by
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        approved_last_working_day = VALUES(approved_last_working_day),
        unpaid_salary_days = VALUES(unpaid_salary_days),
        unpaid_salary_amount = VALUES(unpaid_salary_amount),
        gratuity_amount = VALUES(gratuity_amount),
        leave_encashment_days = VALUES(leave_encashment_days),
        leave_encashment_amount = VALUES(leave_encashment_amount),
        bonus_incentive_amount = VALUES(bonus_incentive_amount),
        other_earnings = VALUES(other_earnings),
        total_earnings = VALUES(total_earnings),
        notice_shortfall_days = VALUES(notice_shortfall_days),
        notice_recovery_amount = VALUES(notice_recovery_amount),
        salary_advance_recovery = VALUES(salary_advance_recovery),
        loan_balance_recovery = VALUES(loan_balance_recovery),
        asset_damage_recovery = VALUES(asset_damage_recovery),
        statutory_deductions = VALUES(statutory_deductions),
        other_deductions = VALUES(other_deductions),
        total_deductions = VALUES(total_deductions),
        net_payable = VALUES(net_payable),
        calculation_breakdown_json = VALUES(calculation_breakdown_json),
        remarks = VALUES(remarks),
        updated_at = NOW()
    `;

    await this.execute(sql, [
      data.id,
      data.exit_id,
      data.employee_id,
      data.status || 'DRAFT',
      data.approved_last_working_day,
      data.unpaid_salary_days || 0,
      data.unpaid_salary_amount || 0,
      data.gratuity_amount || 0,
      data.leave_encashment_days || 0,
      data.leave_encashment_amount || 0,
      data.bonus_incentive_amount || 0,
      data.other_earnings || 0,
      data.total_earnings || 0,
      data.notice_shortfall_days || 0,
      data.notice_recovery_amount || 0,
      data.salary_advance_recovery || 0,
      data.loan_balance_recovery || 0,
      data.asset_damage_recovery || 0,
      data.statutory_deductions || 0,
      data.other_deductions || 0,
      data.total_deductions || 0,
      data.net_payable || 0,
      data.calculation_breakdown_json ? JSON.stringify(data.calculation_breakdown_json) : null,
      data.remarks || null,
      data.prepared_by || null,
    ]);
  }

  public async recordAdjustment(data: {
    id: string;
    settlement_id: string;
    field_name: string;
    old_value: string;
    new_value: string;
    reason: string;
    changed_by: string;
  }): Promise<void> {
    await this.execute(
      `INSERT INTO fnf_adjustments (id, settlement_id, field_name, old_value, new_value, reason, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.settlement_id, data.field_name, data.old_value, data.new_value, data.reason, data.changed_by]
    );
  }

  public async approveSettlement(settlementId: string, approvedBy: string): Promise<void> {
    await this.execute(
      `UPDATE fnf_settlements SET status = 'APPROVED', approved_by = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [approvedBy, settlementId]
    );
  }

  public async recordPayment(settlementId: string, paymentRef: string, paymentMode: string, paymentDate: string): Promise<void> {
    await this.execute(
      `UPDATE fnf_settlements 
       SET status = 'PAID', payment_reference = ?, payment_mode = ?, payment_date = ?, updated_at = NOW() 
       WHERE id = ?`,
      [paymentRef, paymentMode, paymentDate, settlementId]
    );
  }

  public async updatePdfPath(settlementId: string, pdfPath: string): Promise<void> {
    await this.execute(
      `UPDATE fnf_settlements SET statement_pdf_path = ?, updated_at = NOW() WHERE id = ?`,
      [pdfPath, settlementId]
    );
  }
}
