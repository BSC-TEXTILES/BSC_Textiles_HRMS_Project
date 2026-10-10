import { BaseRepository } from '../repositories/BaseRepository.js';

export class HrmReportService extends BaseRepository<any> {
  protected readonly tableName = 'employees';

  public async getSettlementSummaryReport(locationId?: string): Promise<any[]> {
    let sql = `
      SELECT fnf.*, e.employee_code, e.full_name as employee_name,
             l.name as location_name, d.name as department_name,
             ex.exit_type, ex.last_working_day
      FROM fnf_settlements fnf
      JOIN employees e ON fnf.employee_id = e.id
      JOIN employee_exits ex ON fnf.exit_id = ex.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (locationId) {
      sql += ` AND e.location_id = ?`;
      params.push(locationId);
    }
    sql += ` ORDER BY fnf.created_at DESC`;
    return this.query(sql, params);
  }

  public async getLeaveUtilizationReport(year = 2026, locationId?: string): Promise<any[]> {
    let sql = `
      SELECT lt.name as leave_type, lt.code,
             COUNT(DISTINCT lb.employee_id) as enrolledEmployees,
             SUM(lb.total_credited) as totalCredited,
             SUM(lb.used) as totalUsed,
             SUM(lb.balance) as totalBalance
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      JOIN employees e ON lb.employee_id = e.id
      WHERE lb.year = ?
    `;
    const params: any[] = [year];
    if (locationId) {
      sql += ` AND e.location_id = ?`;
      params.push(locationId);
    }
    sql += ` GROUP BY lt.id, lt.name, lt.code`;
    return this.query(sql, params);
  }
}
