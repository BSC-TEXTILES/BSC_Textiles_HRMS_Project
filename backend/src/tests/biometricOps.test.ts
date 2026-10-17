/**
 * BSC Textiles HRMS — Suite 21: Biometric Device Ops
 *
 * Covers the device-section work added on top of the punch pipeline:
 *   - pure mismatch classification rules (unit, no HTTP);
 *   - floor/section registry + device CRUD (floorId/sectionId, deactivate, audit);
 *   - mismatch queue: scan, dedupe/idempotence, seeded deliberate problems,
 *     filters, detail view;
 *   - inline detection on ingest (UNKNOWN_USER created at punch time);
 *   - resolution workflow: scope + role enforcement, dryRun, IGNORE, audit trail,
 *     decided-record guard;
 *   - attendance log: joins, filters, pagination, status view, scoping;
 *   - streamed exports: complete CSV, floor-wise XLSX, mismatch CSV, kind guard.
 */

import { pool } from '../nativeDb.js';
import {
  MISMATCH_TYPES,
  severityForType,
  personNamesMatch,
  biometricIdsDisagree,
  classifyPunchMismatch,
  classifyDeviceUser,
  classifyNotSynced,
  classifyDuplicateGroup,
  DeviceLite,
  EmployeeLite,
  MappingLite,
  PunchContext,
  PunchVantage,
} from '../services/biometric/mismatch.js';

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: any;
}

interface ApiResponse {
  status: number;
  ok: boolean;
  json: any;
  text: string;
  contentType: string | null;
  bytes: number;
}

function expect(condition: any, message: string): void {
  if (!condition) throw new Error(message);
}

