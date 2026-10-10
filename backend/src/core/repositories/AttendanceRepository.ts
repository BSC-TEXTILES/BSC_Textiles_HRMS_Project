import { BaseRepository } from './BaseRepository.js';

export interface AttendanceEntity {
  id: string;
  employeeId: string;
  locationId: string;
  shiftId: string;
  attendanceDate: string;
  actualLogin: string | null;
  actualLogout: string | null;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY';
  earlyLoginIncentive: number;
  latePenalty: number;
  overtimeMinutes: number;
  overtimePay: number;
  faceVerified: boolean;
  qrVerified: boolean;
  created_at: Date;
}

export class AttendanceRepository extends BaseRepository<AttendanceEntity> {
  protected readonly tableName = 'attendance';

  public async getAttendanceForDate(employeeId: string, date: string): Promise<AttendanceEntity | null> {
    return this.queryOne<AttendanceEntity>(
      `SELECT * FROM ${this.tableName} WHERE employeeId = ? AND attendanceDate = ? LIMIT 1`,
      [employeeId, date]
    );
  }

  public async getMonthlyAttendanceCount(employeeId: string, yearMonth: string): Promise<{
    present: number;
    absent: number;
    late: number;
    halfDay: number;
  }> {
    const rows = await this.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count 
       FROM ${this.tableName} 
       WHERE employeeId = ? AND attendanceDate LIKE ? 
       GROUP BY status`,
      [employeeId, `${yearMonth}%`]
    );

    const counts = { present: 0, absent: 0, late: 0, halfDay: 0 };
    for (const r of rows) {
      if (r.status === 'PRESENT') counts.present = Number(r.count);
      else if (r.status === 'ABSENT') counts.absent = Number(r.count);
      else if (r.status === 'LATE') counts.late = Number(r.count);
      else if (r.status === 'HALF_DAY') counts.halfDay = Number(r.count);
    }
    return counts;
  }
}
