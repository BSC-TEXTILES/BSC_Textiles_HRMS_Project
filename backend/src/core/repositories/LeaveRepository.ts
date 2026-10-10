import { BaseRepository } from './BaseRepository.js';

export interface LeaveTypeEntity {
  id: string;
  code: string;
  name: string;
  annual_quota: number;
  is_paid: boolean;
  carry_forward_max: number;
  requires_document: boolean;
  description: string | null;
  is_active: boolean;
}

export interface LeaveBalanceEntity {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_credited: number;
  used: number;
  pending: number;
  balance: number;
  leave_type_code?: string;
  leave_type_name?: string;
  is_paid?: boolean;
}

export interface LeaveApplicationEntity {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  half_day_session: 'FIRST_HALF' | 'SECOND_HALF' | null;
  days_count: number;
  reason: string;
  document_url: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
  employee_code?: string;
  employee_name?: string;
  leave_type_code?: string;
  leave_type_name?: string;
}

export class LeaveRepository extends BaseRepository<LeaveApplicationEntity> {
  protected readonly tableName = 'leave_applications';

  public async getLeaveTypes(): Promise<LeaveTypeEntity[]> {
    return this.query<LeaveTypeEntity>(
      `SELECT * FROM leave_types WHERE is_active = TRUE ORDER BY code ASC`
    );
  }

  public async getBalancesByEmployee(employeeId: string, year = 2026): Promise<LeaveBalanceEntity[]> {
    const sql = `
      SELECT lb.*, lt.code as leave_type_code, lt.name as leave_type_name, lt.is_paid
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = ? AND lb.year = ?
      ORDER BY lt.code ASC
    `;
    return this.query<LeaveBalanceEntity>(sql, [employeeId, year]);
  }

  public async getBalanceForType(employeeId: string, leaveTypeId: string, year = 2026): Promise<LeaveBalanceEntity | null> {
    const sql = `
      SELECT lb.*, lt.code as leave_type_code, lt.name as leave_type_name, lt.is_paid
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = ? AND lb.leave_type_id = ? AND lb.year = ?
      LIMIT 1
    `;
    return this.queryOne<LeaveBalanceEntity>(sql, [employeeId, leaveTypeId, year]);
  }

  public async checkOverlap(employeeId: string, startDate: string, endDate: string, excludeId?: string): Promise<boolean> {
    let sql = `
      SELECT COUNT(*) as count FROM leave_applications
      WHERE employee_id = ?
        AND status IN ('PENDING', 'APPROVED')
        AND (start_date <= ? AND end_date >= ?)
    `;
    const params: any[] = [employeeId, endDate, startDate];
    if (excludeId) {
      sql += ` AND id != ?`;
      params.push(excludeId);
    }
    const res = await this.queryOne<{ count: number }>(sql, params);
    return Number(res?.count || 0) > 0;
  }

  public async createApplication(data: {
    id: string;
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    is_half_day: boolean;
    half_day_session?: string | null;
    days_count: number;
    reason: string;
    document_url?: string | null;
  }): Promise<void> {
    const sql = `
      INSERT INTO leave_applications (
        id, employee_id, leave_type_id, start_date, end_date,
        is_half_day, half_day_session, days_count, reason, document_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `;
    await this.execute(sql, [
      data.id,
      data.employee_id,
      data.leave_type_id,
      data.start_date,
      data.end_date,
      data.is_half_day ? 1 : 0,
      data.half_day_session || null,
      data.days_count,
      data.reason,
      data.document_url || null,
    ]);
  }

  public async updateBalance(
    employeeId: string,
    leaveTypeId: string,
    year: number,
    usedDelta: number,
    balanceDelta: number,
    pendingDelta: number
  ): Promise<void> {
    await this.execute(
      `UPDATE leave_balances 
       SET used = used + ?, balance = balance + ?, pending = pending + ?, updated_at = NOW() 
       WHERE employee_id = ? AND leave_type_id = ? AND year = ?`,
      [usedDelta, balanceDelta, pendingDelta, employeeId, leaveTypeId, year]
    );
  }

  public async recordLedger(data: {
    id: string;
    employee_id: string;
    leave_type_id: string;
    application_id?: string | null;
    transaction_type: 'CREDIT' | 'DEBIT' | 'ENCASHMENT' | 'ADJUSTMENT' | 'LAPSE';
    days: number;
    balance_after: number;
    description: string;
    created_by?: string | null;
  }): Promise<void> {
    await this.execute(
      `INSERT INTO leave_ledger (id, employee_id, leave_type_id, application_id, transaction_type, days, balance_after, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.employee_id,
        data.leave_type_id,
        data.application_id || null,
        data.transaction_type,
        data.days,
        data.balance_after,
        data.description,
        data.created_by || null,
      ]
    );
  }

  public async listApplications(options: {
    employeeId?: string;
    locationId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ applications: LeaveApplicationEntity[]; total: number }> {
    const { employeeId, locationId, status, limit = 20, offset = 0 } = options;
    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (employeeId) {
      whereClauses.push('la.employee_id = ?');
      params.push(employeeId);
    }
    if (locationId) {
      whereClauses.push('e.location_id = ?');
      params.push(locationId);
    }
    if (status && status !== 'all') {
      whereClauses.push('la.status = ?');
      params.push(status);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count 
       FROM leave_applications la
       JOIN employees e ON la.employee_id = e.id
       WHERE ${whereSql}`,
      params
    );
    const total = Number(countRes?.count || 0);

    const sql = `
      SELECT la.*, e.employee_code, e.full_name as employee_name,
             lt.code as leave_type_code, lt.name as leave_type_name
      FROM leave_applications la
      JOIN employees e ON la.employee_id = e.id
      JOIN leave_types lt ON la.leave_type_id = lt.id
      WHERE ${whereSql}
      ORDER BY la.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const applications = await this.query<LeaveApplicationEntity>(sql, [
      ...params,
      Number(limit),
      Number(offset),
    ]);
    return { applications, total };
  }

  public async updateApplicationStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    reviewedBy?: string,
    rejectionReason?: string
  ): Promise<void> {
    await this.execute(
      `UPDATE leave_applications 
       SET status = ?, reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?, updated_at = NOW() 
       WHERE id = ?`,
      [status, reviewedBy || null, rejectionReason || null, id]
    );
  }
}
