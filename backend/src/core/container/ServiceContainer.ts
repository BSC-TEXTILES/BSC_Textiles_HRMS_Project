// Repositories
import { EmployeeRepository } from '../repositories/EmployeeRepository.js';
import { EmployeeExitRepository } from '../repositories/EmployeeExitRepository.js';
import { SettlementRepository } from '../repositories/SettlementRepository.js';
import { PayrollRepository } from '../repositories/PayrollRepository.js';
import { SalarySlipRepository } from '../repositories/SalarySlipRepository.js';
import { AttendanceRepository } from '../repositories/AttendanceRepository.js';
import { LeaveRepository } from '../repositories/LeaveRepository.js';
import { AuditLogRepository } from '../repositories/AuditLogRepository.js';
import { NotificationRepository } from '../repositories/NotificationRepository.js';

// Services
import { EmployeeService } from '../services/EmployeeService.js';
import { EmployeeExitService } from '../services/EmployeeExitService.js';
import { SettlementCalculationService } from '../services/SettlementCalculationService.js';
import { SettlementPdfService } from '../services/SettlementPdfService.js';
import { FullFinalSettlementService } from '../services/FullFinalSettlementService.js';
import { SalarySlipPdfService } from '../services/SalarySlipPdfService.js';
import { SalarySlipService } from '../services/SalarySlipService.js';
import { PayrollService } from '../services/PayrollService.js';
import { LeaveBalanceService } from '../services/LeaveBalanceService.js';
import { LeaveApprovalService } from '../services/LeaveApprovalService.js';
import { LeaveManagementService } from '../services/LeaveManagementService.js';
import { AttendanceService } from '../services/AttendanceService.js';
import { HrmDashboardService } from '../services/HrmDashboardService.js';
import { HrmReportService } from '../services/HrmReportService.js';
import { NotificationService } from '../services/NotificationService.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { MobileApiService } from '../services/MobileApiService.js';

/**
 * ServiceContainer: Dependency Injection Container implementing Inversion of Control
 * Encapsulates instantiation and lifecycle of all HRMS OOP services and repositories.
 */
class ServiceContainer {
  // Repositories
  public readonly employeeRepo = new EmployeeRepository();
  public readonly exitRepo = new EmployeeExitRepository();
  public readonly settlementRepo = new SettlementRepository();
  public readonly payrollRepo = new PayrollRepository();
  public readonly slipRepo = new SalarySlipRepository();
  public readonly attendanceRepo = new AttendanceRepository();
  public readonly leaveRepo = new LeaveRepository();
  public readonly auditRepo = new AuditLogRepository();
  public readonly notifRepo = new NotificationRepository();

  // Helper & Sub-Services
  public readonly calcService = new SettlementCalculationService();
  public readonly settlementPdfService = new SettlementPdfService();
  public readonly salarySlipPdfService = new SalarySlipPdfService();

  // Core Business Services
  public readonly employeeService = new EmployeeService(this.employeeRepo);
  public readonly employeeExitService = new EmployeeExitService(this.exitRepo, this.employeeRepo);
  public readonly fnfSettlementService = new FullFinalSettlementService(
    this.settlementRepo,
    this.exitRepo,
    this.employeeRepo,
    this.leaveRepo,
    this.calcService,
    this.settlementPdfService
  );
  public readonly salarySlipService = new SalarySlipService(
    this.slipRepo,
    this.salarySlipPdfService,
    this.auditRepo
  );
  public readonly payrollService = new PayrollService(
    this.payrollRepo,
    this.slipRepo,
    this.salarySlipPdfService
  );
  public readonly leaveBalanceService = new LeaveBalanceService(this.leaveRepo);
  public readonly leaveApprovalService = new LeaveApprovalService(
    this.leaveRepo,
    this.leaveBalanceService,
    this.auditRepo
  );
  public readonly leaveManagementService = new LeaveManagementService(
    this.leaveRepo,
    this.leaveBalanceService,
    this.leaveApprovalService
  );
  public readonly attendanceService = new AttendanceService(this.attendanceRepo);
  public readonly hrmDashboardService = new HrmDashboardService();
  public readonly hrmReportService = new HrmReportService();
  public readonly notificationService = new NotificationService(this.notifRepo);
  public readonly auditLogService = new AuditLogService(this.auditRepo);
  public readonly mobileApiService = new MobileApiService(
    this.employeeRepo,
    this.leaveRepo,
    this.slipRepo,
    this.attendanceRepo
  );
}

export const container = new ServiceContainer();
export default container;
