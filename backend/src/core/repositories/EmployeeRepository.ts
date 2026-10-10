import { BaseRepository } from './BaseRepository.js';

export interface EmployeeEntity {
  id: string;
  employee_code: string;
  full_name: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  location_id: string;
  floor_id: string | null;
  department_id: string | null;
  section_id: string | null;
  selling_point_id: string | null;
  shift_id: string | null;
  base_salary: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED' | 'RESIGNED' | 'RETIRED' | 'EX_EMPLOYEE';
  date_of_joining: Date | string | null;
  created_at: Date;
  updated_at: Date;
  location_name?: string;
  department_name?: string;
  shift_name?: string;
}

export class EmployeeRepository extends BaseRepository<EmployeeEntity> {
  protected readonly tableName = 'employees';

  public async findByCode(code: string): Promise<EmployeeEntity | null> {
    return this.queryOne<EmployeeEntity>(
      `SELECT * FROM ${this.tableName} WHERE employee_code = ? LIMIT 1`,
      [code]
    );
  }

  public async findByEmail(email: string): Promise<EmployeeEntity | null> {
    return this.queryOne<EmployeeEntity>(
      `SELECT * FROM ${this.tableName} WHERE email = ? LIMIT 1`,
      [email]
    );
  }

  public async listActive(locationId?: string): Promise<EmployeeEntity[]> {
    let sql = `SELECT e.*, l.name as location_name, d.name as department_name 
               FROM employees e 
               LEFT JOIN locations l ON e.location_id = l.id
               LEFT JOIN departments d ON e.department_id = d.id
               WHERE e.status = 'ACTIVE'`;
    const params: any[] = [];
    if (locationId) {
      sql += ` AND e.location_id = ?`;
      params.push(locationId);
    }
    sql += ` ORDER BY e.full_name ASC`;
    return this.query<EmployeeEntity>(sql, params);
  }

  public async listFormerEmployees(options: {
    locationId?: string;
    departmentId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ employees: EmployeeEntity[]; total: number }> {
    const { locationId, departmentId, status, search, limit = 20, offset = 0 } = options;
    const whereClauses: string[] = ["e.status IN ('TERMINATED', 'RESIGNED', 'RETIRED', 'EX_EMPLOYEE')"];
    const params: any[] = [];

    if (locationId) {
      whereClauses.push('e.location_id = ?');
      params.push(locationId);
    }
    if (departmentId) {
      whereClauses.push('e.department_id = ?');
      params.push(departmentId);
    }
    if (status && status !== 'all') {
      whereClauses.push('e.status = ?');
      params.push(status);
    }
    if (search) {
      whereClauses.push('(e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM employees e WHERE ${whereSql}`,
      params
    );
    const total = Number(countRes?.count || 0);

    const sql = `
      SELECT e.*, l.name as location_name, d.name as department_name, s.name as shift_name,
             ex.id as exit_id, ex.exit_type, ex.resignation_date, ex.last_working_day, ex.status as exit_status,
             fnf.id as settlement_id, fnf.status as settlement_status, fnf.net_payable as settlement_amount, fnf.payment_date
      FROM employees e
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN employee_exits ex ON ex.employee_id = e.id
      LEFT JOIN fnf_settlements fnf ON fnf.exit_id = ex.id
      WHERE ${whereSql}
      ORDER BY e.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const employees = await this.query<EmployeeEntity>(sql, [...params, Number(limit), Number(offset)]);
    return { employees, total };
  }

  public async updateStatus(id: string, status: string): Promise<void> {
    await this.execute(
      `UPDATE ${this.tableName} SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, id]
    );
  }
}
