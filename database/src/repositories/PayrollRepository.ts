import { query, queryOne } from '../pool.js';

export interface PayrollRunRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'PROCESSING' | 'APPROVED' | 'LOCKED' | 'PUBLISHED';
  processedBy: string | null;
  processedAt: Date | null;
}

export class PayrollRepository {
  static async getLatestRun(locationId: string): Promise<PayrollRunRow | null> {
    return queryOne<PayrollRunRow>(
      `SELECT DISTINCT r.id, r.periodStart, r.periodEnd, r.status, r.processedBy, r.processedAt
       FROM PayrollRun r
       JOIN PayrollItem pi ON pi.payrollRunId = r.id
       JOIN Employee e ON e.id = pi.employeeId
       WHERE e.locationId = ?
       ORDER BY r.periodEnd DESC LIMIT 1`,
      [locationId]
    );
  }

  static async listRuns(): Promise<PayrollRunRow[]> {
    return query<PayrollRunRow>(
      `SELECT id, periodStart, periodEnd, status, processedBy, processedAt
       FROM PayrollRun ORDER BY periodEnd DESC`
    );
  }

  static async getRunItems(runId: string): Promise<any[]> {
    return query<any>(
      `SELECT pi.*, e.employeeCode, e.fullName
       FROM PayrollItem pi
       JOIN Employee e ON pi.employeeId = e.id
       WHERE pi.payrollRunId = ?
       ORDER BY e.employeeCode ASC`,
      [runId]
    );
  }
}
