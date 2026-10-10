import { EmployeeRepository } from '../repositories/EmployeeRepository.js';
import { LeaveRepository } from '../repositories/LeaveRepository.js';
import { SalarySlipRepository } from '../repositories/SalarySlipRepository.js';
import { AttendanceRepository } from '../repositories/AttendanceRepository.js';

export class MobileApiService {
  constructor(
    private readonly employeeRepo: EmployeeRepository,
    private readonly leaveRepo: LeaveRepository,
    private readonly slipRepo: SalarySlipRepository,
    private readonly attendanceRepo: AttendanceRepository
  ) {}

  public async getEmployeeMobileDashboard(employeeId: string): Promise<any> {
    const employee = await this.employeeRepo.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAttendance = await this.attendanceRepo.getAttendanceForDate(employeeId, todayStr);
    const leaveBalances = await this.leaveRepo.getBalancesByEmployee(employeeId, new Date().getFullYear());
    const payslips = await this.slipRepo.listByEmployee(employeeId);
    const latestPayslip = payslips.length > 0 ? payslips[0] : null;

    return {
      employee: {
        id: employee.id,
        code: employee.employee_code,
        name: employee.full_name,
        email: employee.email,
        phone: employee.phone,
        status: employee.status,
      },
      todayAttendance: {
        date: todayStr,
        status: todayAttendance ? todayAttendance.status : 'NOT_PUNCHED',
        loginTime: todayAttendance?.actualLogin || null,
        logoutTime: todayAttendance?.actualLogout || null,
        earlyIncentive: todayAttendance?.earlyLoginIncentive || 0,
      },
      leaveBalances: leaveBalances.map((b) => ({
        code: b.leave_type_code,
        name: b.leave_type_name,
        balance: b.balance,
        used: b.used,
      })),
      latestPayslip: latestPayslip
        ? {
            id: latestPayslip.id,
            period: `${latestPayslip.period_start?.slice(0, 7)}`,
            netPay: latestPayslip.net_pay,
          }
        : null,
    };
  }
}
