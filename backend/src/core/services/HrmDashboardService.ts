import { BaseRepository } from '../repositories/BaseRepository.js';

export interface FormerEmployeesDashboardStats {
  totalFormerEmployees: number;
  totalExits?: number;
  resignedCount: number;
  resigned?: number;
  terminatedCount: number;
  terminated?: number;
  retiredCount: number;
  retired?: number;
  awaitingClearance: number;
  awaitingCalculation: number;
  pendingReview: number;
  pendingHrReview?: number;
  pendingApproval: number;
  readyForPayment: number;
  closedAndPaid: number;
  closedPaid?: number;
  overdueSettlements: number;
  overdueCount?: number;
  pendingLeavesCount: number;
}

export class HrmDashboardService extends BaseRepository<any> {
  protected readonly tableName = 'employees';

  public async getFormerEmployeesStats(locationId?: string): Promise<FormerEmployeesDashboardStats> {
    const locFilter = locationId ? `AND e.location_id = ?` : '';
    const params = locationId ? [locationId] : [];

    // Aggregate query for former employees
    const empStats = await this.queryOne<any>(
      `SELECT 
        COUNT(CASE WHEN e.status IN ('EX_EMPLOYEE', 'RESIGNED', 'TERMINATED', 'RETIRED') THEN 1 END) as totalFormer,
        COUNT(CASE WHEN e.status = 'RESIGNED' OR ex.exit_type = 'RESIGNATION' THEN 1 END) as resigned,
        COUNT(CASE WHEN e.status = 'TERMINATED' OR ex.exit_type = 'TERMINATION' THEN 1 END) as \`terminated\`,
        COUNT(CASE WHEN e.status = 'RETIRED' OR ex.exit_type = 'RETIREMENT' THEN 1 END) as retired
       FROM employees e
       LEFT JOIN employee_exits ex ON ex.employee_id = e.id
       WHERE 1=1 ${locFilter}`,
      params
    );

    // Aggregate query for exit & F&F workflow stages
    const fnfStats = await this.queryOne<any>(
      `SELECT
        COUNT(CASE WHEN ex.status = 'CLEARANCE_PENDING' THEN 1 END) as awaitingClearance,
        COUNT(CASE WHEN ex.status = 'SETTLEMENT_PENDING' THEN 1 END) as awaitingCalculation,
        COUNT(CASE WHEN fnf.status = 'HR_REVIEW' THEN 1 END) as pendingReview,
        COUNT(CASE WHEN fnf.status = 'PENDING_APPROVAL' THEN 1 END) as pendingApproval,
        COUNT(CASE WHEN fnf.status = 'APPROVED' OR fnf.status = 'PAYMENT_PENDING' THEN 1 END) as readyForPayment,
        COUNT(CASE WHEN fnf.status = 'PAID' OR fnf.status = 'CLOSED' THEN 1 END) as closedAndPaid,
        COUNT(CASE WHEN fnf.status NOT IN ('PAID', 'CLOSED', 'CANCELLED') AND ex.last_working_day < DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as overdue
       FROM employee_exits ex
       JOIN employees e ON ex.employee_id = e.id
       LEFT JOIN fnf_settlements fnf ON fnf.exit_id = ex.id
       WHERE 1=1 ${locFilter}`,
      params
    );

    // Pending leaves count
    const leaveStats = await this.queryOne<{ pendingCount: number }>(
      `SELECT COUNT(*) as pendingCount 
       FROM leave_applications la
       JOIN employees e ON la.employee_id = e.id
       WHERE la.status = 'PENDING' ${locFilter}`,
      params
    );

    return {
      totalFormerEmployees: Number(empStats?.totalFormer || 0),
      totalExits: Number(empStats?.totalFormer || 0),
      resignedCount: Number(empStats?.resigned || 0),
      resigned: Number(empStats?.resigned || 0),
      terminatedCount: Number(empStats?.terminated || 0),
      terminated: Number(empStats?.terminated || 0),
      retiredCount: Number(empStats?.retired || 0),
      retired: Number(empStats?.retired || 0),
      awaitingClearance: Number(fnfStats?.awaitingClearance || 0),
      awaitingCalculation: Number(fnfStats?.awaitingCalculation || 0),
      pendingReview: Number(fnfStats?.pendingReview || 0),
      pendingHrReview: Number(fnfStats?.pendingReview || 0),
      pendingApproval: Number(fnfStats?.pendingApproval || 0),
      readyForPayment: Number(fnfStats?.readyForPayment || 0),
      closedAndPaid: Number(fnfStats?.closedAndPaid || 0),
      closedPaid: Number(fnfStats?.closedAndPaid || 0),
      overdueSettlements: Number(fnfStats?.overdue || 0),
      pendingLeavesCount: Number(leaveStats?.pendingCount || 0),
    };
  }
}
