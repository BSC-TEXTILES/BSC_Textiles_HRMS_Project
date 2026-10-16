/**
 * BSC Textiles HRMS — Sharding Architecture & User Identity Verification Suite
 * Executes end-to-end automated verification of multi-tenant MySQL sharding,
 * persistent user mappings, location data isolation, tamper resistance, and atomic transactions.
 */

import { shardManager, shardRegistry, shardRouter, shardMigrationService } from '../core/sharding/index.js';
import mysql from 'mysql2/promise';

async function runShardingTestSuite() {
  console.log('========================================================================');
  console.log('🧪 BSC TEXTILES HRMS — SHARDING ARCHITECTURE & IDENTITY VERIFICATION');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // 1. Initialize Shard Connection Manager
  console.log('--- 1. Shard Registry & Connection Management ---');
  await shardManager.initialize();
  const shards = await shardRegistry.getAllShards();
  assert(shards.length >= 4, 'All 4 core database shards are registered in control registry', `Found: ${shards.length}`);

  const hqShard = shards.find((s) => s.database_id === 'BSC-SHARD-HQ-001');
  const belShard = shards.find((s) => s.database_id === 'BSC-SHARD-BEL-001');
  const davShard = shards.find((s) => s.database_id === 'BSC-SHARD-DAV-001');
  const shiShard = shards.find((s) => s.database_id === 'BSC-SHARD-SHI-001');

  assert(Boolean(hqShard && hqShard.is_control_shard), 'Control Shard BSC-SHARD-HQ-001 is designated as primary control');
  assert(Boolean(belShard && belShard.database_name === 'bsc_shard_bel'), 'Belagavi Shard mapped to database bsc_shard_bel');
  assert(Boolean(davShard && davShard.database_name === 'bsc_shard_dav'), 'Davanagere Shard mapped to database bsc_shard_dav');
  assert(Boolean(shiShard && shiShard.database_name === 'bsc_shard_shi'), 'Shivamogga Shard mapped to database bsc_shard_shi');

  // 2. Real-Time Shard Health Checks
  console.log('\n--- 2. Live Shard Health & Ping Latency ---');
  const healthReports = await shardManager.checkAllShardsHealth();
  for (const report of healthReports) {
    assert(
      report.healthStatus === 'HEALTHY',
      `Shard ${report.databaseId} (${report.shardName}) is HEALTHY (Latency: ${report.latencyMs}ms)`
    );
  }

  // 3. Persistent User Database ID Resolution
  console.log('\n--- 3. User Identity & Persistent Database ID Mapping ---');
  const assignmentsResult = await shardRegistry.listAssignments({ limit: 50 });
  assert(assignmentsResult.total >= 30, 'User assignments count is populated in MySQL', `Total: ${assignmentsResult.total}`);

  // Test Belagavi user resolution
  const belAssignment = assignmentsResult.assignments.find((a) => a.database_id === 'BSC-SHARD-BEL-001');
  assert(Boolean(belAssignment), 'Belagavi user assignment exists');
  if (belAssignment) {
    const resolved = await shardRouter.resolveUserDatabase(belAssignment.user_id);
    assert(resolved.databaseId === 'BSC-SHARD-BEL-001', 'Belagavi user resolves to logical shard BSC-SHARD-BEL-001');
  }

  // Test Davanagere user resolution
  const davAssignment = assignmentsResult.assignments.find((a) => a.database_id === 'BSC-SHARD-DAV-001');
  assert(Boolean(davAssignment), 'Davanagere user assignment exists');
  if (davAssignment) {
    const resolved = await shardRouter.resolveUserDatabase(davAssignment.user_id);
    assert(resolved.databaseId === 'BSC-SHARD-DAV-001', 'Davanagere user resolves to logical shard BSC-SHARD-DAV-001');
  }

  // Test Shivamogga user resolution
  const shiAssignment = assignmentsResult.assignments.find((a) => a.database_id === 'BSC-SHARD-SHI-001');
  assert(Boolean(shiAssignment), 'Shivamogga user assignment exists');
  if (shiAssignment) {
    const resolved = await shardRouter.resolveUserDatabase(shiAssignment.user_id);
    assert(resolved.databaseId === 'BSC-SHARD-SHI-001', 'Shivamogga user resolves to logical shard BSC-SHARD-SHI-001');
  }

  // 4. Location-Wise Data Isolation Verification
  console.log('\n--- 4. Physical Location Data Isolation ---');
  const belEmployees = await shardRouter.executeShardRead(
    'BSC-SHARD-BEL-001',
    'SELECT id, fullName, locationId FROM `employee`'
  );
  assert(belEmployees.length > 0, `Belagavi shard has ${belEmployees.length} employee records`);
  const belForeignEmps = belEmployees.filter((e: any) => e.locationId !== 'cmuwszr8t00011vdtc7vgvags');
  assert(belForeignEmps.length === 0, 'Belagavi shard contains ZERO records from Davanagere or Shivamogga (100% Isolated)');

  const davEmployees = await shardRouter.executeShardRead(
    'BSC-SHARD-DAV-001',
    'SELECT id, fullName, locationId FROM `employee`'
  );
  assert(davEmployees.length > 0, `Davanagere shard has ${davEmployees.length} employee records`);
  const davForeignEmps = davEmployees.filter((e: any) => e.locationId !== 'cmuwszr9500021vdtxscy3nsc');
  assert(davForeignEmps.length === 0, 'Davanagere shard contains ZERO records from Belagavi or Shivamogga (100% Isolated)');

  const shiEmployees = await shardRouter.executeShardRead(
    'BSC-SHARD-SHI-001',
    'SELECT id, fullName, locationId FROM `employee`'
  );
  assert(shiEmployees.length > 0, `Shivamogga shard has ${shiEmployees.length} employee records`);
  const shiForeignEmps = shiEmployees.filter((e: any) => e.locationId !== 'cmuwszr9s00031vdtqlwzkrw8');
  assert(shiForeignEmps.length === 0, 'Shivamogga shard contains ZERO records from Belagavi or Davanagere (100% Isolated)');

  // 5. Anti-Tamper Security & Cross-Location Boundary Enforcement
  console.log('\n--- 5. Anti-Tamper Security & Request Parameter Protection ---');
  // Belagavi Sales Employee attempting to spoof Davanagere shard
  const mockBelUser = {
    id: belAssignment?.user_id || 'test_bel_user',
    role: 'SALES_EMPLOYEE',
    locationId: 'cmuwszr8t00011vdtc7vgvags',
    database_id: 'BSC-SHARD-BEL-001',
  };

  const spoofAttempt = shardRouter.validateShardAccess(
    mockBelUser,
    'cmuwszr9500021vdtxscy3nsc', // Davanagere location ID
    'BSC-SHARD-DAV-001'          // Davanagere database ID
  );
  assert(!spoofAttempt.allowed, 'Client tampering attempt to access Davanagere shard from Belagavi user is REJECTED (403 Forbidden)');

  // Super Admin access across shards
  const mockSuperAdmin = {
    id: 'admin_test',
    role: 'SUPER_ADMIN',
    database_id: 'BSC-SHARD-HQ-001',
  };
  const adminAccess = shardRouter.validateShardAccess(
    mockSuperAdmin,
    'cmuwszr9500021vdtxscy3nsc',
    'BSC-SHARD-DAV-001'
  );
  assert(adminAccess.allowed && adminAccess.effectiveDatabaseId === 'BSC-SHARD-DAV-001', 'Super Admin is authorized for cross-shard operations');

  // 6. Shard Transaction & Atomic Rollback
  console.log('\n--- 6. Shard Transaction Atomicity & Failure Rollback ---');
  const testRuleId = `rule_tx_test_${Date.now()}`;
  let rollbackOccurred = false;

  try {
    await shardRouter.executeShardTransaction('BSC-SHARD-BEL-001', async (conn) => {
      // Step A: Insert temporary rule
      await conn.query(
        'INSERT INTO `breakrule` (id, locationId, breakType, durationMinutes, isPaid, createdAt, updatedAt) VALUES (?, "cmuwszr8t00011vdtc7vgvags", "TEA", 15, 1, NOW(3), NOW(3))',
        [testRuleId]
      );

      // Step B: Intentional failure to test atomicity
      throw new Error('Simulated atomic transaction failure');
    });
  } catch (err: any) {
    rollbackOccurred = true;
  }

  assert(rollbackOccurred, 'Transaction error caught and triggered rollback');

  // Verify record was NOT committed
  const checkRows = await shardRouter.executeShardRead(
    'BSC-SHARD-BEL-001',
    'SELECT id FROM `breakrule` WHERE id = ?',
    [testRuleId]
  );
  assert(checkRows.length === 0, 'Atomic rollback verified: 0 dirty rows committed to shard');

  // 7. Shard Write & Read Persistence
  console.log('\n--- 7. Shard Write & Read Persistence ---');
  const persistTestId = `rule_persist_${Date.now()}`;
  await shardRouter.executeShardWrite(
    'BSC-SHARD-BEL-001',
    'INSERT INTO `breakrule` (id, locationId, breakType, durationMinutes, isPaid, createdAt, updatedAt) VALUES (?, "cmuwszr8t00011vdtc7vgvags", "LUNCH", 30, 1, NOW(3), NOW(3))',
    [persistTestId]
  );

  const readBack = await shardRouter.executeShardRead(
    'BSC-SHARD-BEL-001',
    'SELECT id, breakType FROM `breakrule` WHERE id = ?',
    [persistTestId]
  );
  assert(readBack.length === 1 && readBack[0].breakType === 'LUNCH', 'Record persisted and read back cleanly from shard');

  // Clean up
  await shardRouter.executeShardWrite('BSC-SHARD-BEL-001', 'DELETE FROM `breakrule` WHERE id = ?', [persistTestId]);

  // 8. Cross-Shard Aggregation
  console.log('\n--- 8. Cross-Shard Aggregation Engine ---');
  const aggregation = await shardRouter.executeCrossShardAggregation(async (shardId, pool) => {
    const [rows]: any = await pool.query('SELECT COUNT(*) as count FROM `employee`');
    return [{ shardId, employeeCount: Number(rows[0]?.count || 0) }];
  });

  assert(aggregation.data.length >= 3, 'Aggregation gathered results from all active shards');
  assert(
    Object.values(aggregation.shardSummaries).every((s) => s.success),
    'Per-shard aggregation status: All operational shards succeeded with zero unhandled exceptions'
  );

  // 9. Graceful Unavailable Shard Handling
  console.log('\n--- 9. Graceful Unavailable Shard Fallback ---');
  let fallbackSuccess = false;
  try {
    const pool = shardManager.getPool('NON_EXISTENT_SHARD_999');
    // Connection manager falls back safely to control pool with a warning rather than crashing
    assert(Boolean(pool), 'Manager handles unregistered shard by safely falling back to control shard');
    fallbackSuccess = true;
  } catch (err: any) {
    fallbackSuccess = false;
  }
  assert(fallbackSuccess, 'System does not crash on unknown shard ID');

  // Summary
  console.log('\n========================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  await shardManager.shutdown();

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runShardingTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
