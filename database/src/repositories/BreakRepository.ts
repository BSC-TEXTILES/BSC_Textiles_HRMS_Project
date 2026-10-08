import { query, queryOne } from '../pool.js';

export interface BreakRow {
  id: string;
  employee_id: string;
  attendance_id: string;
  type: 'LUNCH' | 'TEA' | 'OTHER';
  status: 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED' | 'EXCEEDED' | 'MANUALLY_ADJUSTED';
  start_time: Date;
  end_time: Date | null;
  allocated_minutes: number;
  actual_duration_seconds: number;
  overrun_seconds: number;
  overrun_penalty: number;
  qr_scan_id: string | null;
}

export class BreakRepository {
  static async getActiveBreak(employeeId: string): Promise<BreakRow | null> {
    return queryOne<BreakRow>(
      `SELECT * FROM breaks WHERE employee_id = ? AND status = 'ACTIVE' LIMIT 1`,
      [employeeId]
    );
  }

  static async startBreak(
    id: string,
    employeeId: string,
    attendanceId: string,
    type: 'LUNCH' | 'TEA' | 'OTHER',
    allocatedMinutes: number,
    qrScanId?: string
  ): Promise<void> {
    await query(
      `INSERT INTO breaks (id, employee_id, attendance_id, type, status, start_time, allocated_minutes, qr_scan_id)
       VALUES (?, ?, ?, ?, 'ACTIVE', NOW(3), ?, ?)`,
      [id, employeeId, attendanceId, type, allocatedMinutes, qrScanId || null]
    );
  }

  static async endBreak(
    breakId: string,
    durationSeconds: number,
    overrunSeconds: number,
    overrunPenalty: number
  ): Promise<void> {
    await query(
      `UPDATE breaks 
       SET status = 'COMPLETED', end_time = NOW(3), actual_duration_seconds = ?, overrun_seconds = ?, overrun_penalty = ?
       WHERE id = ?`,
      [durationSeconds, overrunSeconds, overrunPenalty, breakId]
    );
  }
}
