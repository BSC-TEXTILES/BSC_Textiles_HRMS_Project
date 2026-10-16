/**
 * BSC Textiles HRMS — Employee Data Reset, Controlled Import & Roster Sync Test Suite
 * 
 * Verifies:
 * 1. Verified pre-reset backup creation on disk with SHA-256 manifest and SQL snapshot
 * 2. Controlled employee database reset with 100% login account preservation (table `user` untouched)
 * 3. Mode A (Update Existing): skips/errors on non-matching records, never invents mock data
 * 4. Controlled import with location validation, multi-tenant shard replication (BEL, DAV, SHI), and auto user linking
 * 5. Mode B (Replace Approved Employee Roster): deactivates unlisted staff while preserving all login accounts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../nativeDb.js';
import { shardManager } from '../core/sharding/ShardConnectionManager.js';
import { DatabaseBackupService } from '../services/databaseBackupService.js';
import { EmployeeResetService } from '../services/employeeResetService.js';
import { validateAndPreview, executeImport, ImportActor } from '../services/employeeImportService.js';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
    passed++;
    return true;
  } catch (err: any) {
    console.error(`  ❌ ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
    failed++;
    return false;
  }
}

async function main() {
  console.log('\n================================================================================');
  console.log('BSC TEXTILES HRMS — EMPLOYEE RESET, CONTROLLED IMPORT & ROSTER SYNC TEST SUITE');
  console.log('================================================================================\n');

  let initialUserCount = 0;
  let davLocationId = '';
  let belLocationId = '';
  let realAdminUser: any = null;

  try {
    await shardManager.initialize();

    // Query existing login user accounts count and find real admin user
    const [userRows]: any = await pool.query('SELECT COUNT(*) as count FROM user');
    initialUserCount = Number(userRows[0].count);
    console.log(`[Test Setup] Verified initial user login accounts in database: ${initialUserCount}`);
    assert.ok(initialUserCount > 0, 'Database must have existing user accounts');

    const [adminRows]: any = await pool.query(`SELECT id, email, fullName, role FROM user WHERE role = 'SUPER_ADMIN' OR role = 'ADMIN' LIMIT 1`);
    realAdminUser = adminRows[0];
    assert.ok(realAdminUser, 'Must find an existing admin account in user table');

    const actor: ImportActor = {
      userId: realAdminUser.id,
      userName: realAdminUser.fullName || realAdminUser.email,
      role: realAdminUser.role,
      locationId: null,
      permissions: ['ALL', 'ADD', 'EDIT', 'DELETE'],
    };

    // Query location IDs
    const [locations]: any = await pool.query(`SELECT id, code FROM location WHERE code IN ('DAV', 'BEL', 'SHI')`);
    for (const loc of locations) {
      if (loc.code === 'DAV') davLocationId = loc.id;
      if (loc.code === 'BEL') belLocationId = loc.id;
    }
    assert.ok(davLocationId, 'DAV location must exist');
    assert.ok(belLocationId, 'BEL location must exist');

    // ── Test 1: Verified Disk Backup Creation ────────────────────────────────
    await runTest('1. Pre-reset backup creation on disk with SHA-256 checksums & manifest', async () => {
      const backup = await DatabaseBackupService.createPreResetBackup('TEST-SUITE-RUN');

      assert.ok(backup.success, 'Backup should report success');
      assert.ok(backup.backupId.startsWith('backup_'), 'Backup ID should have backup_ prefix');
      assert.ok(fs.existsSync(backup.backupDir), 'Backup directory must exist on disk');
      assert.ok(fs.existsSync(backup.jsonFilePath), 'JSON backup file must exist on disk');
      assert.ok(fs.existsSync(backup.sqlFilePath), 'SQL backup file must exist on disk');
      assert.ok(backup.totalRecordsBackedUp >= 0, 'Total records backed up must be recorded');
      assert.ok(backup.sha256Checksum && backup.sha256Checksum.length === 64, 'SHA-256 checksum must be 64 characters');

      // Verify listing
      const list = await DatabaseBackupService.listBackups();
      const found = list.find((b) => b.backupId === backup.backupId);
      assert.ok(found, 'Backup must appear in listBackups()');
    });

    // ── Test 2: Controlled Reset with 100% Login Preservation ────────────────
    await runTest('2. Controlled Employee Reset: clears employee records & 100% preserves user logins', async () => {
      const result = await EmployeeResetService.resetEmployeeDatabase({
        userId: actor.userId,
        userName: actor.userName,
        role: actor.role,
        ipAddress: '127.0.0.1',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.preservedUserCount, initialUserCount, 'Preserved users must match initial user count');

      // Verify post-reset in database directly
      const [postUsers]: any = await pool.query('SELECT COUNT(*) as count FROM user');
      const postCount = Number(postUsers[0].count);
      assert.strictEqual(postCount, initialUserCount, 'User login count must remain 100% intact');

      // Verify all users are decoupled
      const [linkedUsers]: any = await pool.query('SELECT COUNT(*) as count FROM user WHERE employeeId IS NOT NULL');
      assert.strictEqual(Number(linkedUsers[0].count), 0, 'All user login accounts must be safely decoupled');

      // Verify employee table in control DB is empty
      const [remainingEmployees]: any = await pool.query('SELECT COUNT(*) as count FROM employee');
      assert.strictEqual(Number(remainingEmployees[0].count), 0, 'Employee table should be cleared');

      // Verify employee table in Davangere shard is empty
      const davPool = shardManager.getPool('BSC-SHARD-DAV-001');
      const [davShardEmps]: any = await davPool.query('SELECT COUNT(*) as count FROM employee');
      assert.strictEqual(Number(davShardEmps[0].count), 0, 'Shard employee table should be cleared');
    });

    // ── Test 3: Mode A (Update Existing) Safety ──────────────────────────────
    await runTest('3. Mode A (Update Existing): skips/errors on non-matching records, never invents mock data', async () => {
      const csvContent = [
        'location_code,employee_id,first_name,last_name,designation,joining_date',
        'DAV,BSC-NONEXISTENT-999,Ghost,User,Sales Executive,2026-01-15',
      ].join('\r\n');

      const preview = await validateAndPreview(csvContent, {
        fileName: 'test_update.csv',
        mode: 'update',
        actor,
      });

      assert.strictEqual(preview.rows.length, 1);
      assert.strictEqual(preview.rows[0].action, 'ERROR');
      assert.ok(preview.rows[0].errors.some((e: string) => e.includes('Update Existing')));
    });

    // ── Test 4: Controlled Import & Shard Replication ────────────────────────
    await runTest('4. Controlled Employee Import: multi-tenant sharding & automatic user account linking', async () => {
      // Pick an existing user email from decoupled users to verify re-linking
      const [users]: any = await pool.query('SELECT email, fullName FROM user WHERE employeeId IS NULL LIMIT 1');
      const testUser = users[0];
      const testEmail = testUser.email;

      const csvContent = [
        'location_code,employee_id,first_name,last_name,email,mobile_number,designation,role,joining_date',
        `DAV,BSC-DAV-0101,Ramesh,Patil,${testEmail},9845012345,Sales Consultant,SALES_EMPLOYEE,2026-01-01`,
        'BEL,BSC-BEL-0102,Suresh,Kulkarni,suresh.k@example.com,9845012346,Floor Supervisor,FLOOR_MANAGER,2026-01-01',
      ].join('\r\n');

      const preview = await validateAndPreview(csvContent, {
        fileName: 'approved_roster.csv',
        mode: 'upsert',
        actor,
      });

      assert.strictEqual(preview.rows.length, 2);
      assert.strictEqual(preview.rows[0].action, 'CREATE');
      assert.strictEqual(preview.rows[1].action, 'CREATE');

      const result = await executeImport(preview, actor);
      assert.strictEqual(result.status, 'COMPLETED');
      assert.strictEqual(result.created, 2);

      // Verify employee created in control DB
      const [empDav]: any = await pool.query('SELECT * FROM employee WHERE employeeCode = ?', ['BSC-DAV-0101']);
      assert.strictEqual(empDav.length, 1);
      assert.strictEqual(empDav[0].fullName, 'Ramesh Patil');

      // Verify existing user account with matching email was automatically linked!
      const [linkedUser]: any = await pool.query('SELECT employeeId FROM user WHERE email = ?', [testEmail]);
      assert.strictEqual(linkedUser[0].employeeId, empDav[0].id, 'Existing user account must link to the new employee record');

      // Verify shard replication to BSC-SHARD-DAV-001
      const davPool = shardManager.getPool('BSC-SHARD-DAV-001');
      const [shardDavEmp]: any = await davPool.query('SELECT * FROM employee WHERE employeeCode = ?', ['BSC-DAV-0101']);
      assert.strictEqual(shardDavEmp.length, 1, 'Employee must be replicated to DAV shard');

      // Verify shard replication to BSC-SHARD-BEL-001
      const belPool = shardManager.getPool('BSC-SHARD-BEL-001');
      const [shardBelEmp]: any = await belPool.query('SELECT * FROM employee WHERE employeeCode = ?', ['BSC-BEL-0102']);
      assert.strictEqual(shardBelEmp.length, 1, 'Employee must be replicated to BEL shard');
    });

    // ── Test 5: Mode B (Replace Approved Employee Roster) ─────────────────────
    await runTest('5. Mode B (Replace Approved Roster): deactivates unlisted staff while preserving all user logins', async () => {
      // Current active employees: BSC-DAV-0101 and BSC-BEL-0102.
      // Upload a new roster containing ONLY BSC-DAV-0101 and a new employee BSC-DAV-0103.
      // BSC-BEL-0102 is ABSENT from the roster, so Mode B must mark BSC-BEL-0102 as INACTIVE.
      const csvContent = [
        'location_code,employee_id,first_name,last_name,email,mobile_number,designation,role,joining_date',
        'DAV,BSC-DAV-0101,Ramesh,Patil,ramesh.p@example.com,9845012345,Senior Consultant,SALES_EMPLOYEE,2026-01-01',
        'DAV,BSC-DAV-0103,Deepa,Hegde,deepa.h@example.com,9845012347,Cashier,SALES_EMPLOYEE,2026-02-01',
      ].join('\r\n');

      const preview = await validateAndPreview(csvContent, {
        fileName: 'replacement_roster.csv',
        mode: 'replace_roster',
        actor,
      });

      assert.strictEqual(preview.mode, 'replace_roster');
      assert.ok(preview.absentActiveEmployees, 'Preview must detect absent active employees');
      const absentCodes = preview.absentActiveEmployees.map((e) => e.employeeCode);
      assert.ok(absentCodes.includes('BSC-BEL-0102'), 'BSC-BEL-0102 must be identified as absent');

      // Execute Mode B
      const result = await executeImport(preview, actor);
      assert.strictEqual(result.status, 'COMPLETED');
      assert.strictEqual(result.created, 1); // BSC-DAV-0103
      assert.strictEqual(result.updated, 1); // BSC-DAV-0101
      assert.strictEqual(result.deactivatedAbsent, 1); // BSC-BEL-0102

      // Verify BSC-BEL-0102 is INACTIVE in control DB
      const [belEmp]: any = await pool.query('SELECT status, remarks FROM employee WHERE employeeCode = ?', ['BSC-BEL-0102']);
      assert.strictEqual(belEmp[0].status, 'INACTIVE');
      assert.ok(belEmp[0].remarks.includes('Deactivated: Not present in approved roster'));

      // Verify BSC-BEL-0102 is INACTIVE in shard
      const belPool = shardManager.getPool('BSC-SHARD-BEL-001');
      const [shardBelEmp]: any = await belPool.query('SELECT status FROM employee WHERE employeeCode = ?', ['BSC-BEL-0102']);
      assert.strictEqual(shardBelEmp[0].status, 'INACTIVE', 'Shard must reflect INACTIVE status');

      // Verify all 37 user accounts are still 100% present in user table
      const [finalUsers]: any = await pool.query('SELECT COUNT(*) as count FROM user');
      assert.strictEqual(Number(finalUsers[0].count), initialUserCount, 'User login count must remain 100% intact');
    });

  } finally {
    await shardManager.shutdown().catch(() => {});
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('--------------------------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
