/**
 * BSC Textiles HRMS — Davangere Location Security & Access Control Tests
 * 
 * Verifies that:
 * 1. Unauthorized cross-location device access is blocked (BEL / SHI user accessing DAV device -> 403 Forbidden)
 * 2. Permanent DAV device serial numbers cannot be assigned to BEL, SHI, or other locations -> 400 Bad Request
 * 3. Raw punch access for DAV from a non-elevated BEL user is blocked -> 403 Forbidden
 * 4. Biometric mapping creation for DAV from a non-elevated BEL user is blocked -> 403 Forbidden
 * 5. Edge Connector secret key allows authenticated raw punch ingestion
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import deviceRouter from '../routes/devices.js';
import { generateToken } from '../middleware/auth.js';
import { pool } from '../nativeDb.js';

const BEL_LOCATION_ID = 'cmuwszr8t00011vdtc7vgvags';
const DAV_LOCATION_ID = 'cmuwszr9500021vdtxscy3nsc';

async function runTest(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
    return true;
  } catch (err: any) {
    console.error(`  ❌ ${name}:`, err.message);
    return false;
  }
}

export async function runDavangereSecurityTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🔒 RUNNING DAVANGERE LOCATION SECURITY & AUTHORIZATION TESTS');
  console.log('================================================================\n');

  // Find or insert test users in database so authenticate() succeeds
  const [adminRows]: any = await pool.query(
    `SELECT id, email, role, locationId FROM user WHERE role = 'SUPER_ADMIN' AND isActive = 1 LIMIT 1`
  );
  assert.ok(adminRows.length > 0, 'Must have at least one active SUPER_ADMIN user');
  const adminUser = adminRows[0];

  // Find or create active Belagavi HR user
  let [belRows]: any = await pool.query(
    `SELECT id, email, role, locationId FROM user WHERE locationId = ? AND role NOT IN ('SUPER_ADMIN', 'ADMIN') AND isActive = 1 LIMIT 1`,
    [BEL_LOCATION_ID]
  );
  let belUserId = belRows[0]?.id;
  if (!belUserId) {
    belUserId = 'test-bel-hr-user-id';
    await pool.query(
      `INSERT INTO user (id, email, passwordHash, fullName, role, permissions, locationId, isActive, status)
       VALUES (?, 'bel.hr.sec.test@bsctextiles.internal', '$2a$10$xyz', 'Belagavi HR Tester', 'HR_EXECUTIVE', '["VIEW","EDIT"]', ?, 1, 'ACTIVE')
       ON DUPLICATE KEY UPDATE isActive = 1, status = 'ACTIVE'`,
      [belUserId, BEL_LOCATION_ID]
    );
  }

  // Find or create active Davangere HR user
  let [davRows]: any = await pool.query(
    `SELECT id, email, role, locationId FROM user WHERE locationId = ? AND role NOT IN ('SUPER_ADMIN', 'ADMIN') AND isActive = 1 LIMIT 1`,
    [DAV_LOCATION_ID]
  );
  let davUserId = davRows[0]?.id;
  if (!davUserId) {
    davUserId = 'test-dav-hr-user-id';
    await pool.query(
      `INSERT INTO user (id, email, passwordHash, fullName, role, permissions, locationId, isActive, status)
       VALUES (?, 'dav.hr.sec.test@bsctextiles.internal', '$2a$10$xyz', 'Davangere HR Tester', 'HR_EXECUTIVE', '["VIEW","EDIT"]', ?, 1, 'ACTIVE')
       ON DUPLICATE KEY UPDATE isActive = 1, status = 'ACTIVE'`,
      [davUserId, DAV_LOCATION_ID]
    );
  }

  const app = express();
  app.use(express.json());
  app.use('/api/devices', deviceRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const belUserToken = generateToken({
    id: belUserId,
    email: 'bel.hr.sec.test@bsctextiles.internal',
    role: 'HR_EXECUTIVE',
    permissions: ['VIEW', 'EDIT'],
    locationId: BEL_LOCATION_ID,
  });

  const davUserToken = generateToken({
    id: davUserId,
    email: 'dav.hr.sec.test@bsctextiles.internal',
    role: 'HR_EXECUTIVE',
    permissions: ['VIEW', 'EDIT'],
    locationId: DAV_LOCATION_ID,
  });

  const superAdminToken = generateToken({
    id: adminUser.id,
    email: adminUser.email,
    role: adminUser.role,
    permissions: ['ALL'],
    locationId: adminUser.locationId,
  });

  let passed = 0;
  let total = 0;

  try {
    total++;
    if (await runTest('Test 1: Non-elevated BEL user cannot test connection of DAV Terminal -> 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/devices/bio-dev-dav-001/test-connection`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${belUserToken}` },
      });
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      const data: any = await res.json();
      assert.match(data.error, /Forbidden: Access denied/);
    })) passed++;

    total++;
    if (await runTest('Test 2: Non-elevated BEL user cannot trigger sync on DAV Terminal -> 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/devices/bio-dev-dav-001/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${belUserToken}` },
      });
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      const data: any = await res.json();
      assert.match(data.error, /Forbidden/);
    })) passed++;

    total++;
    if (await runTest('Test 3: Non-elevated BEL user cannot query raw punches with showroomCode=DAV -> 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/devices/raw-punches?showroomCode=DAV`, {
        headers: { Authorization: `Bearer ${belUserToken}` },
      });
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      const data: any = await res.json();
      assert.match(data.error, /Forbidden: Access denied/);
    })) passed++;

    total++;
    if (await runTest('Test 4: Non-elevated BEL user cannot query biometric mappings for showroom=DAV -> 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/devices/mappings?showroom=DAV`, {
        headers: { Authorization: `Bearer ${belUserToken}` },
      });
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      const data: any = await res.json();
      assert.match(data.error, /Forbidden: Access denied/);
    })) passed++;

    total++;
    if (await runTest('Test 5: Reassigning a permanent DAV serial number to BEL is rejected -> 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/devices/bio-dev-dav-001`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locationCode: 'BEL' }),
      });
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      const data: any = await res.json();
      assert.match(data.error, /permanently bound to Davangere/);
    })) passed++;

    total++;
    if (await runTest('Test 6: Registering a permanent DAV serial number under BEL is rejected -> 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/devices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serialNumber: 'JNP2252300795',
          name: 'Attempted BEL Reassignment',
          ipAddress: '192.168.0.50',
          locationCode: 'BEL',
        }),
      });
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      const data: any = await res.json();
      assert.match(data.error, /belongs exclusively to Davangere/);
    })) passed++;

    total++;
    if (await runTest('Test 7: Edge Connector key allows authenticated raw punch ingestion', async () => {
      const res = await fetch(`${baseUrl}/api/devices/ingest-raw`, {
        method: 'POST',
        headers: {
          'x-connector-key': process.env.BIOMETRIC_CONNECTOR_KEY || 'bsc-biometric-connector-secret-key-2024',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          punches: [
            {
              serialNumber: 'JNP2252300795',
              enrollmentNumber: '101',
              punchTime: '2026-10-16 12:34:56',
              punchType: 'CHECK_IN',
              verifyMode: 15,
            },
          ],
        }),
      });
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.success, true);
    })) passed++;

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`📊 SECURITY TEST RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    throw new Error(`Davangere security test suite failed: ${total - passed} test(s) failed`);
  }
}

if (process.argv[1]?.endsWith('davangereLocationSecurity.test.ts')) {
  runDavangereSecurityTests()
    .then(() => {
      console.log('🎉 All Davangere Location Security Tests Passed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('💥 Security test suite failure:', err);
      process.exit(1);
    });
}
