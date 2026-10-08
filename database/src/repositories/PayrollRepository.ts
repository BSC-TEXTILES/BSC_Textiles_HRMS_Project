import { query, queryOne } from '../pool.js';

export interface PayrollRunRow {
  id: string;
  location_id: string;
  period_start: string;
  period_end: string;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED';
  processed_by: string;
  processed_at: Date;
}

export class PayrollRepository {
  static async getLatestRun(locationId: string): Promise<PayrollRunRow | null> {
    return queryOne<PayrollRunRow>(
      `SELECT * FROM payroll_runs WHERE location_id = ? ORDER BY period_end DESC LIMIT 1`,
      [locationId]
    );
  }

  static async listRuns(locationId: string): Promise<PayrollRunRow[]> {
    return query<PayrollRunRow>(
      `SELECT * FROM payroll_runs WHERE location_id = ? ORDER BY period_end DESC`,
      [locationId]
    );
  }

  static async getRunItems(runId: string): Promise<any[]> {
    return query<any>(
      `SELECT pi.*, e.employee_code, e.full_name
       FROM payroll_items pi
       JOIN employees e ON pi.employee_id = e.id
       WHERE pi.payroll_run_id = ?
       ORDER BY e.employee_code ASC`,
      [runId]
    );
  }
}
