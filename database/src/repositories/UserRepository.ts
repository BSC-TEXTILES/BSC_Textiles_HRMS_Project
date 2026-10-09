import { query, queryOne } from '../pool.js';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  permissions: string[] | null;
  locationId: string | null;
  employeeId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, email, passwordHash, fullName, role, permissions,
        locationId, employeeId, isActive, lastLoginAt, createdAt, updatedAt`;

function mapUser(row: any): UserRow {
  return {
    ...row,
    permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
  };
}

export class UserRepository {
  static async findByEmail(email: string): Promise<UserRow | null> {
    const row = await queryOne<any>(`SELECT ${COLUMNS} FROM User WHERE email = ? LIMIT 1`, [email]);
    return row ? mapUser(row) : null;
  }

  static async findById(id: string): Promise<UserRow | null> {
    const row = await queryOne<any>(`SELECT ${COLUMNS} FROM User WHERE id = ? LIMIT 1`, [id]);
    return row ? mapUser(row) : null;
  }

  static async listByLocation(locationId: string): Promise<UserRow[]> {
    const rows = await query<any>(
      `SELECT ${COLUMNS} FROM User WHERE locationId = ? ORDER BY fullName ASC`,
      [locationId]
    );
    return rows.map(mapUser);
  }

  static async updateLastLogin(id: string): Promise<void> {
    await query(`UPDATE User SET lastLoginAt = NOW(3) WHERE id = ?`, [id]);
  }
}
