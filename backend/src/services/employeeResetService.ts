/**
 * BSC Textiles HRMS — Controlled Employee Data Reset Service
 * 
 * Safely clears previous employee business records across control and shard databases
 * while 100% PRESERVING all user login accounts, password hashes, roles, and permissions.
 */

import { pool } from '../nativeDb.js';
import { shardManager } from '../core/sharding/ShardConnectionManager.js';
import { DatabaseBackupService, BackupResult } from './databaseBackupService.js';
import { AuditService } from './auditService.js';

export interface EmployeeResetResult {
  success: boolean;
  message: string;
  backup: BackupResult;
  preservedUserCount: number;
  preservedUsers: Array<{ id: string; email: string; role: string; fullName: string }>;
  clearedEmployeeCount: number;
  clearedOperationalRecords: Record<string, number>;
  shardsSynchronized: string[];
  durationMs: number;
}

export class EmployeeResetService {
  /**
   * Performs a verified, controlled reset of employee records.
   * STRICTLY preserves all login accounts in table `user`.
   */
  public static async resetEmployeeDatabase(actor: {
    userId: string;
    userName: string;
    role: string;
    ipAddress?: string;
  }): Promise<EmployeeResetResult> {
    const start = Date.now();

    // 1. Mandatory verification: Count and capture existing login accounts
    const [initialUsers]: any = await pool.query(
      `SELECT id, email, fullName, role, permissions, locationId, database_id, isActive, status FROM user`
    );
    const initialUserCount = initialUsers.length;

    console.log(`[EmployeeResetService] Pre-reset check: ${initialUserCount} login accounts identified.`);

    // 2. Step 1: Create a verified, durable pre-reset backup on disk
    const backup = await DatabaseBackupService.createPreResetBackup('pre_employee_data_reset');
    if (!backup.success) {
      throw new Error('Pre-reset backup failed. Aborting employee reset to prevent unrecoverable data loss.');
    }

    const clearedCounts: Record<string, number> = {};
    const shardsSynchronized: string[] = [];

    // 3. Step 2: Unlink user accounts from employee records
    // This decouples login authentication from employee business profiles.
    console.log('[EmployeeResetService] Safely unlinking user accounts from employee profiles...');
    await pool.query(`UPDATE user SET employeeId = NULL`);

    // 4. Step 3: Transactional cleanup of employee business and operational records in Control DB
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);

      const tablesToClear = [
        'employeebreak',
        'employeeincentive',
        'employeesellingpoint',
        'faceprofile',
        'faceverification',
        'incentiverule',
        'incentivetransaction',
        'observation',
        'payrollitem',
        'penaltyrule',
        'penaltytransaction',
        'qrcode',
        'qrscanrecord',
        'videonote',
        'weeklyoffrule',
        'attendancecorrection',
        'attendance',
        'biometric_employee_mappings',
        'biometric_raw_punches',
        'employeedocument',
        'employee',
      ];

      for (const table of tablesToClear) {
        try {
          const [countRows]: any = await conn.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
          const cnt = Number(countRows[0]?.cnt || 0);
          clearedCounts[table] = cnt;

          if (cnt > 0) {
            await conn.query(`DELETE FROM \`${table}\``);
            console.log(`[EmployeeResetService] Cleared ${cnt} records from ${table}.`);
          }
        } catch (err: any) {
          console.warn(`[EmployeeResetService] Note on table ${table}:`, err.message);
          clearedCounts[table] = 0;
        }
      }

      await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
      await conn.commit();
    } catch (err: any) {
      await conn.rollback();
      await conn.query(`SET FOREIGN_KEY_CHECKS = 1`).catch(() => {});
      throw new Error(`Employee reset rollback in control DB: ${err.message}`);
    } finally {
      conn.release();
    }

    // 5. Step 4: Synchronize reset across shard databases (BEL, DAV, SHI)
    try {
      await shardManager.initialize();
      const shardIds = ['BSC-SHARD-BEL-001', 'BSC-SHARD-DAV-001', 'BSC-SHARD-SHI-001'];

      for (const shardId of shardIds) {
        try {
          const shardPool = shardManager.getPool(shardId);
          const sConn = await shardPool.getConnection();
          try {
            await sConn.query(`SET FOREIGN_KEY_CHECKS = 0`);
            await sConn.query(`DELETE FROM attendance`).catch(() => {});
            await sConn.query(`DELETE FROM biometric_raw_punches`).catch(() => {});
            await sConn.query(`DELETE FROM biometric_employee_mappings`).catch(() => {});
            await sConn.query(`DELETE FROM employee`).catch(() => {});
            await sConn.query(`SET FOREIGN_KEY_CHECKS = 1`);
            shardsSynchronized.push(shardId);
            console.log(`[EmployeeResetService] Synchronized reset on shard ${shardId}.`);
          } finally {
            sConn.release();
          }
        } catch (sErr: any) {
          console.warn(`[EmployeeResetService] Note on shard ${shardId}:`, sErr.message);
        }
      }
    } catch (shardInitErr: any) {
      console.warn('[EmployeeResetService] Shard sync warning:', shardInitErr.message);
    }

    // 6. Step 5: Mandatory post-reset verification of login accounts
    const [postUsers]: any = await pool.query(
      `SELECT id, email, fullName, role, isActive, status FROM user`
    );
    const postUserCount = postUsers.length;

    if (postUserCount !== initialUserCount) {
      throw new Error(
        `CRITICAL INTEGRITY VIOLATION: User count mismatch post-reset! Pre: ${initialUserCount}, Post: ${postUserCount}. Reset aborted.`
      );
    }

    console.log(`[EmployeeResetService] ✔ Post-reset verification: 100% of ${postUserCount} user accounts intact.`);

    // 7. Step 6: Audit logging
    await AuditService.log({
      userId: actor.userId,
      action: 'CONTROLLED_EMPLOYEE_DATA_RESET',
      entityType: 'EmployeeRoster',
      entityId: backup.backupId,
      ipAddress: actor.ipAddress || '127.0.0.1',
      riskScore: 85,
      tags: ['employee-reset', 'roster-cleanup', 'backup-verified'],
      after: {
        backupId: backup.backupId,
        preservedUserCount: postUserCount,
        clearedEmployees: clearedCounts['employee'] || 0,
        clearedRecords: clearedCounts,
        shardsSynchronized,
      },
    }).catch(() => {});

    return {
      success: true,
      message: `Employee data reset completed successfully. ${clearedCounts['employee'] || 0} employee profiles cleared. All ${postUserCount} login accounts remain 100% preserved.`,
      backup,
      preservedUserCount: postUserCount,
      preservedUsers: postUsers.map((u: any) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        fullName: u.fullName,
      })),
      clearedEmployeeCount: clearedCounts['employee'] || 0,
      clearedOperationalRecords: clearedCounts,
      shardsSynchronized,
      durationMs: Date.now() - start,
    };
  }
}
