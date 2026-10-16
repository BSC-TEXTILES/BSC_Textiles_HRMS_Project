/**
 * BSC Textiles HRMS — Shard Registry Repository
 * Central database repository managing persistent database shards, user-to-shard assignments,
 * and migration logs with transactional integrity.
 */

import { ShardConnectionManager } from './ShardConnectionManager.js';
import type {
  DatabaseShard,
  UserDatabaseAssignment,
  ShardMigrationRecord,
  ShardStatus,
  AssignmentType,
} from './types.js';

export class ShardRegistryRepository {
  private static instance: ShardRegistryRepository;
  private manager: ShardConnectionManager;

  private constructor() {
    this.manager = ShardConnectionManager.getInstance();
  }

  public static getInstance(): ShardRegistryRepository {
    if (!ShardRegistryRepository.instance) {
      ShardRegistryRepository.instance = new ShardRegistryRepository();
    }
    return ShardRegistryRepository.instance;
  }

  private get pool() {
    return this.manager.getControlPool();
  }

  // =========================================================================
  // SHARD REGISTRY
  // =========================================================================

  public async getAllShards(): Promise<DatabaseShard[]> {
    const [rows]: any = await this.pool.query(
      `SELECT ds.*, 
        (SELECT COUNT(*) FROM user_database_assignments uda WHERE uda.database_id = ds.database_id AND uda.status = 'ACTIVE') as total_users
       FROM database_shards ds 
       ORDER BY ds.is_control_shard DESC, ds.database_id ASC`
    );
    return rows as DatabaseShard[];
  }

  public async getShardById(databaseId: string): Promise<DatabaseShard | null> {
    const [rows]: any = await this.pool.query(
      `SELECT ds.*,
        (SELECT COUNT(*) FROM user_database_assignments uda WHERE uda.database_id = ds.database_id AND uda.status = 'ACTIVE') as total_users
       FROM database_shards ds 
       WHERE ds.database_id = ? LIMIT 1`,
      [databaseId]
    );
    return rows.length > 0 ? (rows[0] as DatabaseShard) : null;
  }

  public async getShardByLocation(locationCodeOrId: string): Promise<DatabaseShard | null> {
    const [rows]: any = await this.pool.query(
      `SELECT * FROM database_shards 
       WHERE location_id = ? OR location_code = ? 
       LIMIT 1`,
      [locationCodeOrId, locationCodeOrId]
    );
    return rows.length > 0 ? (rows[0] as DatabaseShard) : null;
  }

  public async updateShardStatus(databaseId: string, status: ShardStatus): Promise<boolean> {
    const [result]: any = await this.pool.query(
      'UPDATE database_shards SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE database_id = ?',
      [status, databaseId]
    );
    await this.manager.refreshRegistry();
    return result.affectedRows > 0;
  }

  // =========================================================================
  // USER TO DATABASE SHARD ASSIGNMENTS
  // =========================================================================

  public async getAssignmentByUserId(userId: string): Promise<UserDatabaseAssignment | null> {
    const [rows]: any = await this.pool.query(
      `SELECT uda.*, u.fullName, u.email, u.role, ds.shard_name, l.name as location_name
       FROM user_database_assignments uda
       JOIN user u ON uda.user_id = u.id
       JOIN database_shards ds ON uda.database_id = ds.database_id
       LEFT JOIN location l ON uda.location_id = l.id
       WHERE uda.user_id = ? AND uda.status = 'ACTIVE'
       LIMIT 1`,
      [userId]
    );
    return rows.length > 0 ? (rows[0] as UserDatabaseAssignment) : null;
  }

  public async listAssignments(options: {
    page?: number;
    limit?: number;
    locationId?: string;
    databaseId?: string;
    search?: string;
  }): Promise<{ assignments: UserDatabaseAssignment[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(5, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['uda.status = "ACTIVE"'];
    const params: any[] = [];

    if (options.locationId) {
      conditions.push('uda.location_id = ?');
      params.push(options.locationId);
    }
    if (options.databaseId) {
      conditions.push('uda.database_id = ?');
      params.push(options.databaseId);
    }
    if (options.search) {
      conditions.push('(u.fullName LIKE ? OR u.email LIKE ? OR u.role LIKE ?)');
      const searchWild = `%${options.search}%`;
      params.push(searchWild, searchWild, searchWild);
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const [countRows]: any = await this.pool.query(
      `SELECT COUNT(*) as count 
       FROM user_database_assignments uda
       JOIN user u ON uda.user_id = u.id
       WHERE ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.count || 0);

    // Paginated list
    const [rows]: any = await this.pool.query(
      `SELECT uda.*, u.fullName, u.email, u.role, ds.shard_name, ds.database_name, l.name as location_name, l.code as location_code
       FROM user_database_assignments uda
       JOIN user u ON uda.user_id = u.id
       JOIN database_shards ds ON uda.database_id = ds.database_id
       LEFT JOIN location l ON uda.location_id = l.id
       WHERE ${whereClause}
       ORDER BY uda.assigned_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      assignments: rows as UserDatabaseAssignment[],
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public async assignUserToShard(
    userId: string,
    databaseId: string,
    locationId?: string,
    assignmentType: AssignmentType = 'LOCATION_DEFAULT',
    assignedBy: string = 'SYSTEM'
  ): Promise<void> {
    const assignmentId = `uda_${userId}`;

    // Update in user table
    await this.pool.query(
      'UPDATE `user` SET `database_id` = ?, `locationId` = COALESCE(?, `locationId`) WHERE `id` = ?',
      [databaseId, locationId || null, userId]
    );

    // Upsert into user_database_assignments
    await this.pool.query(
      `INSERT INTO user_database_assignments 
       (id, user_id, employee_id, location_id, database_id, status, assignment_type, assigned_by, assigned_at)
       VALUES (?, ?, (SELECT employeeId FROM user WHERE id = ?), ?, ?, 'ACTIVE', ?, ?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
       database_id = VALUES(database_id),
       location_id = VALUES(location_id),
       assignment_type = VALUES(assignment_type),
       assigned_by = VALUES(assigned_by),
       status = 'ACTIVE',
       updated_at = CURRENT_TIMESTAMP(3)`,
      [assignmentId, userId, userId, locationId || null, databaseId, assignmentType, assignedBy]
    );

    // Update total_users stats
    await this.pool.query(
      `UPDATE database_shards ds 
       SET total_users = (SELECT COUNT(*) FROM user_database_assignments WHERE database_id = ds.database_id AND status = 'ACTIVE')`
    );
  }

  // =========================================================================
  // SHARD MIGRATION AUDIT
  // =========================================================================

  public async listMigrations(limit: number = 20): Promise<ShardMigrationRecord[]> {
    const [rows]: any = await this.pool.query(
      'SELECT * FROM shard_migrations ORDER BY started_at DESC LIMIT ?',
      [limit]
    );
    return rows as ShardMigrationRecord[];
  }
}

export const shardRegistry = ShardRegistryRepository.getInstance();
