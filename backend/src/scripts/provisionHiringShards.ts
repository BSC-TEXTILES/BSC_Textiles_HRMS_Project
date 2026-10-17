/**
 * Candidate Hiring — shard backfill / repair CLI.
 *
 * Ensures every location has a physical shard (`bsc_shard_<code>`) with the
 * hiring schema applied and a healthy registry row, then prints the state of
 * each shard as shown on the Location Management page.
 *
 * Usage: npm run provision:hiring-shards
 */

import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

import { shardManager } from '../core/sharding/index.js';
import {
  ensureHiringShardsForAllLocations,
  getHiringShardOverview,
} from '../services/hiring/hiringShardProvisioner.js';

async function main() {
  console.log('================================================================');
  console.log('BSC TEXTILES HRMS — HIRING SHARD PROVISIONING');
  console.log('================================================================');

  await shardManager.initialize();

  const reports = await ensureHiringShardsForAllLocations();
  console.log('\nProvisioning results:');
  let failed = 0;
  for (const r of reports) {
    if (r.error) {
      failed++;
      console.log(`  FAIL ${r.locationCode} -> ${r.databaseName}: ${r.error}`);
    } else {
      console.log(
        `  OK   ${r.locationCode} -> ${r.databaseName} [${r.action}] schema=${r.schemaApplied ? 'applied' : 'skipped'} health=${r.healthStatus} (${r.latencyMs}ms)`
      );
      if (r.missingTables.length > 0) console.log(`       missing tables: ${r.missingTables.join(', ')}`);
    }
  }

  const overview = await getHiringShardOverview();
  console.log('\nShard state overview:');
  console.log('  DATABASE_ID            DB NAME              LOCATION  HIRING  SCHEMA  HEALTH    LATENCY');
  for (const s of overview) {
    const hiring = s.locationId ? (s.hiringEnabled ? 'on ' : 'off') : ' - ';
    console.log(
      `  ${s.databaseId.padEnd(22)} ${s.databaseName.padEnd(20)} ${(s.locationCode || '-').padEnd(9)} ${hiring.padEnd(7)} ${(s.hiringSchemaReady ? 'ready ' : 'MISSING').padEnd(7)} ${s.healthStatus.padEnd(9)} ${s.latencyMs}ms`
    );
  }

  await shardManager.shutdown();

  if (failed > 0) {
    console.error(`\n${failed} shard(s) failed to provision.`);
    process.exit(1);
  }
  console.log('\nAll hiring shards provisioned and healthy.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during hiring shard provisioning:', err);
  process.exit(1);
});
