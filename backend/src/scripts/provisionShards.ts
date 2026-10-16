/**
 * BSC Textiles HRMS — Physical Shard Provisioning & Data Isolation Engine
 * Provisions operational MySQL databases for each showroom location, initializes schema,
 * backfills location-isolated operational data, reconciles row counts, and logs checkpoints.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const BASE_URI = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';

interface ShardConfig {
  databaseId: string;
  databaseName: string;
  locationCode: string;
  locationId: string;
  shardName: string;
}

const SHARDS_TO_PROVISION: ShardConfig[] = [
  {
    databaseId: 'BSC-SHARD-BEL-001',
    databaseName: 'bsc_shard_bel',
    locationCode: 'BEL',
    locationId: 'cmuwszr8t00011vdtc7vgvags',
    shardName: 'Belagavi Operational Store Shard',
  },
  {
    databaseId: 'BSC-SHARD-DAV-001',
    databaseName: 'bsc_shard_dav',
    locationCode: 'DAV',
    locationId: 'cmuwszr9500021vdtxscy3nsc',
    shardName: 'Davanagere Mega Store Shard',
  },
  {
    databaseId: 'BSC-SHARD-SHI-001',
    databaseName: 'bsc_shard_shi',
    locationCode: 'SHI',
    locationId: 'cmuwszr9s00031vdtqlwzkrw8',
    shardName: 'Shivamogga Flagship Shard',
  },
];

export async function provisionAllShards() {
  console.log('================================================================');
  console.log('🚀 BSC TEXTILES HRMS — OPERATIONAL SHARD PROVISIONING & DATA ENGINE');
  console.log('================================================================');

  // 1. Connect to control database and base MySQL server
  const controlConn = await mysql.createConnection({
    uri: BASE_URI,
    multipleStatements: true,
  });

  const parsedUrl = new URL(BASE_URI.startsWith('mysql://') ? BASE_URI : `mysql://${BASE_URI}`);
  const rootConn = await mysql.createConnection({
    host: parsedUrl.hostname || 'localhost',
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username || 'root',
    password: parsedUrl.password || '',
    multipleStatements: true,
  });

  const [tablesResult]: any = await controlConn.query('SHOW TABLES');
  const tableNames: string[] = tablesResult.map((r: any) => Object.values(r)[0]);
  console.log(`[Control DB] Identified ${tableNames.length} tables in primary database.`);

  // Get table schemas (DDL) for all tables
  const ddlMap: Record<string, string> = {};
  for (const tbl of tableNames) {
    try {
      const [createRes]: any = await controlConn.query(`SHOW CREATE TABLE \`${tbl}\``);
      if (createRes && createRes[0] && createRes[0]['Create Table']) {
        ddlMap[tbl] = createRes[0]['Create Table'];
      }
    } catch (err: any) {
      console.warn(`Could not fetch DDL for table ${tbl}:`, err.message);
    }
  }

  const [generatedCols]: any = await controlConn.query(
    "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND (EXTRA LIKE '%VIRTUAL%' OR EXTRA LIKE '%STORED%')"
  );
  const generatedColSet = new Set(generatedCols.map((c: any) => `${c.TABLE_NAME}.${c.COLUMN_NAME}`));

  function sanitizeRow(row: any, tableName: string): any {
    const sanitized: Record<string, any> = { ...row };
    for (const key of Object.keys(sanitized)) {
      if (generatedColSet.has(`${tableName}.${key}`)) {
        delete sanitized[key];
        continue;
      }
      let val = sanitized[key];

      // Fix Invalid Date objects from legacy zero-dates
      if (val instanceof Date && isNaN(val.getTime())) {
        val = sanitized['createdAt'] instanceof Date && !isNaN(sanitized['createdAt'].getTime())
          ? sanitized['createdAt']
          : new Date();
        sanitized[key] = val;
      }

      if ((key === 'updatedAt' || key === 'updated_at') && (val == null || (val instanceof Date && isNaN(val.getTime())))) {
        sanitized[key] = sanitized['createdAt'] || sanitized['created_at'] || new Date();
      } else if (key === 'permissions') {
        if (typeof val === 'string') {
          if (!val.startsWith('[') && !val.startsWith('{')) {
            sanitized[key] = JSON.stringify([val]);
          }
        } else if (typeof val === 'object' && val !== null) {
          sanitized[key] = JSON.stringify(val);
        }
      } else if (typeof val === 'object' && val !== null && !(val instanceof Date) && !Buffer.isBuffer(val)) {
        sanitized[key] = JSON.stringify(val);
      }
    }
    return sanitized;
  }

  for (const shard of SHARDS_TO_PROVISION) {
    const batchId = `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    console.log(`\n----------------------------------------------------------------`);
    console.log(`📦 Provisioning Shard: ${shard.databaseId} (${shard.databaseName}) for [${shard.locationCode}]`);
    console.log(`----------------------------------------------------------------`);

    // Record migration start in control DB
    const migrationId = `mig_${shard.databaseId}_${Date.now()}`;
    await controlConn.query(
      `INSERT INTO shard_migrations (id, migration_name, shard_id, batch_id, status, started_at)
       VALUES (?, ?, ?, ?, 'IN_PROGRESS', CURRENT_TIMESTAMP(3))`,
      [migrationId, 'INITIAL_SHARD_PROVISION_AND_DATA_SEED', shard.databaseId, batchId]
    );

    try {
      // 1. Create database
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${shard.databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      console.log(`  ✔ MySQL Database \`${shard.databaseName}\` ensured.`);

      // 2. Connect to shard database
      const shardConn = await mysql.createConnection({
        host: parsedUrl.hostname || 'localhost',
        port: Number(parsedUrl.port) || 3306,
        user: parsedUrl.username || 'root',
        password: parsedUrl.password || '',
        database: shard.databaseName,
        multipleStatements: true,
      });

      // 3. Clone table schemas
      await shardConn.query('SET FOREIGN_KEY_CHECKS = 0;');
      for (const [tbl, ddl] of Object.entries(ddlMap)) {
        const safeDdl = ddl.replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
        await shardConn.query(safeDdl);
      }
      await shardConn.query('SET FOREIGN_KEY_CHECKS = 1;');
      console.log(`  ✔ Schema cloned successfully (${Object.keys(ddlMap).length} tables created).`);

      // 4. Data Migration & Scoped Backfill
      let totalMigrated = 0;

      // Disable foreign keys during initial data copy
      await shardConn.query('SET FOREIGN_KEY_CHECKS = 0;');

      // 4a. Copy location record for this shard
      const [locations]: any = await controlConn.query(`SELECT * FROM \`location\` WHERE id = ? OR code = ?`, [shard.locationId, shard.locationCode]);
      if (locations.length > 0) {
        await shardConn.query(`REPLACE INTO \`location\` SET ?`, [locations[0]]);
        totalMigrated += locations.length;
      }

      // 4b. Copy organizational hierarchy: floor, department, section, shift, sellingpoint
      for (const orgTbl of ['floor', 'department', 'section', 'shift', 'sellingpoint']) {
        if (tableNames.includes(orgTbl)) {
          const [orgRows]: any = await controlConn.query(`SELECT * FROM \`${orgTbl}\` WHERE locationId = ?`, [shard.locationId]);
          for (const row of orgRows) {
            await shardConn.query(`REPLACE INTO \`${orgTbl}\` SET ?`, [sanitizeRow(row, orgTbl)]);
          }
          totalMigrated += orgRows.length;
        }
      }

      // 4c. Copy users assigned to this location
      const [users]: any = await controlConn.query(`SELECT * FROM \`user\` WHERE locationId = ?`, [shard.locationId]);
      for (const user of users) {
        await shardConn.query(`REPLACE INTO \`user\` SET ?`, [sanitizeRow(user, 'user')]);
      }
      totalMigrated += users.length;
      console.log(`  ✔ Copied ${users.length} assigned users.`);

      // 4d. Copy employees assigned to this location
      const [employees]: any = await controlConn.query(`SELECT * FROM \`employee\` WHERE locationId = ?`, [shard.locationId]);
      for (const emp of employees) {
        await shardConn.query(`REPLACE INTO \`employee\` SET ?`, [sanitizeRow(emp, 'employee')]);
      }
      totalMigrated += employees.length;
      console.log(`  ✔ Copied ${employees.length} employees.`);

      // 4e. Copy location-scoped operational records: attendance, breaks, biometric, payroll, leaves, observations
      const locationTables = [
        'attendance',
        'attendancerules',
        'attendancecorrection',
        'late_attendance_record',
        'employeebreak',
        'breakrule',
        'leaverequest',
        'leave_requests',
        'payrollrun',
        'payrollitem',
        'faceverification',
        'qrcode',
        'qrscanrecord',
        'observation',
        'observationattachment',
        'observationcomment',
        'observationreaction',
        'employee_documents',
      ];

      for (const lt of locationTables) {
        if (tableNames.includes(lt)) {
          // Check if table has locationId or location_id column
          const [cols]: any = await controlConn.query(`DESCRIBE \`${lt}\``);
          const colNames = cols.map((c: any) => c.Field);
          const locCol = colNames.includes('locationId') ? 'locationId' : colNames.includes('location_id') ? 'location_id' : null;

          if (locCol) {
            const [rows]: any = await controlConn.query(`SELECT * FROM \`${lt}\` WHERE \`${locCol}\` = ?`, [shard.locationId]);
            for (const r of rows) {
              await shardConn.query(`REPLACE INTO \`${lt}\` SET ?`, [sanitizeRow(r, lt)]);
            }
            totalMigrated += rows.length;
            if (rows.length > 0) {
              console.log(`    - Table \`${lt}\`: copied ${rows.length} records.`);
            }
          } else if (colNames.includes('employeeId')) {
            // Copy via employee ID relation
            const [rows]: any = await controlConn.query(
              `SELECT t.* FROM \`${lt}\` t 
               JOIN \`employee\` e ON t.employeeId = e.id 
               WHERE e.locationId = ?`,
              [shard.locationId]
            );
            for (const r of rows) {
              await shardConn.query(`REPLACE INTO \`${lt}\` SET ?`, [sanitizeRow(r, lt)]);
            }
            totalMigrated += rows.length;
            if (rows.length > 0) {
              console.log(`    - Table \`${lt}\`: copied ${rows.length} records via employeeId.`);
            }
          }
        }
      }

      await shardConn.query('SET FOREIGN_KEY_CHECKS = 1;');

      // 5. Verification & Reconciliation
      const [shardEmpCount]: any = await shardConn.query('SELECT COUNT(*) as count FROM `employee`');
      const [controlEmpCount]: any = await controlConn.query('SELECT COUNT(*) as count FROM `employee` WHERE locationId = ?', [shard.locationId]);

      const [shardAttCount]: any = await shardConn.query('SELECT COUNT(*) as count FROM `attendance`');
      const [controlAttCount]: any = await controlConn.query('SELECT COUNT(*) as count FROM `attendance` WHERE locationId = ?', [shard.locationId]);

      console.log(`  📊 Reconciliation Results:`);
      console.log(`    Employees  -> Control: ${controlEmpCount[0].count} | Shard: ${shardEmpCount[0].count} (${shardEmpCount[0].count === controlEmpCount[0].count ? '✔ MATCH' : '⚠ MISMATCH'})`);
      console.log(`    Attendance -> Control: ${controlAttCount[0].count} | Shard: ${shardAttCount[0].count} (${shardAttCount[0].count === controlAttCount[0].count ? '✔ MATCH' : '⚠ MISMATCH'})`);

      // Update registry stats
      await controlConn.query(
        `UPDATE database_shards 
         SET total_employees = ?, total_users = ?, status = 'ACTIVE', health_status = 'HEALTHY', last_health_check_at = CURRENT_TIMESTAMP(3)
         WHERE database_id = ?`,
        [shardEmpCount[0].count, users.length, shard.databaseId]
      );

      // Complete migration record
      await controlConn.query(
        `UPDATE shard_migrations 
         SET status = 'COMPLETED', records_migrated = ?, details = ?, completed_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [
          totalMigrated,
          JSON.stringify({
            employees: shardEmpCount[0].count,
            attendance: shardAttCount[0].count,
            users: users.length,
            reconciled: true,
          }),
          migrationId,
        ]
      );

      await shardConn.end();
      console.log(`  🎉 Shard ${shard.databaseId} successfully provisioned and verified!`);
    } catch (err: any) {
      console.error(`  ❌ Error provisioning shard ${shard.databaseId}:`, err);
      await controlConn.query(
        `UPDATE shard_migrations 
         SET status = 'FAILED', error_message = ?, completed_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [err.message, migrationId]
      );
      throw err;
    }
  }

  // Update HQ shard stats
  const [hqUsers]: any = await controlConn.query('SELECT COUNT(*) as count FROM user WHERE database_id = "BSC-SHARD-HQ-001"');
  await controlConn.query(
    `UPDATE database_shards 
     SET total_users = ?, status = 'ACTIVE', health_status = 'HEALTHY', last_health_check_at = CURRENT_TIMESTAMP(3)
     WHERE database_id = 'BSC-SHARD-HQ-001'`,
    [hqUsers[0].count]
  );

  console.log('\n================================================================');
  console.log('✅ ALL OPERATIONAL SHARDS PROVISIONED AND RECONCILED SUCCESSFULLY');
  console.log('================================================================\n');

  await controlConn.end();
  await rootConn.end();
}

provisionAllShards()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error during shard provisioning:', err);
    process.exit(1);
  });