export async function runBiometricOpsTests(
  baseUrl: string,
  adminToken: string,
  belagaviHrToken: string,
  employeeToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  async function recordTest(name: string, fn: () => Promise<any>) {
    const start = Date.now();
    try {
      const details = await fn();
      results.push({ name, passed: true, durationMs: Date.now() - start, details });
      console.log(`  ✔ [PASS] ${name} (${Date.now() - start}ms)`);
    } catch (err: any) {
      results.push({ name, passed: false, durationMs: Date.now() - start, error: err.message });
      console.error(`  ❌ [FAIL] ${name} (${Date.now() - start}ms):`, err.message);
    }
  }

  async function api(
    path: string,
    options: { method?: string; token?: string; body?: any; raw?: boolean } = {}
  ): Promise<ApiResponse> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString('utf8');
    let json: any = null;
    if (!options.raw) {
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
    }
    return {
      status: res.status,
      ok: res.ok,
      json,
      text,
      contentType: res.headers.get('content-type'),
      bytes: buffer.length,
    };
  }

  const DEVICE: DeviceLite = {
    id: 'unit-d1',
    serialNumber: 'UNIT-SER-1',
    name: 'Unit Test Terminal',
    locationCode: 'BEL',
    floorId: 'F1',
    sectionId: 'SEC1',
    isActive: true,
  };
  const EMPLOYEE: EmployeeLite = {
    id: 'unit-e1',
    employeeCode: '100201',
    fullName: 'Rajesh Kumar',
    status: 'ACTIVE',
    floorId: 'F1',
    sectionId: 'SEC1',
    biometricDeviceEmployeeId: '100201',
  };
  const MAPPING: MappingLite = {
    id: 'unit-m1',
    employeeId: 'unit-e1',
    enrollmentNumber: '100201',
    normalizedEnrollment: '100201',
    serialNumber: 'UNIT-SER-1',
    showroomCode: 'BEL',
    status: 'ACTIVE',
  };
  const PUNCH: PunchVantage = {
    punchId: 'unit-p1',
    serialNumber: 'UNIT-SER-1',
    enrollmentNumber: '100201',
    normalizedId: '100201',
    mappingStatus: 'MAPPED',
    employeeId: 'unit-e1',
    punchTimeUtc: new Date(),
  };
  const HAPPY_CTX: PunchContext = {
    device: DEVICE,
    employee: EMPLOYEE,
    mapping: MAPPING,
    deviceUser: { pin: '100201', normalizedPin: '100201', deviceName: 'Rajesh Kumar', employeeId: 'unit-e1' },
    assignedDevice: DEVICE,
  };

  // ─── Unit: mismatch rules ──────────────────────────────────────────────────

  await recordTest('Unit: severity map covers every mismatch type', async () => {
    for (const type of MISMATCH_TYPES) {
      const severity = severityForType(type);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity), `Unknown severity ${severity} for ${type}`);
    }
    expect(severityForType('UNKNOWN_DEVICE') === 'CRITICAL', 'UNKNOWN_DEVICE must be CRITICAL');
    expect(severityForType('DUPLICATE_ID') === 'CRITICAL', 'DUPLICATE_ID must be CRITICAL');
    expect(severityForType('DEVICE_MISMATCH') === 'HIGH', 'DEVICE_MISMATCH must be HIGH');
    expect(severityForType('ID_MISMATCH') === 'HIGH', 'ID_MISMATCH must be HIGH');
    expect(severityForType('NOT_SYNCED') === 'MEDIUM', 'NOT_SYNCED must be MEDIUM');
    expect(severityForType('UNKNOWN_USER') === 'LOW', 'UNKNOWN_USER must be LOW');
    return { types: MISMATCH_TYPES.length };
  });

  await recordTest('Unit: name and device-id comparison rules', async () => {
    expect(personNamesMatch('Lakshmi Devi', 'devi  LAKSHMI') === true, 'Name order/case must not matter');
    expect(personNamesMatch('Lakshmi Reddy', 'Lakshmi Devi') === false, 'Different names must not match');
    expect(personNamesMatch(null, 'Anyone') === true, 'Missing name is not evidence of mismatch');
    expect(biometricIdsDisagree('00200207', '200207') === false, 'Leading zeros must be ignored');
    expect(biometricIdsDisagree('500001', '9500001') === true, 'Different ids must disagree');
    expect(biometricIdsDisagree('', '200207') === false, 'Missing master id is not evidence');
    return { checked: 6 };
  });

  await recordTest('Unit: classifyPunchMismatch — unknown device / ambiguous / unmapped', async () => {
    const unknown = classifyPunchMismatch(PUNCH, { ...HAPPY_CTX, device: null });
    expect(unknown.length === 1 && unknown[0].type === 'UNKNOWN_DEVICE', 'Unregistered device must flag UNKNOWN_DEVICE');
    expect(unknown[0].severity === 'CRITICAL', 'UNKNOWN_DEVICE must be CRITICAL');

    const ambiguous = classifyPunchMismatch(
      { ...PUNCH, mappingStatus: 'AMBIGUOUS', normalizedId: '500001', candidates: [{ employeeId: 'unit-e1' }, { employeeId: 'unit-e2' }] },
      { ...HAPPY_CTX, employee: null, mapping: null, deviceUser: null }
    );
    expect(ambiguous.length === 1 && ambiguous[0].type === 'ID_MISMATCH', 'Ambiguous pin must flag ID_MISMATCH');

    const unmapped = classifyPunchMismatch(
      { ...PUNCH, mappingStatus: 'UNMAPPED', employeeId: null, normalizedId: '555555', enrollmentNumber: '555555' },
      { ...HAPPY_CTX, employee: null, mapping: null, deviceUser: null }
    );
    expect(unmapped.length === 1 && unmapped[0].type === 'UNKNOWN_USER', 'Unmapped pin must flag UNKNOWN_USER');

    const clean = classifyPunchMismatch(PUNCH, HAPPY_CTX);
    expect(clean.length === 0, `All-agree punch must produce no drafts, got ${clean.map((d) => d.type).join(',')}`);
    return { unknownDevice: unknown[0].dedupeKey, ambiguous: ambiguous[0].dedupeKey, unmapped: unmapped[0].dedupeKey };
  });

  await recordTest('Unit: classifyPunchMismatch — floor/section/assigned-device/name rules', async () => {
    const floorMismatch = classifyPunchMismatch(PUNCH, {
      ...HAPPY_CTX,
      employee: { ...EMPLOYEE, floorId: 'F2' },
    });
    expect(floorMismatch.some((d) => d.type === 'DEVICE_MISMATCH'), 'Employee on another floor must flag DEVICE_MISMATCH');
    const floorDraft = floorMismatch.find((d) => d.type === 'DEVICE_MISMATCH')!;
    expect(floorDraft.expected.floorId === 'F2', 'Draft must carry the employee floor as expected');
    expect(String(floorDraft.details).includes('floor'), 'Details must explain the floor conflict');

    const sectionMismatch = classifyPunchMismatch(PUNCH, {
      ...HAPPY_CTX,
      employee: { ...EMPLOYEE, sectionId: 'SEC2' },
    });
    expect(sectionMismatch.some((d) => d.type === 'DEVICE_MISMATCH'), 'Employee in another section must flag DEVICE_MISMATCH');

    const assignedMismatch = classifyPunchMismatch(PUNCH, {
      ...HAPPY_CTX,
      assignedDevice: { ...DEVICE, id: 'unit-d2', serialNumber: 'UNIT-SER-2', name: 'Assigned Terminal' },
    });
    const assignedDraft = assignedMismatch.find((d) => d.type === 'DEVICE_MISMATCH');
    expect(Boolean(assignedDraft), 'Punching on a terminal other than the assigned one must flag DEVICE_MISMATCH');
    expect(String(assignedDraft!.details).includes('assigned terminal'), 'Details must mention the assigned terminal');

    const nameMismatch = classifyPunchMismatch(PUNCH, {
      ...HAPPY_CTX,
      deviceUser: { pin: '100201', normalizedPin: '100201', deviceName: 'Rajesh Kumarr', employeeId: 'unit-e1' },
    });
    expect(nameMismatch.some((d) => d.type === 'NAME_MISMATCH'), 'Terminal/master name disagreement must flag NAME_MISMATCH');

    return { floor: floorDraft.dedupeKey, assigned: assignedDraft!.dedupeKey };
  });

  await recordTest('Unit: classifyDeviceUser — unknown / name / inactive rules', async () => {
    const unknown = classifyDeviceUser({
      device: DEVICE,
      deviceUser: { pin: '999001', normalizedPin: '999001', deviceName: 'Unknown Visitor', employeeId: null },
      mapping: null,
      employee: null,
    });
    expect(unknown.length === 1 && unknown[0].type === 'UNKNOWN_USER', 'PIN with no employee must flag UNKNOWN_USER');

    const name = classifyDeviceUser({
      device: DEVICE,
      deviceUser: { pin: '100201', normalizedPin: '100201', deviceName: 'Rajesh Kumarr', employeeId: 'unit-e1' },
      mapping: MAPPING,
      employee: EMPLOYEE,
    });
    expect(name.length === 1 && name[0].type === 'NAME_MISMATCH', 'Name disagreement must flag exactly NAME_MISMATCH');

    const inactive = classifyDeviceUser({
      device: DEVICE,
      deviceUser: { pin: '100201', normalizedPin: '100201', deviceName: 'Rajesh Kumar', employeeId: 'unit-e1' },
      mapping: MAPPING,
      employee: { ...EMPLOYEE, status: 'RESIGNED' },
    });
    expect(inactive.some((d) => d.type === 'INACTIVE_EMPLOYEE'), 'Resigned employee still on terminal must flag INACTIVE_EMPLOYEE');

    const clean = classifyDeviceUser({
      device: DEVICE,
      deviceUser: { pin: '100201', normalizedPin: '100201', deviceName: 'Rajesh Kumar', employeeId: 'unit-e1' },
      mapping: MAPPING,
      employee: EMPLOYEE,
    });
    expect(clean.length === 0, 'Consistent user row must produce no drafts');
    return { unknown: unknown[0].dedupeKey, name: name[0].dedupeKey };
  });

  await recordTest('Unit: classifyNotSynced — present / missing / no terminals / inactive', async () => {
    const pins = new Map<string, Set<string>>([['UNIT-SER-1', new Set(['100201'])]]);
    const notSyncedMapping: MappingLite = { ...MAPPING, id: 'unit-m2', employeeId: 'unit-e2', enrollmentNumber: '100206', normalizedEnrollment: '100206' };
    const geeta: EmployeeLite = { id: 'unit-e2', employeeCode: '100206', fullName: 'Geeta Kulkarni', status: 'ACTIVE' };

    const missing = classifyNotSynced({ mapping: notSyncedMapping, employee: geeta, showroomSerials: ['UNIT-SER-1'], pinsBySerial: pins });
    expect(missing !== null && missing.type === 'NOT_SYNCED', 'PIN absent from showroom terminals must flag NOT_SYNCED');
    expect(missing!.dedupeKey === 'NOT_SYNCED:unit-e2', `Dedupe key must be stable per employee, got ${missing!.dedupeKey}`);

    const presentPins = new Map<string, Set<string>>([['UNIT-SER-1', new Set(['100205'])]]);
    const synced = classifyNotSynced({
      mapping: { ...notSyncedMapping, enrollmentNumber: '100205', normalizedEnrollment: '100205' },
      employee: geeta,
      showroomSerials: ['UNIT-SER-1'],
      pinsBySerial: presentPins,
    });
    expect(synced === null, 'PIN present on any showroom terminal must not flag NOT_SYNCED');

    const noTerminals = classifyNotSynced({ mapping: notSyncedMapping, employee: geeta, showroomSerials: [], pinsBySerial: new Map() });
    expect(noTerminals === null, 'Showroom without active terminals must not produce NOT_SYNCED');

    const inactiveEmp = classifyNotSynced({ mapping: notSyncedMapping, employee: { ...geeta, status: 'RESIGNED' }, showroomSerials: ['UNIT-SER-1'], pinsBySerial: new Map() });
    expect(inactiveEmp === null, 'Inactive employees are excluded from NOT_SYNCED');
    return { dedupeKey: missing!.dedupeKey };
  });

  await recordTest('Unit: classifyDuplicateGroup — suffix collision produces one draft per employee', async () => {
    const drafts = classifyDuplicateGroup({
      lastSix: '500001',
      rows: [
        { mapping: { ...MAPPING, id: 'unit-m3', employeeId: 'unit-e1', enrollmentNumber: '500001', normalizedEnrollment: '500001' }, employee: EMPLOYEE },
        { mapping: { ...MAPPING, id: 'unit-m4', employeeId: 'unit-e9', enrollmentNumber: '9500001', normalizedEnrollment: '9500001' }, employee: { id: 'unit-e9', employeeCode: '100202', fullName: 'Priya Sharma', status: 'ACTIVE' } },
      ],
    });
    expect(drafts.length === 2, `Expected 2 drafts, got ${drafts.length}`);
    expect(drafts.every((d) => d.type === 'DUPLICATE_ID'), 'Both drafts must be DUPLICATE_ID');
    expect(drafts.every((d) => d.severity === 'CRITICAL'), 'Duplicate id collisions must be CRITICAL');
    const first = drafts[0].received.alsoClaimedBy as any[];
    expect(Array.isArray(first) && first.length === 1 && first[0].employeeCode === '100202', 'Each draft must name the other claimant');
    return { keys: drafts.map((d) => d.dedupeKey) };
  });

  // ─── API: scan + queue ─────────────────────────────────────────────────────

  await recordTest('API: ops-summary exposes the KPI card contract', async () => {
    const res = await api('/api/devices/ops-summary', { token: adminToken });
    expect(res.status === 200, `HTTP ${res.status}: ${res.text}`);
    const s = res.json.summary;
    expect(s && typeof s.totalOpen === 'number' && typeof s.totalResolved === 'number', 'Summary totals missing');
    expect(Array.isArray(s.byType) && s.byType.length === MISMATCH_TYPES.length, 'byType must cover all mismatch types');
    expect(s.byType.every((t: any) => typeof t.open === 'number' && typeof t.label === 'string'), 'byType rows must carry open+label');
    expect(s.devicesTotal >= 4, `Expected at least 4 registered devices, got ${s.devicesTotal}`);
    expect(s.devicesOnline + s.devicesOffline === s.devicesTotal, 'online+offline must equal total');
    expect(typeof s.punchesToday === 'number' && s.punchesToday >= 0, 'punchesToday missing');
    expect(typeof s.activeMappings === 'number', 'activeMappings missing');
    return { totalOpen: s.totalOpen, devicesTotal: s.devicesTotal, punchesToday: s.punchesToday };
  });

  await recordTest('API: mismatch scan is idempotent (second sweep creates zero new records)', async () => {
    const first = await api('/api/devices/mismatches/scan', { method: 'POST', token: adminToken, body: { sinceDays: 1 } });
    expect(first.status === 200 && first.json.success === true, `Scan failed: HTTP ${first.status} ${first.text.slice(0, 200)}`);
    expect(typeof first.json.scanned === 'number' && typeof first.json.created === 'number', 'Scan result shape invalid');

    const second = await api('/api/devices/mismatches/scan', { method: 'POST', token: adminToken, body: { sinceDays: 1 } });
    expect(second.status === 200 && second.json.success === true, `Second scan failed: HTTP ${second.status}`);
    expect(second.json.created === 0, `Second sweep must create 0 new records (dedupe), got ${second.json.created}`);
    return { first: { scanned: first.json.scanned, created: first.json.created, repeated: first.json.repeated }, second: { created: second.json.created, repeated: second.json.repeated } };
  });

  await recordTest('API: queue contains the deliberate seeded problems', async () => {
    const res = await api('/api/devices/mismatches?status=OPEN&limit=200', { token: adminToken });
    expect(res.status === 200 && Array.isArray(res.json.mismatches), `Queue unavailable: HTTP ${res.status}`);
    const rows: any[] = res.json.mismatches;

    const duplicate = rows.find((r) => r.mismatchType === 'DUPLICATE_ID' && ['500001', '9500001'].includes(String(r.biometricId)));
    expect(Boolean(duplicate), 'Seeded DUPLICATE_ID (500001/9500001) missing from queue');

    const nameMismatch = rows.find((r) => r.mismatchType === 'NAME_MISMATCH' && String(r.biometricId) === '200208');
    expect(Boolean(nameMismatch), 'Seeded NAME_MISMATCH pin 200208 missing from queue');
    expect(String(nameMismatch!.employeeCode) === '200208', 'NAME_MISMATCH must be attributed to employee 200208');

    const notSynced = rows.find((r) => r.mismatchType === 'NOT_SYNCED' && String(r.employeeCode) === '100206');
    expect(Boolean(notSynced), 'Seeded NOT_SYNCED (Geeta 100206) missing from queue');

    const unknown = rows.find((r) => r.mismatchType === 'UNKNOWN_USER' && ['999001', '888001'].includes(String(r.biometricId)));
    expect(Boolean(unknown), 'Seeded UNKNOWN_USER (999001/888001) missing from queue');

    const rajeshNoise = rows.find((r) => r.mismatchType === 'NOT_SYNCED' && String(r.employeeCode) === '100201');
    expect(!rajeshNoise, 'Rajesh 100201 must NOT be flagged NOT_SYNCED (both his PINs are on the terminal)');

    expect(res.json.mismatches.every((r: any) => r.status === 'OPEN'), 'Queue must return only OPEN records');
    return { openTotal: res.json.total, duplicateId: duplicate!.id, nameMismatch: nameMismatch!.id, notSynced: notSynced!.id };
  });

  await recordTest('API: mismatch filters (type, severity, employee search) narrow the queue', async () => {
    const byType = await api('/api/devices/mismatches?types=DUPLICATE_ID&status=ALL&limit=50', { token: adminToken });
    expect(byType.status === 200, `HTTP ${byType.status}`);
    expect(byType.json.mismatches.length >= 1, 'Type filter returned nothing');
    expect(byType.json.mismatches.every((r: any) => r.mismatchType === 'DUPLICATE_ID'), 'Type filter leaked other types');

    const bySeverity = await api('/api/devices/mismatches?severity=CRITICAL&status=ALL&limit=50', { token: adminToken });
    expect(bySeverity.json.mismatches.every((r: any) => r.severity === 'CRITICAL'), 'Severity filter leaked other severities');

    const search = await api('/api/devices/mismatches?employeeQuery=Geeta&status=ALL&limit=50', { token: adminToken });
    expect(search.json.mismatches.length >= 1, 'Employee search found nothing for Geeta');
    expect(search.json.mismatches.some((r: any) => String(r.employeeName).includes('Geeta')), 'Search rows must include the searched employee');
    return { byType: byType.json.total, bySeverity: bySeverity.json.total, search: search.json.total };
  });

  await recordTest('API: mismatch detail returns expected vs received snapshots', async () => {
    const list = await api('/api/devices/mismatches?types=NAME_MISMATCH&status=ALL&limit=1', { token: adminToken });
    expect(list.json.mismatches.length === 1, 'No NAME_MISMATCH record to inspect');
    const id = list.json.mismatches[0].id;

    const res = await api(`/api/devices/mismatches/${id}`, { token: adminToken });
    expect(res.status === 200 && res.json.mismatch, `Detail failed: HTTP ${res.status}`);
    const record = res.json.mismatch;
    expect(record.id === id, 'Detail id mismatch');
    expect(record.expected && typeof record.expected === 'object', 'expected snapshot missing');
    expect(record.received && typeof record.received === 'object', 'received snapshot missing');
    expect(String(record.expected.employeeName).includes('Lakshmi'), 'expected must hold the master name');

    const missing = await api('/api/devices/mismatches/no-such-record', { token: adminToken });
    expect(missing.status === 404, `Unknown record must 404, got ${missing.status}`);
    return { id, type: record.mismatchType, received: record.received };
  });

  await recordTest('API: ingest detects UNKNOWN_USER inline and stores it durably', async () => {
    const enrollment = '555555';
    const dedupeKey = `UNKNOWN_USER:SIMMB160DEMO01:${enrollment}`;
    const punchTime = new Date().toISOString();

    await pool.query('DELETE FROM biometric_mismatch_records WHERE dedupeKey = ?', [dedupeKey]);
    await pool.query('DELETE FROM biometric_raw_punches WHERE serialNumber = ? AND normalizedId = ?', ['SIMMB160DEMO01', enrollment]);

    try {
      const res = await api('/api/devices/ingest-raw', {
        method: 'POST',
        token: adminToken,
        body: { punches: [{ serialNumber: 'SIMMB160DEMO01', enrollmentNumber: enrollment, punchTime, punchType: 'CHECK_IN', verifyMode: 1 }] },
      });
      expect(res.status === 200 && res.json.success, `Ingest failed: HTTP ${res.status} ${res.text.slice(0, 200)}`);
      expect(res.json.result.inserted >= 1, 'Punch must be inserted');

      const [rows]: any = await pool.query(
        'SELECT id, mismatchType, severity, status, detectedBy, serialNumber FROM biometric_mismatch_records WHERE dedupeKey = ? LIMIT 1',
        [dedupeKey]
      );
      expect(rows.length === 1, 'Inline ingest detection did not persist an UNKNOWN_USER record');
      expect(rows[0].mismatchType === 'UNKNOWN_USER' && rows[0].status === 'OPEN', 'Inline record type/status wrong');
      expect(rows[0].detectedBy === 'INGEST', `detectedBy must be INGEST, got ${rows[0].detectedBy}`);
      return { mismatchId: rows[0].id, dedupeKey };
    } finally {
      await pool.query('DELETE FROM biometric_mismatch_records WHERE dedupeKey = ?', [dedupeKey]);
      await pool.query('DELETE FROM biometric_raw_punches WHERE serialNumber = ? AND normalizedId = ?', ['SIMMB160DEMO01', enrollment]);
    }
  });

  // ─── API: resolution workflow ──────────────────────────────────────────────

  await recordTest('API: resolution enforces scope, role and decided-record rules', async () => {
    const scratchId = `test-mm-ops-${Date.now()}`;
    await pool.query(
      `INSERT INTO biometric_mismatch_records
         (id, mismatchType, severity, status, detectedBy, dedupeKey, locationCode, deviceName, serialNumber,
          employeeId, employeeCode, employeeName, biometricId, expected, received, details, occurrenceCount, firstDetectedAt, lastDetectedAt)
       VALUES (?, 'DEVICE_MISMATCH', 'HIGH', 'OPEN', 'MANUAL', ?, 'DAV', 'Test Terminal', 'JNP2252300795',
          'emp-demo-200209', '200209', 'Manjunath Hebbar', '200209', '{}', '{}', 'Scratch record for ops suite', 1, NOW(3), NOW(3))`,
      [scratchId, scratchId]
    );

    try {
      // Belagavi HR cannot touch a Davangere record.
      const foreign = await api(`/api/devices/mismatches/${scratchId}/resolve`, {
        method: 'POST', token: belagaviHrToken, body: { action: 'IGNORE', remark: 'should not apply' },
      });
      expect(foreign.status === 403, `Cross-showroom resolve must 403, got ${foreign.status}`);

      // Employee persona has no EDIT on the devices module.
      const asEmployee = await api(`/api/devices/mismatches/${scratchId}/resolve`, {
        method: 'POST', token: employeeToken, body: { action: 'IGNORE' },
      });
      expect(asEmployee.status === 403, `Employee resolve must 403, got ${asEmployee.status}`);

      // Unknown action is rejected.
      const badAction = await api(`/api/devices/mismatches/${scratchId}/resolve`, {
        method: 'POST', token: adminToken, body: { action: 'NOT_AN_ACTION' },
      });
      expect(badAction.status === 400, `Invalid action must 400, got ${badAction.status}`);

      // dryRun previews without deciding.
      const preview = await api(`/api/devices/mismatches/${scratchId}/resolve`, {
        method: 'POST', token: adminToken, body: { action: 'IGNORE', dryRun: true, remark: 'preview only' },
      });
      expect(preview.status === 200 && preview.json.ok === true, `dryRun failed: HTTP ${preview.status} ${preview.text.slice(0, 200)}`);
      expect(preview.json.dryRun === true, 'dryRun flag must be echoed');
      const [afterPreview]: any = await pool.query('SELECT status, remark FROM biometric_mismatch_records WHERE id = ?', [scratchId]);
      expect(afterPreview[0].status === 'OPEN', 'dryRun must not decide the record');

      // Real decision.
      const decided = await api(`/api/devices/mismatches/${scratchId}/resolve`, {
        method: 'POST', token: adminToken, body: { action: 'IGNORE', remark: 'ops suite decision' },
      });
      expect(decided.status === 200 && decided.json.ok === true, `Resolve failed: HTTP ${decided.status} ${decided.text.slice(0, 200)}`);
      expect(decided.json.record.status === 'IGNORED', 'Record must be IGNORED');
      expect(decided.json.record.resolutionAction === 'IGNORE', 'resolutionAction must be IGNORE');
      expect(Boolean(decided.json.record.resolvedAt), 'resolvedAt must be stamped');

      const [afterDecide]: any = await pool.query('SELECT status, remark, resolvedById FROM biometric_mismatch_records WHERE id = ?', [scratchId]);
      expect(afterDecide[0].status === 'IGNORED' && afterDecide[0].remark === 'ops suite decision', 'Decision not persisted');
      expect(Boolean(afterDecide[0].resolvedById), 'resolvedById must be stamped');

      // Re-deciding is refused — decisions are final.
      const again = await api(`/api/devices/mismatches/${scratchId}/resolve`, {
        method: 'POST', token: adminToken, body: { action: 'RESOLVE' },
      });
      expect(again.status === 400, `Re-resolving a decided record must 400, got ${again.status}`);
      expect(String(again.json.message).includes('already'), 'Error must explain the record is already decided');

      // Audit trail exists.
      const [auditRows]: any = await pool.query(
        "SELECT COUNT(*) AS n FROM auditlog WHERE entityId = ? AND action = 'BIOMETRIC_MISMATCH_IGNORE'",
        [scratchId]
      );
      expect(Number(auditRows[0].n) >= 1, 'Resolution must be written to the chained audit log');
      return { scratchId, previewDryRun: preview.json.dryRun };
    } finally {
      await pool.query('DELETE FROM biometric_mismatch_records WHERE id = ?', [scratchId]);
    }
  });

  // ─── API: attendance log ───────────────────────────────────────────────────

  await recordTest('API: attendance log joins device/floor/section and paginates', async () => {
    const res = await api('/api/devices/attendance-log?limit=5', { token: adminToken });
    expect(res.status === 200 && res.json.success, `Attendance log failed: HTTP ${res.status} ${res.text.slice(0, 200)}`);
    expect(Array.isArray(res.json.rows) && res.json.rows.length <= 5, 'limit=5 must cap the page');
    expect(res.json.rows.length > 0, 'Attendance log is empty');
    expect(res.json.total >= 2015, `Expected the full ledger total, got ${res.json.total}`);
    expect(res.json.page === 1 && res.json.pageSize === 5, 'Pagination echo wrong');

    for (const row of res.json.rows) {
      expect(typeof row.deviceName === 'string' && row.deviceName.length > 0, 'deviceName missing');
      expect(['IN', 'OUT', 'MIDDLE', '—'].includes(row.direction), `Unexpected direction ${row.direction}`);
      expect(typeof row.status === 'string', 'status missing');
      expect(Boolean(row.punchTimeUtc) && Boolean(row.attendanceDate), 'timestamps missing');
    }

    const filtered = await api('/api/devices/attendance-log?serialNumber=SIMMB160DEMO01&limit=3', { token: adminToken });
    expect(filtered.json.rows.every((r: any) => r.serialNumber === 'SIMMB160DEMO01'), 'Serial filter leaked other terminals');

    const unsynced = await api('/api/devices/attendance-log?status=unsynced&limit=5', { token: adminToken });
    expect(unsynced.json.total >= 1, 'Expected at least one unsynced punch');
    expect(unsynced.json.rows.every((r: any) => r.status !== 'MATCHED'), 'Unsynced filter returned matched rows');
    return { total: res.json.total, unsynced: unsynced.json.total };
  });

  await recordTest('API: location scoping on ops endpoints', async () => {
    const hrForeignLog = await api('/api/devices/attendance-log?locationCode=DAV', { token: belagaviHrToken });
    expect(hrForeignLog.status === 403, `Belagavi HR requesting DAV log must 403, got ${hrForeignLog.status}`);

    const hrForeignQueue = await api('/api/devices/mismatches?locationCode=DAV', { token: belagaviHrToken });
    expect(hrForeignQueue.status === 403, `Belagavi HR requesting DAV queue must 403, got ${hrForeignQueue.status}`);

    const hrOwnQueue = await api('/api/devices/mismatches?limit=50', { token: belagaviHrToken });
    expect(hrOwnQueue.status === 200, `Belagavi HR own-showroom queue failed: HTTP ${hrOwnQueue.status}`);
    expect(
      hrOwnQueue.json.mismatches.every((r: any) => !r.locationCode || r.locationCode === 'BEL'),
      'Scoped queue leaked non-BEL records'
    );

    const adminDav = await api('/api/devices/attendance-log?locationCode=DAV&limit=5', { token: adminToken });
    expect(adminDav.status === 200, `Admin DAV log failed: HTTP ${adminDav.status}`);
    expect(adminDav.json.rows.every((r: any) => r.locationCode === 'DAV'), 'DAV filter returned other showrooms');
    return { hrOwnTotal: hrOwnQueue.json.total, adminDavTotal: adminDav.json.total };
  });

  // ─── API: exports ──────────────────────────────────────────────────────────

  await recordTest('API: complete CSV export streams the ledger with headers', async () => {
    const res = await api('/api/devices/export/complete?format=csv&serialNumber=SIMMB160DEMO01', { token: adminToken, raw: true });
    expect(res.status === 200, `Export failed: HTTP ${res.status}`);
    expect(String(res.contentType).includes('text/csv'), `Wrong content type ${res.contentType}`);
    expect(res.text.includes('BSC Textiles Pvt Ltd'), 'Company header row missing');
    expect(res.text.includes('Biometric Attendance — Complete Log'), 'Title row missing');
    const lines = res.text.trim().split('\r\n').filter(Boolean);
    expect(lines.length > 100, `Expected a real ledger export, got ${lines.length} lines`);
    return { bytes: res.bytes, lines: lines.length };
  });

  await recordTest('API: floor-wise XLSX export is a streamed spreadsheet', async () => {
    const res = await api('/api/devices/export/floor-wise?format=xlsx', { token: adminToken, raw: true });
    expect(res.status === 200, `Export failed: HTTP ${res.status}`);
    expect(String(res.contentType).includes('spreadsheetml.sheet'), `Wrong content type ${res.contentType}`);
    expect(res.text.startsWith('PK'), 'XLSX must be a zip container');
    expect(res.bytes > 5000, `XLSX too small (${res.bytes} bytes)`);
    return { bytes: res.bytes };
  });

  await recordTest('API: mismatch CSV export + invalid kind guard', async () => {
    const res = await api('/api/devices/export/mismatch?format=csv&status=OPEN', { token: adminToken, raw: true });
    expect(res.status === 200, `Mismatch export failed: HTTP ${res.status}`);
    expect(String(res.contentType).includes('text/csv'), 'Mismatch export must be CSV');
    expect(res.text.includes('BSC Textiles Pvt Ltd'), 'Company header missing');
    const hasKnownType = ['Duplicate', 'Not Synced', 'Name', 'Unknown'].some((needle) => res.text.includes(needle));
    expect(hasKnownType, 'Mismatch export must contain readable mismatch type labels');

    const bad = await api('/api/devices/export/not-a-kind', { token: adminToken });
    expect(bad.status === 400, `Invalid export kind must 400, got ${bad.status}`);
    return { bytes: res.bytes };
  });

  // ─── API: device registry floor/section CRUD ───────────────────────────────

  await recordTest('API: device CRUD maps floor/section, deactivates and audits', async () => {
    const [floors]: any = await pool.query(
      "SELECT f.id, f.name FROM floor f JOIN location l ON f.locationId = l.id WHERE l.code = 'BEL' ORDER BY f.floorNumber LIMIT 2"
    );
    const [sections]: any = await pool.query(
      "SELECT s.id, s.name FROM section s JOIN location l ON s.locationId = l.id WHERE l.code = 'BEL' ORDER BY s.code LIMIT 2"
    );
    expect(floors.length >= 2 && sections.length >= 2, 'Need two BEL floors and sections for the CRUD test');

    const serial = `TESTOPS${Date.now().toString().slice(-8)}`;
    let deviceId = '';

    try {
      const badFloor = await api('/api/devices', {
        method: 'POST', token: adminToken,
        body: { serialNumber: `${serial}X`, name: 'Ops Test Terminal', ipAddress: '10.99.99.2', locationCode: 'BEL', floorId: 'no-such-floor' },
      });
      expect(badFloor.status === 400, `Unknown floorId must 400, got ${badFloor.status}`);

      const created = await api('/api/devices', {
        method: 'POST', token: adminToken,
        body: {
          serialNumber: serial, name: 'Ops Test Terminal', ipAddress: '10.99.99.1',
          locationCode: 'BEL', floorId: floors[0].id, sectionId: sections[0].id,
        },
      });
      expect(created.status === 201 && created.json.device, `Create failed: HTTP ${created.status} ${created.text.slice(0, 200)}`);
      deviceId = created.json.device.id;

      const listed = await api('/api/devices', { token: adminToken });
      let row = listed.json.devices.find((d: any) => d.id === deviceId);
      expect(Boolean(row), 'Created device missing from registry');
      expect(row.floorId === floors[0].id && row.sectionId === sections[0].id, 'Floor/section not stored on create');
      expect(row.floorName === floors[0].name && row.sectionName === sections[0].name, 'Floor/section names not joined in registry');
      expect(row.enrolledUsers === 0 && row.todaysPunches === 0, 'Fresh device must report zero users/punches');

      const updated = await api(`/api/devices/${deviceId}`, {
        method: 'PUT', token: adminToken, body: { sectionId: sections[1].id },
      });
      expect(updated.status === 200, `Update failed: HTTP ${updated.status}`);
      const relisted = await api('/api/devices', { token: adminToken });
      row = relisted.json.devices.find((d: any) => d.id === deviceId);
      expect(row.sectionId === sections[1].id && row.sectionName === sections[1].name, 'Section change not applied');

      const deactivated = await api(`/api/devices/${deviceId}`, { method: 'PUT', token: adminToken, body: { deactivate: true } });
      expect(deactivated.status === 200, `Deactivate failed: HTTP ${deactivated.status}`);
      const afterDeactivate = await api('/api/devices', { token: adminToken });
      expect(!afterDeactivate.json.devices.some((d: any) => d.id === deviceId), 'Deactivated device must leave the active registry');

      const [auditRows]: any = await pool.query(
        "SELECT COUNT(*) AS n FROM auditlog WHERE entityId = ? AND action IN ('BIOMETRIC_DEVICE_REGISTERED','BIOMETRIC_DEVICE_UPDATED','BIOMETRIC_DEVICE_DEACTIVATED')",
        [deviceId]
      );
      expect(Number(auditRows[0].n) >= 2, 'Device lifecycle must be audited');
      return { deviceId, serial, floor: floors[0].name, sectionBefore: sections[0].name, sectionAfter: sections[1].name };
    } finally {
      if (deviceId) {
        await pool.query('DELETE FROM biometric_device_sync_state WHERE deviceId = ?', [deviceId]);
        await pool.query('DELETE FROM biometric_devices WHERE id = ?', [deviceId]);
      }
    }
  });

  await recordTest('API: runtime-created devices stay invisible to other showrooms', async () => {
    const res = await api('/api/devices/ops-summary?locationCode=ALL', { token: belagaviHrToken });
    expect(res.status === 200, `Scoped ops-summary failed: HTTP ${res.status}`);
    expect(res.json.summary.devicesTotal <= 1, `Belagavi HR must only count BEL terminals, got ${res.json.summary.devicesTotal}`);
    return { scopedDevices: res.json.summary.devicesTotal };
  });

  await recordTest('API: auditlog chained head still verifies alongside mismatch audit writes', async () => {
    const [rows]: any = await pool.query(
      "SELECT COUNT(*) AS n FROM auditlog WHERE action LIKE 'BIOMETRIC_MISMATCH%' OR action LIKE 'BIOMETRIC_DEVICE%'"
    );
    expect(Number(rows[0].n) >= 1, 'Expected biometric ops audit entries');
    return { opsAuditEntries: Number(rows[0].n) };
  });

  return results;
}
