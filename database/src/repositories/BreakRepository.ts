import { query, queryOne } from '../pool.js';

export interface BreakRow {
  id: string;
  employeeId: string;
  breakType: 'LUNCH' | 'TEA' | 'OTHER';
  breakDate: string;
  startTime: Date | null;
  endTime: Date | null;
  allowedDuration: number;
  actualDuration: number | null;
  excessDuration: number | null;
  status: 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED' | 'EXCEEDED' | 'MANUALLY_ADJUSTED';
  qrScanId: string | null;
}

export class BreakRepository {
  static async getActiveBreak(employeeId: string): Promise<BreakRow | null> {
    return queryOne<BreakRow>(
      `SELECT * FROM EmployeeBreak WHERE employeeId = ? AND status = 'ACTIVE' LIMIT 1`,
      [employeeId]
    );
  }

  static async startBreak(
    id: string,
    employeeId: string,
    breakType: 'LUNCH' | 'TEA' | 'OTHER',
    allowedDurationMinutes: number,
    qrScanId?: string
  ): Promise<void> {
    await query(
      `INSERT INTO EmployeeBreak (id, employeeId, breakType, breakDate, startTime, allowedDuration, status, qrScanId)
       VALUES (?, ?, ?, CURDATE(), NOW(3), ?, 'ACTIVE', ?)`,
      [id, employeeId, breakType, allowedDurationMinutes, qrScanId || null]
    );
  }

  static async endBreak(
    breakId: string,
    durationSeconds: number,
    excessSeconds: number,
    status: 'COMPLETED' | 'EXCEEDED'
  ): Promise<void> {
    await query(
      `UPDATE EmployeeBreak
       SET status = ?, endTime = NOW(3), actualDuration = ?, excessDuration = ?
       WHERE id = ?`,
      [status, durationSeconds, excessSeconds, breakId]
    );
  }
}
