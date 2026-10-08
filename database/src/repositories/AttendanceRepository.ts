import { query, queryOne } from '../pool.js';

export interface AttendanceRow {
  id: string;
  employee_id: string;
  location_id: string;
  shift_id: string | null;
  attendance_date: string;
  punch_in: Date | null;
  punch_out: Date | null;
  status: string;
  early_login_incentive: number;
  late_login_penalty: number;
  overtime_seconds: number;
  early_seconds: number;
  late_seconds: number;
  is_face_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export class AttendanceRepository {
  static async findByEmployeeAndDate(employeeId: string, date: string): Promise<AttendanceRow | null> {
    return queryOne<AttendanceRow>(
      `SELECT * FROM attendance WHERE (employee_id = ? OR employeeId = ?) AND (attendance_date = ? OR attendanceDate = ?) LIMIT 1`,
      [employeeId, employeeId, date, date]
    );
  }

  static async listByLocationAndDate(locationId: string, date: string): Promise<AttendanceRow[]> {
    return query<AttendanceRow>(
      `SELECT * FROM attendance WHERE (location_id = ? OR locationId = ?) AND (attendance_date = ? OR attendanceDate = ?) ORDER BY punch_in DESC`,
      [locationId, locationId, date, date]
    );
  }

  static async recordPunchIn(
    id: string,
    employeeId: string,
    locationId: string,
    shiftId: string | null,
    date: string,
    punchIn: Date,
    earlyIncentive: number = 0
  ): Promise<void> {
    await query(
      `INSERT INTO attendance (id, employeeId, locationId, shiftId, attendanceDate, actualLogin, status, earlyLoginIncentive, faceVerified)
       VALUES (?, ?, ?, ?, ?, ?, 'PRESENT', ?, TRUE)
       ON DUPLICATE KEY UPDATE actualLogin = VALUES(actualLogin), earlyLoginIncentive = VALUES(earlyLoginIncentive)`,
      [id, employeeId, locationId, shiftId, date, punchIn, earlyIncentive]
    );
  }

  static async recordPunchOut(
    employeeId: string,
    date: string,
    punchOut: Date,
    overtimeSeconds: number = 0
  ): Promise<void> {
    await query(
      `UPDATE attendance 
       SET actualLogout = ?, overtimeSeconds = ?, updatedAt = NOW(3)
       WHERE (employee_id = ? OR employeeId = ?) AND (attendance_date = ? OR attendanceDate = ?)`,
      [punchOut, overtimeSeconds, employeeId, employeeId, date, date]
    );
  }
}
