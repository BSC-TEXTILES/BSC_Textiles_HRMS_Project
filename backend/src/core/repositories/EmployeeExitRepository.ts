import { BaseRepository } from './BaseRepository.js';

export interface EmployeeExitEntity {
  id: string;
  employee_id: string;
  exit_type: 'RESIGNATION' | 'TERMINATION' | 'RETIREMENT' | 'ABSCONDING' | 'CONTRACT_END';
  resignation_date: string;
  notice_period_days: number;
  last_working_day: string;
  reason: string;
  status: 'INITIATED' | 'CLEARANCE_PENDING' | 'SETTLEMENT_PENDING' | 'HR_REVIEW' | 'APPROVED' | 'PAYMENT_PENDING' | 'PAID' | 'CLOSED' | 'REJECTED';
  initiator_id: string | null;
  created_at: Date;
  updated_at: Date;
  employee_code?: string;
  employee_name?: string;
  location_name?: string;
  department_name?: string;
  base_salary?: number;
}

export interface ExitClearanceTaskEntity {
  id: string;
  exit_id: string;
  department: 'IT' | 'ACCOUNTS' | 'HR' | 'STORE_OPS' | 'SECURITY';
  task_name: string;
  status: 'PENDING' | 'CLEARED' | 'REJECTED' | 'WAIVED';
  remarks: string | null;
  cleared_by: string | null;
  cleared_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class EmployeeExitRepository extends BaseRepository<EmployeeExitEntity> {
  protected readonly tableName = 'employee_exits';

  public async findByEmployeeId(employeeId: string): Promise<EmployeeExitEntity | null> {
    return this.queryOne<EmployeeExitEntity>(
      `SELECT * FROM ${this.tableName} WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1`,
      [employeeId]
    );
  }

  public async getExitWithDetails(exitId: string): Promise<EmployeeExitEntity | null> {
    const sql = `
      SELECT ex.*, e.employee_code, e.full_name as employee_name, e.base_salary,
             l.name as location_name, d.name as department_name
      FROM employee_exits ex
      JOIN employees e ON ex.employee_id = e.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ex.id = ? LIMIT 1
    `;
    return this.queryOne<EmployeeExitEntity>(sql, [exitId]);
  }

  public async createExit(data: {
    id: string;
    employee_id: string;
    exit_type: string;
    resignation_date: string;
    notice_period_days: number;
    last_working_day: string;
    reason: string;
    status: string;
    initiator_id?: string;
  }): Promise<void> {
    const sql = `
      INSERT INTO employee_exits 
      (id, employee_id, exit_type, resignation_date, notice_period_days, last_working_day, reason, status, initiator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      data.id,
      data.employee_id,
      data.exit_type,
      data.resignation_date,
      data.notice_period_days,
      data.last_working_day,
      data.reason,
      data.status,
      data.initiator_id || null,
    ]);
  }

  public async createClearanceTasks(tasks: Array<{
    id: string;
    exit_id: string;
    department: string;
    task_name: string;
  }>): Promise<void> {
    for (const t of tasks) {
      await this.execute(
        `INSERT INTO exit_clearance_tasks (id, exit_id, department, task_name, status) VALUES (?, ?, ?, ?, 'PENDING')`,
        [t.id, t.exit_id, t.department, t.task_name]
      );
    }
  }

  public async getClearanceTasks(exitId: string): Promise<ExitClearanceTaskEntity[]> {
    return this.query<ExitClearanceTaskEntity>(
      `SELECT * FROM exit_clearance_tasks WHERE exit_id = ? ORDER BY department ASC`,
      [exitId]
    );
  }

  public async updateClearanceTask(
    taskId: string,
    status: 'CLEARED' | 'REJECTED' | 'WAIVED',
    remarks: string,
    clearedBy: string
  ): Promise<void> {
    await this.execute(
      `UPDATE exit_clearance_tasks 
       SET status = ?, remarks = ?, cleared_by = ?, cleared_at = NOW(), updated_at = NOW() 
       WHERE id = ?`,
      [status, remarks, clearedBy, taskId]
    );
  }

  public async updateExitStatus(exitId: string, status: string): Promise<void> {
    await this.execute(
      `UPDATE employee_exits SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, exitId]
    );
  }
}
