import { query, queryOne } from '../pool.js';

export interface AttendanceRow {
  id: string;
  employeeId: string;
  locationId: string;
  shiftId: string | null;
  attendanceDate: string;
  scheduledLogin: Date | null;
  actualLogin: Date | null;
  scheduledLogout: Date | null;
  actualLogout: Date | null;
  earlyLoginSeconds: number;
  lateLoginSeconds: number;
  earlyLogoutSeconds: number;
  overtimeSeconds: number;
  totalWorkingSeconds: number;
  breakSeconds: number;
  effectiveWorkingSeconds: number;
  earlyLoginIncentive: number;
  lateLoginPenalty: number;
  overtimeIncentive: number;
  earlyLogoutPenalty: number;
  status: string;
  faceVerified: boolean;
  faceMatchPercentage: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AttendanceRepository {
  static async findByEmployeeAndDate(employeeId: string, date: string): Promise<AttendanceRow | null> {
    return queryOne<AttendanceRow>(
      `SELECT * FROM Attendance WHERE employeeId = ? AND attendanceDate = ? LIMIT 1`,
      [employeeId, date]
    );
  }

  static async listByLocationAndDate(locationId: string, date: string): Promise<AttendanceRow[]> {
    return query<AttendanceRow>(
      `SELECT * FROM Attendance WHERE locationId = ? AND attendanceDate = ? ORDER BY actualLogin DESC`,
      [locationId, date]
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
      `INSERT INTO Attendance (id, employeeId, locationId, shiftId, attendanceDate, actualLogin, status, earlyLoginIncentive, faceVerified)
       VALUES (?, ?, ?, ?, ?, ?, 'PRESENT', ?, FALSE)
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
      `UPDATE Attendance
       SET actualLogout = ?, overtimeSeconds = ?, updatedAt = NOW(3)
       WHERE employeeId = ? AND attendanceDate = ?`,
      [punchOut, overtimeSeconds, employeeId, date]
    );
  }
}
