/**
 * BSC Textiles HRMS — Shard Migration & User Transfer Service
 * Manages atomic employee/user transfers across showroom shards, migration checkpoints,
 * reconciliation, and auditable history.
 */

import { ShardConnectionManager } from './ShardConnectionManager.js';
import { ShardRegistryRepository } from './ShardRegistryRepository.js';
import { AuditService } from '../../services/auditService.js';
import crypto from 'node:crypto';

export class ShardMigrationService {
  private static instance: ShardMigrationService;
  private manager: ShardConnectionManager;
  private registryRepo: ShardRegistryRepository;

  private constructor() {
    this.manager = ShardConnectionManager.getInstance();
    this.registryRepo = ShardRegistryRepository.getInstance();
  }

  public static getInstance(): ShardMigrationService {
    if (!ShardMigrationService.instance) {
      ShardMigrationService.instance = new ShardMigrationService();
    }
    return ShardMigrationService.instance;
  }

  /**
   * Reassign a user to a different shard and optionally migrate operational employee record
   */
  public async reassignUser(options: {
    userId: string;
    targetDatabaseId: string;
    targetLocationId?: string;
    requestedBy: string;
    reason: string;
  }): Promise<{ success: boolean; message: string; previousDatabaseId: string; newDatabaseId: string }> {
    const controlPool = this.manager.getControlPool();

    // 1. Validate target shard exists and is active
    const targetShard = await this.registryRepo.getShardById(options.targetDatabaseId);
    if (!targetShard) {
      throw new Error(`Target database shard '${options.targetDatabaseId}' does not exist.`);
    }
    if (targetShard.status === 'OFFLINE' || targetShard.status === 'MAINTENANCE') {
      throw new Error(`Cannot assign user to shard '${options.targetDatabaseId}' because it is in ${targetShard.status} mode.`);
    }

    // 2. Fetch current user and assignment
    const [userRows]: any = await controlPool.query('SELECT * FROM `user` WHERE `id` = ?', [options.userId]);
    if (userRows.length === 0) {
      throw new Error(`User with ID '${options.userId}' not found.`);
    }
    const user = userRows[0];
    const previousDatabaseId = user.database_id || 'BSC-SHARD-HQ-001';

    if (previousDatabaseId === options.targetDatabaseId && (!options.targetLocationId || user.locationId === options.targetLocationId)) {
      return {
        success: true,
        message: 'User is already assigned to this database shard and location.',
        previousDatabaseId,
        newDatabaseId: options.targetDatabaseId,
      };
    }

    const batchId = `transfer_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const migrationId = `mig_user_${options.userId}_${Date.now()}`;

    // 3. Begin migration record
    await controlPool.query(
      `INSERT INTO shard_migrations (id, migration_name, shard_id, batch_id, status, details, started_at)
       VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, CURRENT_TIMESTAMP(3))`,
      [
        migrationId,
        'USER_LOCATION_SHARD_TRANSFER',
        options.targetDatabaseId,
        batchId,
        JSON.stringify({
          userId: options.userId,
          userEmail: user.email,
          previousDatabaseId,
          targetDatabaseId: options.targetDatabaseId,
          reason: options.reason,
          requestedBy: options.requestedBy,
        }),
      ]
    );

    try {
      // 4. Update assignment in central registry
      await this.registryRepo.assignUserToShard(
        options.userId,
        options.targetDatabaseId,
        options.targetLocationId || targetShard.location_id || undefined,
        user.role === 'SUPER_ADMIN' ? 'CROSS_SHARD_ADMIN' : 'EXPLICIT_OVERRIDE',
        options.requestedBy
      );

      // 5. If user has an associated employee record, copy/update into target shard
      if (user.employeeId && options.targetDatabaseId !== 'BSC-SHARD-HQ-001') {
        const [empRows]: any = await controlPool.query('SELECT * FROM `employee` WHERE `id` = ?', [user.employeeId]);
        if (empRows.length > 0) {
          const emp = empRows[0];
          const targetPool = this.manager.getPool(options.targetDatabaseId);
          await targetPool.query('SET FOREIGN_KEY_CHECKS = 0;');
          await targetPool.query('REPLACE INTO `employee` SET ?', [{
            ...emp,
            locationId: options.targetLocationId || targetShard.location_id || emp.locationId,
            updatedAt: new Date(),
          }]);
          await targetPool.query('SET FOREIGN_KEY_CHECKS = 1;');
        }
      }

      // 6. Complete migration record
      await controlPool.query(
        `UPDATE shard_migrations 
         SET status = 'COMPLETED', records_migrated = 1, completed_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [migrationId]
      );

      // 7. Audit log the reassignment
      await AuditService.log({
        userId: options.requestedBy,
        locationId: options.targetLocationId || targetShard.location_id || undefined,
        action: 'USER_SHARD_REASSIGNMENT',
        entityType: 'USER_DATABASE_ASSIGNMENT',
        entityId: options.userId,
        ipAddress: '127.0.0.1',
        userAgent: 'BSC-Sharding-Admin',
        riskScore: 30,
        tags: ['sharding', 'user-reassignment', 'security-audit'],
        before: { database_id: previousDatabaseId, locationId: user.locationId },
        after: {
          database_id: options.targetDatabaseId,
          locationId: options.targetLocationId || targetShard.location_id,
          reason: options.reason,
        },
      });

      return {
        success: true,
        message: `User '${user.fullName}' successfully reassigned to shard '${targetShard.shard_name}' (${options.targetDatabaseId}).`,
        previousDatabaseId,
        newDatabaseId: options.targetDatabaseId,
      };
    } catch (err: any) {
      console.error(`[ShardMigrationService] Reassignment failed:`, err);
      await controlPool.query(
        `UPDATE shard_migrations 
         SET status = 'FAILED', error_message = ?, completed_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [err.message, migrationId]
      );
      throw err;
    }
  }
}

export const shardMigrationService = ShardMigrationService.getInstance();
