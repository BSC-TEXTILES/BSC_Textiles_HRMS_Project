import { BaseRepository } from './BaseRepository.js';

export interface PayrollRunEntity {
  id: string;
  location_id: string;
  period_start: string;
  period_end: string;
  status: 'DRAFT' | 'PROCESSING' | 'FINALIZED' | 'PAID' | 'CANCELLED';
  processed_by: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class PayrollRepository extends BaseRepository<PayrollRunEntity> {
  protected readonly tableName = 'payroll_runs';

  public async getLatestRun(locationId?: string): Promise<PayrollRunEntity | null> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    if (locationId) {
      sql += ` WHERE location_id = ?`;
      params.push(locationId);
    }
    sql += ` ORDER BY period_end DESC LIMIT 1`;
    return this.queryOne<PayrollRunEntity>(sql, params);
  }

  public async getItemsForRun(runId: string): Promise<any[]> {
    const sql = `
      SELECT pi.*, e.employee_code, e.full_name as employee_name, e.email,
             l.name as location_name, d.name as department_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.payroll_run_id = ?
      ORDER BY e.employee_code ASC
    `;
    return this.query(sql, [runId]);
  }

  public async updateRunStatus(runId: string, status: string): Promise<void> {
    await this.execute(
      `UPDATE ${this.tableName} SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, runId]
    );
  }
}
