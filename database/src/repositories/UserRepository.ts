import { query, queryOne } from '../pool.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  permissions: string[] | null;
  location_id: string | null;
  employee_id: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class UserRepository {
  static async findByEmail(email: string): Promise<UserRow | null> {
    const row = await queryOne<any>(
      `SELECT id, email, password_hash, full_name, role, permissions, 
              location_id, employee_id, is_active, last_login_at, created_at, updated_at
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    if (!row) return null;
    return {
      ...row,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
    };
  }

  static async findById(id: string): Promise<UserRow | null> {
    const row = await queryOne<any>(
      `SELECT id, email, full_name, role, permissions, location_id, employee_id, is_active, last_login_at
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!row) return null;
    return {
      ...row,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
    };
  }

  static async listByLocation(locationId: string): Promise<UserRow[]> {
    const rows = await query<any>(
      `SELECT id, email, full_name, role, permissions, location_id, employee_id, is_active, last_login_at
       FROM users WHERE location_id = ? ORDER BY full_name ASC`,
      [locationId]
    );
    return rows.map((r) => ({
      ...r,
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions,
    }));
  }

  static async updateLastLogin(id: string): Promise<void> {
    await query(`UPDATE users SET last_login_at = NOW(3) WHERE id = ?`, [id]);
  }
}
