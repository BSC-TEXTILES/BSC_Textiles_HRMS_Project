import { AttendanceRepository, AttendanceEntity } from '../repositories/AttendanceRepository.js';

export class AttendanceService {
  constructor(private readonly attendanceRepo: AttendanceRepository) {}

  public async getAttendanceForDate(employeeId: string, date: string): Promise<AttendanceEntity | null> {
    return this.attendanceRepo.getAttendanceForDate(employeeId, date);
  }

  public async getMonthlySummary(employeeId: string, yearMonth: string): Promise<{
    present: number;
    absent: number;
    late: number;
    halfDay: number;
  }> {
    return this.attendanceRepo.getMonthlyAttendanceCount(employeeId, yearMonth);
  }
}
