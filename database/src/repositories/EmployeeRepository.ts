import { query, queryOne } from '../pool.js';

export interface EmployeeRow {
  id: string;
  employee_code: string;
  full_name: string;
  gender: string;
  phone: string | null;
  email: string | null;
  location_id: string;
  floor_id: string | null;
  department_id: string | null;
  section_id: string | null;
  selling_point_id: string | null;
  shift_id: string | null;
  base_salary: number;
  face_enrollment_url: string | null;
  status: string;
  date_of_joining: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class EmployeeRepository {
  static async findById(id: string): Promise<EmployeeRow | null> {
    return queryOne<EmployeeRow>(
      `SELECT * FROM employees WHERE id = ? LIMIT 1`,
      [id]
    );
  }

  static async findByCode(code: string): Promise<EmployeeRow | null> {
    return queryOne<EmployeeRow>(
      `SELECT * FROM employees WHERE employee_code = ? LIMIT 1`,
      [code]
    );
  }

  static async listByLocation(locationId: string): Promise<EmployeeRow[]> {
    return query<EmployeeRow>(
      `SELECT * FROM employees WHERE location_id = ? ORDER BY full_name ASC`,
      [locationId]
    );
  }

  static async listAll(): Promise<EmployeeRow[]> {
    return query<EmployeeRow>(
      `SELECT * FROM employees ORDER BY employee_code ASC`
    );
  }
}
