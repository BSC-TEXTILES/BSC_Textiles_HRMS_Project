import { query, queryOne } from '../pool.js';

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  locationId: string;
  floorId: string | null;
  departmentId: string | null;
  sectionId: string | null;
  shiftId: string | null;
  designation: string | null;
  role: string;
  status: string;
  joiningDate: Date;
  exitDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, employeeCode, firstName, lastName, fullName, email, phone, gender,
        locationId, floorId, departmentId, sectionId, shiftId, designation, role, status,
        joiningDate, exitDate, createdAt, updatedAt`;

export class EmployeeRepository {
  static async findById(id: string): Promise<EmployeeRow | null> {
    return queryOne<EmployeeRow>(`SELECT ${COLUMNS} FROM Employee WHERE id = ? LIMIT 1`, [id]);
  }

  static async findByCode(code: string): Promise<EmployeeRow | null> {
    return queryOne<EmployeeRow>(`SELECT ${COLUMNS} FROM Employee WHERE employeeCode = ? LIMIT 1`, [code]);
  }

  static async listByLocation(locationId: string): Promise<EmployeeRow[]> {
    return query<EmployeeRow>(
      `SELECT ${COLUMNS} FROM Employee WHERE locationId = ? ORDER BY fullName ASC`,
      [locationId]
    );
  }

  static async listAll(): Promise<EmployeeRow[]> {
    return query<EmployeeRow>(`SELECT ${COLUMNS} FROM Employee ORDER BY employeeCode ASC`);
  }
}
