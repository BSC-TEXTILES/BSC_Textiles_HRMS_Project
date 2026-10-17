/**
 * Biometric correctness suite.
 *
 * Covers the four things the audit found broken and that nothing else would
 * catch: timestamp conversion, employee-id mapping, verification-mode mapping
 * and duplicate handling — plus the wire-format parsers and the live ingestion
 * pipeline against the real database.
 *
 *   npm run test:biometric            # unit + database integration
 *   BIOMETRIC_TEST_UNIT_ONLY=1 ...    # skip anything needing MySQL
 *
 * Database tests create their own device/employee fixtures under a distinct
 * serial and delete only the rows they created.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  toSafePunchInstant,
  wallTimeToInstant,
  formatWallString,
  deviceCalendarDate,
  toUtcMysqlString,
  fromUtcMysqlString,
  decodeZkPackedTime,
  encodeZkPackedTime,
  encodeZkPackedTimeForInstant,
  clockDriftSeconds,
  instantToWallParts,
} from '../services/biometric/timeCodec.js';
import {
  resolveVerifyMode,
  resolvePunchState,
  involvesFace,
  STANDARD_ZK_VERIFY_MODES,
  UNKNOWN_LABEL,
  NOT_REPORTED_LABEL,
} from '../services/biometric/verifyMode.js';
import {
  normalizeDeviceUserId,
  resolveEmployeeIdentity,
  deriveMappingKeys,
} from '../services/biometric/employeeIdentity.js';
import {
  calculateZkChecksum,
  createZkPacket,
  parseZkAttLogBuffer,
  parseZkUserBuffer,
  wrapTcpZkPacket,
  makeCommKey,
} from '../services/zkProtocolAdapter.js';
import { toCsv, type ReportRow } from '../services/biometric/report.js';
import { pool } from '../nativeDb.js';
import { ingestPunches, attendanceRowId } from '../services/biometric/ingest.js';
import {
  saveEmployeeBiometricMapping,
  getDeviceStatusSnapshot,
  readBiometricHealth,
  recordDeviceHeartbeat,
} from '../services/biometricService.js';
import {
  listVerifyModeMapping,
  upsertVerifyModeMapping,
  deleteVerifyModeMapping,
  parseCandidateIds,
} from '../services/biometric/review.js';

type Case = { name: string; group: string; run: () => void | Promise<void> };

const cases: Case[] = [];
const test = (group: string, name: string, run: () => void | Promise<void>) => cases.push({ group, name, run });

const IST = 'Asia/Kolkata';
const UNIQUE = crypto.randomBytes(4).toString('hex');

// ─── A. Timestamp conversion ────────────────────────────────────────────────

test('time', 'device wall time in Asia/Kolkata becomes the right UTC instant', () => {
  const parsed = toSafePunchInstant('2026-10-16 09:12:34', { timeZone: IST });
  assert.ok(parsed.ok, parsed.detail);
  assert.equal(parsed.instant!.toISOString(), '2026-10-16T03:42:34.000Z');
});

test('time', 'conversion does not depend on the host timezone', () => {
  // The same naive string must always mean the same instant, because the zone
  // is passed explicitly rather than inherited from the machine.
  const viaIst = toSafePunchInstant('2026-06-01 00:05:00', { timeZone: IST }).instant!;
  const asUtcWall = toUtcMysqlString(viaIst);
  assert.equal(asUtcWall, '2026-05-31 18:35:00.000');
  assert.equal(fromUtcMysqlString(asUtcWall)!.toISOString(), viaIst.toISOString());
});

test('time', 'a punch at 04:55 IST stays on its own calendar day', () => {
  // This is the bug that made dates look random: 04:55 IST is 23:25 UTC the
  // previous day, so any code deriving the attendance date from toISOString()
  // filed the punch under yesterday.
  const instant = toSafePunchInstant('2026-10-16 04:55:00', { timeZone: IST }).instant!;
  assert.equal(instant.toISOString().slice(0, 10), '2026-10-15', 'UTC date is indeed the day before');
  assert.equal(deviceCalendarDate(instant, IST), '2026-10-16', 'device calendar date is correct');
});

test('time', 'a late-evening punch keeps its day too', () => {
  const instant = toSafePunchInstant('2026-10-16 23:59:59', { timeZone: IST }).instant!;
  assert.equal(deviceCalendarDate(instant, IST), '2026-10-16');
});

test('time', 'impossible dates are rejected, not stored', () => {
  const old = toSafePunchInstant('2019-05-01 09:00:00', { timeZone: IST });
  assert.equal(old.ok, false);
  assert.equal(old.rejection, 'IMPOSSIBLE_DATE');

  const future = toSafePunchInstant('2031-01-01 09:00:00', { timeZone: IST, now: new Date('2026-10-16T00:00:00Z') });
  assert.equal(future.ok, false);
  assert.equal(future.rejection, 'FUTURE_DATED');

  const nonsense = toSafePunchInstant('not a date', { timeZone: IST });
  assert.equal(nonsense.ok, false);
  assert.equal(nonsense.rejection, 'UNPARSEABLE');

  const badCalendar = toSafePunchInstant('2026-02-30 10:00:00', { timeZone: IST });
  assert.equal(badCalendar.ok, false, '30 February must not be accepted');
});

test('time', 'missing and empty timestamps are reported distinctly', () => {
  assert.equal(toSafePunchInstant(null, { timeZone: IST }).rejection, 'MISSING_TIME');
  assert.equal(toSafePunchInstant('', { timeZone: IST }).rejection, 'MISSING_TIME');
});

test('time', 'tolerance allows a few minutes ahead but not hours', () => {
  // now is an absolute instant; 12:00 IST is 06:30 UTC.
  const now = new Date('2026-10-16T06:30:00.000Z');
  const near = toSafePunchInstant('2026-10-16 12:04:00', { timeZone: IST, now, futureSkewSeconds: 300 });
  const far = toSafePunchInstant('2026-10-16 14:00:00', { timeZone: IST, now, futureSkewSeconds: 300 });
  assert.equal(near.ok, true, 'four minutes ahead is inside the 300s tolerance');
  assert.equal(far.ok, false);
  assert.equal(far.rejection, 'FUTURE_DATED');
});

test('time', 'ZK packed time round-trips through encode and decode', () => {
  const wall = { year: 2026, month: 10, day: 16, hour: 9, minute: 12, second: 34, ms: 0 };
  const packed = encodeZkPackedTime(wall);
  assert.deepEqual(decodeZkPackedTime(packed), wall);
  assert.equal(encodeZkPackedTimeForInstant(wallTimeToInstant(wall, IST), IST), packed);
});

test('time', 'a device clock an hour fast is reported as positive drift', () => {
  const serverNow = new Date('2026-10-16T04:00:00.000Z'); // 09:30 IST
  const drift = clockDriftSeconds({ year: 2026, month: 10, day: 16, hour: 10, minute: 30, second: 0, ms: 0 }, IST, serverNow);
  assert.equal(drift, 3600);
});

test('time', 'a UTC DATETIME read back from MySQL yields the same instant', () => {
  const original = new Date('2026-10-16T03:42:34.000Z');
  const stored = toUtcMysqlString(original);
  // mysql2 hands DATETIME back as a Date anchored to the pool session timezone;
  // the reader must recover the digits, not the anchored instant.
  const asReturnedByPool = new Date(`${stored.replace(' ', 'T')}+05:30`);
  assert.equal(fromUtcMysqlString(asReturnedByPool)!.toISOString(), original.toISOString());
  assert.equal(fromUtcMysqlString(stored)!.toISOString(), original.toISOString());
});

// ─── B. Verification mode mapping ───────────────────────────────────────────

test('mode', 'standard ZK codes map to Face, Fingerprint, Card and Password', () => {
  const map = STANDARD_ZK_VERIFY_MODES;
  assert.equal(resolveVerifyMode(15, map).label, 'Face');
  assert.equal(resolveVerifyMode(1, map).label, 'Fingerprint');
  assert.equal(resolveVerifyMode(2, map).label, 'Card');
  assert.equal(resolveVerifyMode(0, map).label, 'Password');
});

test('mode', 'an unmapped code is Unknown and never defaults to Card or Face', () => {
  const unknown = resolveVerifyMode(99, STANDARD_ZK_VERIFY_MODES);
  assert.equal(unknown.known, false);
  assert.match(unknown.label, new RegExp(UNKNOWN_LABEL));
  assert.notEqual(unknown.methodFamily, 'CARD');
  assert.notEqual(unknown.methodFamily, 'FACE');
});

test('mode', 'a payload with no verify code stays "not reported"', () => {
  for (const value of [null, undefined, '']) {
    const resolved = resolveVerifyMode(value as any, STANDARD_ZK_VERIFY_MODES);
    assert.equal(resolved.label, NOT_REPORTED_LABEL);
    assert.equal(resolved.rawCode, null);
  }
});

test('mode', 'an edited mapping changes how the same code is read', () => {
  // The whole point of the editable table: this firmware's code 8 is whatever
  // calibration says it is.
  const custom = [{ rawCode: 8, label: 'Face', methodFamily: 'FACE' as const }];
  const resolved = resolveVerifyMode(8, custom);
  assert.equal(resolved.label, 'Face');
  assert.equal(involvesFace(resolved), true);
});

test('mode', 'combined methods are recognised as involving a face', () => {
  const map = STANDARD_ZK_VERIFY_MODES;
  assert.equal(involvesFace(resolveVerifyMode(9, map)), true, 'Face + Fingerprint involves a face');
  assert.equal(involvesFace(resolveVerifyMode(4, map)), false, 'Fingerprint + Card does not');
  assert.equal(involvesFace(resolveVerifyMode(15, map)), true);
});

test('mode', 'negative and non-numeric codes are not guessed', () => {
  assert.equal(resolveVerifyMode(-1, STANDARD_ZK_VERIFY_MODES).known, false);
  assert.equal(resolveVerifyMode('abc', STANDARD_ZK_VERIFY_MODES).known, false);
});

test('mode', 'punch state bytes map and unknown states auto-pair', () => {
  assert.equal(resolvePunchState(0).punchType, 'CHECK_IN');
  assert.equal(resolvePunchState(1).punchType, 'CHECK_OUT');
  assert.equal(resolvePunchState('2').punchType, 'BREAK_OUT');
  assert.equal(resolvePunchState(null).punchType, 'AUTO_PAIR');
  assert.equal(resolvePunchState(77).punchType, 'AUTO_PAIR');
  assert.equal(resolvePunchState(77).known, false);
});

// ─── C. Employee id mapping ─────────────────────────────────────────────────

test('identity', 'normalisation trims and strips leading zeros', () => {
  const a = normalizeDeviceUserId('  001234567 ');
  assert.equal(a.normalized, '1234567');
  assert.equal(a.lastSix, '234567');
  assert.equal(normalizeDeviceUserId('000100201').normalized, '100201');
});

test('identity', 'full id matches before the last-six fallback', () => {
  const exact = [{ employeeId: 'emp-a', matchRule: 'EXACT_FULL' as const }];
  const suffix = [{ employeeId: 'emp-b', matchRule: 'SUFFIX_LAST6' as const }];
  const result = resolveEmployeeIdentity('100201', exact, suffix);
  assert.equal(result.status, 'MAPPED');
  assert.equal(result.employeeId, 'emp-a');
  assert.equal(result.rule, 'EXACT_FULL');
});

test('identity', 'last six digits resolve when the full id is absent', () => {
  const suffix = [{ employeeId: 'emp-c', matchRule: 'SUFFIX_LAST6' as const }];
  const result = resolveEmployeeIdentity('990100201', [], suffix);
  assert.equal(result.status, 'MAPPED');
  assert.equal(result.employeeId, 'emp-c');
  assert.equal(result.rule, 'SUFFIX_LAST6');
});

test('identity', 'two employees sharing the last six digits is AMBIGUOUS, not a coin toss', () => {
  const suffix = [
    { employeeId: 'emp-c', matchRule: 'SUFFIX_LAST6' as const },
    { employeeId: 'emp-d', matchRule: 'SUFFIX_LAST6' as const },
  ];
  const result = resolveEmployeeIdentity('2100201', [], suffix);
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.employeeId, null);
  assert.equal(result.candidates.length, 2);
  assert.match(result.reason!, /last six digits/);
});

test('identity', 'the same employee listed twice is not an ambiguity', () => {
  const dup = [
    { employeeId: 'emp-a', matchRule: 'EXACT_FULL' as const },
    { employeeId: 'emp-a', matchRule: 'EXACT_FULL' as const },
  ];
  const result = resolveEmployeeIdentity('100201', dup, []);
  assert.equal(result.status, 'MAPPED');
});

test('identity', 'no match is UNMAPPED so the record can be reviewed', () => {
  const result = resolveEmployeeIdentity('777777', [], []);
  assert.equal(result.status, 'UNMAPPED');
  assert.equal(result.employeeId, null);
});

test('identity', 'an empty id is unmapped rather than matching everyone', () => {
  const result = resolveEmployeeIdentity('   ', [{ employeeId: 'emp-a', matchRule: 'EXACT_FULL' as const }], []);
  assert.equal(result.status, 'UNMAPPED');
});

test('identity', 'mapping keys stay consistent with punch-time normalisation', () => {
  const keys = deriveMappingKeys('00100201');
  assert.equal(keys.normalizedEnrollment, '100201');
  assert.equal(keys.lastSixDigits, '100201'.slice(-6));
  assert.equal(keys.lastSixDigits, normalizeDeviceUserId('00100201').lastSix);
});

// ─── D. Wire format parsers ─────────────────────────────────────────────────

function encodeSimAttRecord(pin: string, wall: { year: number; month: number; day: number; hour: number; minute: number; second: number }, verify: number, state: number, workCode = 0): Buffer {
  const record = Buffer.alloc(40);
  record.writeUInt16LE(40, 0);
  record.write(pin, 2, 'utf8');
  record.writeUInt8(verify, 26);
  record.writeUInt32LE(encodeZkPackedTime({ ...wall, ms: 0 }), 27);
  record.writeUInt8(state, 31);
  record.writeUInt32LE(workCode, 32);
  return record;
}

test('protocol', 'checksum and packet framing are stable', () => {
  const packet = createZkPacket(1000, 0, 0);
  assert.equal(packet.length, 8);
  assert.equal(packet.readUInt16LE(0), 1000);
  assert.equal(packet.readUInt16LE(2), calculateZkChecksum(packet.subarray(0, 6).length === 6 ? Buffer.concat([packet.subarray(0, 2), Buffer.alloc(2), packet.subarray(4)]) : packet));
  const framed = wrapTcpZkPacket(packet);
  assert.equal(framed.readUInt16BE(0), 0x5050);
  assert.equal(framed.readUInt32LE(4), 8);
  assert.equal(framed.length, 16);
});

test('protocol', 'comm key is deterministic and key-sensitive', () => {
  assert.deepEqual(makeCommKey(0, 5), makeCommKey(0, 5));
  assert.notDeepEqual(makeCommKey(1, 5), makeCommKey(0, 5), 'a different comm key must produce a different key block');
  assert.notDeepEqual(makeCommKey(0, 5, 40), makeCommKey(0, 5, 50), 'the tick byte is part of the block');
  // The reference MakeKey overwrites byte 3 with the tick value, so two
  // session ids that differ only in the byte it replaces collide. Real
  // terminals behave the same way, which is why authentication compares the
  // whole 4-byte block rather than treating the session id as a secret.
  assert.equal(makeCommKey(0, 5).length, 4);
});

test('protocol', 'a streamed ATTLOG buffer decodes every record', () => {
  const wall = { year: 2026, month: 10, day: 16, hour: 9, minute: 12, second: 34 };
  const buf = Buffer.concat([
    encodeSimAttRecord('100201', wall, 15, 0),
    encodeSimAttRecord('100202', { ...wall, minute: 15 }, 1, 1),
    encodeSimAttRecord('00100203', { ...wall, minute: 20 }, 2, 0, 7),
  ]);
  const records = parseZkAttLogBuffer(buf);
  assert.equal(records.length, 3);
  assert.equal(records[0].enrollmentNumber, '100201');
  assert.deepEqual(records[0].wall, { ...wall, ms: 0 });
  assert.equal(records[0].verifyMode, 15);
  assert.equal(records[1].verifyMode, 1);
  assert.equal(records[1].punchState, 1);
  assert.equal(records[2].workCode, 7);
});

test('protocol', 'a garbage stream produces no records instead of fake ones', () => {
  assert.deepEqual(parseZkAttLogBuffer(Buffer.alloc(120, 0xff)), []);
  const oldDeviceClock = encodeSimAttRecord('100201', { year: 2001, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, 15, 0);
  assert.equal(parseZkAttLogBuffer(oldDeviceClock).length, 0, 'a 2001 clock is not attendance');
});

test('protocol', 'USERINFO records decode with name and privilege', () => {
  const record = Buffer.alloc(292);
  record.writeUInt16LE(292, 0);
  record.write('100201', 2, 'utf8');
  record.writeUInt8(14, 11);
  record.write('Rajesh Kumar', 20, 'utf8');
  const users = parseZkUserBuffer(record);
  assert.equal(users.length, 1);
  assert.equal(users[0].enrollmentNumber, '100201');
  assert.equal(users[0].name, 'Rajesh Kumar');
  assert.equal(users[0].privilege, 14);
});

// ─── E. Export ───────────────────────────────────────────────────────────────

test('export', 'CSV escapes quotes, commas and newlines', () => {
  const row: ReportRow = {
    id: 'x', employeeCode: '100201', employeeName: 'O"Brien, Raj\nKumar', enrollmentNumber: '100201',
    deviceName: 'MB160', serialNumber: 'S', locationCode: 'BEL', punchTimeUtc: '2026-10-16T03:42:34.000Z',
    punchTimeLocal: '2026-10-16 09:12:34', attendanceDate: '2026-10-16', timezone: IST,
    punchType: 'CHECK_IN', verifyMethod: 'Face', rawVerifyType: 15, rawPunchState: 0, matchValue: 82,
    workCode: null, photoUrl: null, photoMissingReason: 'No photo available from device',
    mappingStatus: 'MAPPED', source: 'ADMS_PUSH', syncStatus: 'PROCESSED',
  };
  const csv = toCsv([row]);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2, 'header plus one row');
  assert.match(lines[1], /"O""Brien, Raj\nKumar"/, 'embedded quote, comma and newline must be escaped');
});

// ─── F. Database integration ────────────────────────────────────────────────

const unitOnly = process.env.BIOMETRIC_TEST_UNIT_ONLY === '1';

{
  const SIM_SERIAL = `SIMTEST${UNIQUE.toUpperCase()}`;
  let locationId: string | null = null;

  const cleanup = async () => {
    await pool.query('DELETE FROM biometric_raw_punches WHERE serialNumber = ?', [SIM_SERIAL]);
    await pool.query('DELETE FROM attendance WHERE employeeId LIKE ? AND attendanceDate >= ?', ['emp-demo-%', '2026-10-10']);
    await pool.query('DELETE FROM biometric_employee_mappings WHERE id LIKE ?', [`map-test-${UNIQUE}-%`]);
    await pool.query('DELETE FROM biometric_rejected_punches WHERE serialNumber = ?', [SIM_SERIAL]);
    await pool.query('DELETE FROM biometric_devices WHERE serialNumber = ?', [SIM_SERIAL]);
  };

  test('db', 'setup: test device and a clean employee', async () => {
    const [locs]: any = await pool.query("SELECT id FROM location WHERE code = 'BEL' LIMIT 1");
    locationId = locs[0]?.id ?? null;
    await pool.query(
      `INSERT INTO biometric_devices (id, serialNumber, name, model, ipAddress, port, locationCode, locationId,
                                      status, protocol, isActive, timezone, heartbeatTimeoutSeconds, commKey)
       VALUES (?, ?, 'Biometric test terminal', 'eSSL MB160', '127.0.0.1', 4370, 'BEL', ?,
               'DISCONNECTED', 'ADMS_PUSH', 1, 'Asia/Kolkata', 15, 0)`,
      [`dev-test-${UNIQUE}`, SIM_SERIAL, locationId]
    );
    const rows = await pool.query('SELECT id FROM biometric_devices WHERE serialNumber = ?', [SIM_SERIAL]);
    assert.equal((rows[0] as any)[0].id, `dev-test-${UNIQUE}`);
  });

  test('db', 'a face punch is stored once with the right UTC instant and label', async () => {
    const result = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100201', punchTime: '2026-10-16 09:12:34', verifyMode: 15, punchState: 0, source: 'ADMS_PUSH' },
    ]);
    assert.equal(result.inserted, 1, JSON.stringify(result.details));
    assert.equal(result.processed, 1);

    const [rows]: any = await pool.query(
      `SELECT punchTime, punchTimeUtc, rawDeviceTimeString, rawTimezone, verifyModeLabel, rawVerifyType, employeeId
         FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = '100201'`,
      [SIM_SERIAL]
    );
    assert.equal(rows.length, 1);
    const storedInstant = fromUtcMysqlString(rows[0].punchTimeUtc);
    assert.ok(storedInstant, 'punchTimeUtc must parse back to an instant');
    assert.equal(storedInstant.toISOString(), '2026-10-16T03:42:34.000Z');
    assert.equal(rows[0].verifyModeLabel, 'Face');
    assert.equal(rows[0].rawVerifyType, 15);
    assert.equal(rows[0].rawTimezone, 'Asia/Kolkata');
    assert.equal(rows[0].employeeId, 'emp-demo-100201', 'device id 100201 maps to the demo employee');
  });

  test('db', 're-sending the identical punch creates no second row', async () => {
    const payload = [{ serialNumber: SIM_SERIAL, enrollmentNumber: '100201', punchTime: '2026-10-16 09:12:34', verifyMode: 15, punchState: 0 }];
    const again = await ingestPunches(payload);
    assert.equal(again.inserted, 0);
    assert.equal(again.duplicates, 1);
    const [rows]: any = await pool.query(
      'SELECT COUNT(*) AS n FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = ?',
      [SIM_SERIAL, '100201']
    );
    assert.equal(Number(rows[0].n), 1, 'still exactly one row after a replay');
  });

  test('db', 'concurrent replays are still stored once (unique key, not read-then-write)', async () => {
    const payload = [{ serialNumber: SIM_SERIAL, enrollmentNumber: '100202', punchTime: '2026-10-16 09:30:00', verifyMode: 1, punchState: 0 }];
    const settled = await Promise.allSettled([ingestPunches(payload), ingestPunches(payload), ingestPunches(payload)]);
    const fulfilled = settled.filter((s) => s.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    assert.equal(fulfilled.length, 3, 'no rejection may escape');
    const insertedTotal = fulfilled.reduce((sum, s) => sum + s.value.inserted, 0);
    assert.equal(insertedTotal, 1, 'exactly one of the three may claim the row');

    const [rows]: any = await pool.query(
      'SELECT COUNT(*) AS n FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = ?',
      [SIM_SERIAL, '100202']
    );
    assert.equal(Number(rows[0].n), 1);
  });

  test('db', 'an unknown verify code is Unknown, not Card', async () => {
    const result = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100203', punchTime: '2026-10-16 10:00:00', verifyMode: 211, punchState: 0 },
    ]);
    assert.equal(result.processed, 1);
    const [rows]: any = await pool.query(
      'SELECT verifyModeLabel, rawVerifyType FROM biometric_raw_punches WHERE enrollmentNumber = ? AND serialNumber = ?',
      ['100203', SIM_SERIAL]
    );
    assert.match(rows[0].verifyModeLabel, /^Unknown/);
    assert.notEqual(rows[0].verifyModeLabel, 'Card');
    assert.equal(rows[0].rawVerifyType, 211, 'the raw code is still kept for calibration');
  });

  test('db', 'punches before 05:30 IST stay on their own date in attendance', async () => {
    await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100206', punchTime: '2026-10-16 04:55:00', verifyMode: 15, punchState: 0 },
    ]);
    // DATE_FORMAT because mysql2 returns a DATE as a Date at local midnight, and
    // `String()` of that is not a comparable value.
    const [rows]: any = await pool.query(
      `SELECT DATE_FORMAT(attendanceDate, '%Y-%m-%d') AS d, actualLogin
         FROM attendance
        WHERE employeeId = 'emp-demo-100206' AND attendanceDate = '2026-10-16' LIMIT 1`
    );
    assert.equal(rows.length, 1, 'a row must exist for the device day, not the UTC day');
    assert.equal(rows[0].d, '2026-10-16', 'must not be filed under the UTC day (2026-10-15)');
  });

  test('db', 'an unregistered device id is kept as UNMAPPED, never dropped', async () => {
    const result = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '888888', punchTime: '2026-10-16 11:00:00', verifyMode: 15, punchState: 0 },
    ]);
    assert.equal(result.unmapped, 1);
    assert.equal(result.inserted, 1, 'the row must still be stored');

    const [rows]: any = await pool.query(
      "SELECT mappingStatus, employeeId, syncStatus FROM biometric_raw_punches WHERE enrollmentNumber = '888888' AND serialNumber = ?",
      [SIM_SERIAL]
    );
    assert.equal(rows[0].mappingStatus, 'UNMAPPED');
    assert.equal(rows[0].employeeId, null);
    assert.equal(rows[0].syncStatus, 'UNMAPPED');
  });

  test('db', 'two employees sharing the last six digits are AMBIGUOUS and neither is guessed', async () => {
    const first = `map-test-${UNIQUE}-a`;
    const second = `map-test-${UNIQUE}-b`;
    // Clear the enrollments first: a previous run generated a different id for
    // the same (enrollmentNumber, showroomCode) unique key.
    await pool.query(
      'DELETE FROM biometric_employee_mappings WHERE enrollmentNumber IN (?, ?)',
      ['600900201', '601900201']
    );
    // Neither enrollment equals the punched id, so the exact rule cannot resolve
    // it, and both end in 900201 so the suffix rule matches two people.
    await pool.query(
      `INSERT INTO biometric_employee_mappings
         (id, employeeId, enrollmentNumber, normalizedEnrollment, lastSixDigits, showroomCode, status, effectiveDate, mappingSource, conflictCount, updatedAt)
       VALUES (?, 'emp-demo-100201', '600900201', '600900201', '900201', 'BEL', 'ACTIVE', CURDATE(), 'MANUAL', 2, NOW()),
              (?, 'emp-demo-100202', '601900201', '601900201', '900201', 'BEL', 'ACTIVE', CURDATE(), 'MANUAL', 2, NOW())`,
      [first, second]
    );

    const result = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '602900201', punchTime: '2026-10-16 12:00:00', verifyMode: 15, punchState: 0 },
    ]);
    assert.equal(result.ambiguous, 1, JSON.stringify(result.details));
    assert.equal(result.processed, 0, 'an ambiguous punch must not be booked to anyone');

    const [rows]: any = await pool.query(
      "SELECT mappingStatus, employeeId, mappingCandidates FROM biometric_raw_punches WHERE enrollmentNumber = '602900201' AND serialNumber = ?",
      [SIM_SERIAL]
    );
    assert.equal(rows[0].mappingStatus, 'AMBIGUOUS');
    assert.equal(rows[0].employeeId, null);
    const candidates = parseCandidateIds(rows[0].mappingCandidates);
    assert.equal(candidates.length, 2, 'both candidates must be listed for the reviewer');

    await pool.query('DELETE FROM biometric_employee_mappings WHERE id IN (?, ?)', [first, second]);
    await pool.query('DELETE FROM biometric_raw_punches WHERE enrollmentNumber = ? AND serialNumber = ?', ['602900201', SIM_SERIAL]);
  });

  test('db', 'an impossible date is rejected and recorded with its reason', async () => {
    const result = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100201', punchTime: '2001-01-01 00:00:00', verifyMode: 15 },
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100201', punchTime: 'gibberish', verifyMode: 15 },
    ]);
    assert.equal(result.rejected, 2);
    assert.equal(result.inserted, 0);

    const [rows]: any = await pool.query(
      'SELECT reason FROM biometric_rejected_punches WHERE serialNumber = ? ORDER BY receivedAt DESC LIMIT 2',
      [SIM_SERIAL]
    );
    assert.equal(rows.length, 2);
    const reasons = rows.map((r: any) => r.reason);
    assert.ok(reasons.includes('IMPOSSIBLE_DATE'), `expected IMPOSSIBLE_DATE in ${reasons}`);
    assert.ok(reasons.includes('UNPARSEABLE'), `expected UNPARSEABLE in ${reasons}`);
  });

  test('db', 'a photo arriving after its punch is merged onto the existing row', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x08, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]).toString('base64');
    const punch = { serialNumber: SIM_SERIAL, enrollmentNumber: '100204', punchTime: '2026-10-16 13:00:00', verifyMode: 15, punchState: 0 };
    await ingestPunches([punch]);

    const photoOnly = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100204', punchTime: '2026-10-16 13:00:00', photoBase64: jpeg },
    ]);
    assert.equal(photoOnly.duplicates, 1, 'the photo must be recognised as the same punch');
    assert.equal(photoOnly.inserted, 0, 'and must not create a second punch');

    const [rows]: any = await pool.query(
      "SELECT photoPath, verifyModeLabel, rawVerifyType FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = '100204'",
      [SIM_SERIAL]
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].photoPath, `photoPath should be set, got ${rows[0].photoPath}`);
    assert.match(rows[0].photoPath, /^uploads\/attendance\/\d{4}\/\d{2}\//, 'stored under the YYYY/MM partition');
    assert.equal(rows[0].verifyModeLabel, 'Face', 'the merge must not erase the verify label');
    assert.equal(rows[0].rawVerifyType, 15);
  });

  test('db', 'a non-image payload is refused rather than stored as a photo', async () => {
    const bogus = Buffer.from('<?php system($_GET["c"]); ?>', 'utf8').toString('base64');
    const result = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100205', punchTime: '2026-10-16 14:00:00', verifyMode: 1, punchState: 0, photoBase64: bogus },
    ]);
    assert.equal(result.photosStored, 0);
    const [rows]: any = await pool.query(
      "SELECT photoPath FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = '100205'",
      [SIM_SERIAL]
    );
    assert.equal(rows[0].photoPath, null);
  });

  test('db', 'mapping created afterwards attributes the held punch on replay', async () => {
    // Unique per run, because a mapping created by an earlier run of this suite
    // would make the punch resolve immediately and prove nothing.
    const heldId = `9${UNIQUE}`;
    const mappingId = `map-BEL-${heldId}`;
    await pool.query('DELETE FROM biometric_employee_mappings WHERE id = ?', [mappingId]);

    await ingestPunches([{ serialNumber: SIM_SERIAL, enrollmentNumber: heldId, punchTime: '2026-10-16 15:00:00', verifyMode: 15, punchState: 0 }]);
    const [before]: any = await pool.query(
      "SELECT mappingStatus, employeeId FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = ?",
      [SIM_SERIAL, heldId]
    );
    assert.equal(before[0].mappingStatus, 'UNMAPPED');

    await saveEmployeeBiometricMapping({
      employeeId: 'emp-demo-100201',
      enrollmentNumber: heldId,
      showroomCode: 'BEL',
      serialNumber: SIM_SERIAL,
      notes: 'test mapping',
    });

    const replay = await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: heldId, punchTime: '2026-10-16 15:00:00', verifyMode: 15, punchState: 0 },
    ]);
    assert.equal(replay.mappedOnReplay, 1, JSON.stringify(replay.details));

    const [after]: any = await pool.query(
      "SELECT mappingStatus, employeeId, attendanceId FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = ?",
      [SIM_SERIAL, heldId]
    );
    assert.equal(after[0].mappingStatus, 'MAPPED');
    assert.equal(after[0].employeeId, 'emp-demo-100201');
    assert.ok(after[0].attendanceId, 'attendance projection must have run for the newly mapped punch');

    await pool.query('DELETE FROM biometric_employee_mappings WHERE id = ?', [mappingId]);
  });

  test('db', 'editing the verify mapping changes how a new punch is labelled', async () => {
    await upsertVerifyModeMapping({ rawCode: 201, label: 'Face', methodFamily: 'FACE', notes: 'test' });
    const listed = await listVerifyModeMapping();
    assert.ok(listed.some((m) => m.rawCode === 201 && m.label === 'Face'));

    await ingestPunches([{ serialNumber: SIM_SERIAL, enrollmentNumber: '100202', punchTime: '2026-10-16 16:00:00', verifyMode: 201, punchState: 0 }]);
    const [rows]: any = await pool.query(
      "SELECT verifyModeLabel FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = '100202' AND rawVerifyType = 201",
      [SIM_SERIAL]
    );
    assert.equal(rows[0].verifyModeLabel, 'Face');
    await deleteVerifyModeMapping(201);
  });

  test('db', 'connectivity follows the heartbeat window, not a wish', async () => {
    // Age every proof of contact past the 15s budget: this is exactly what
    // happens when a terminal is unplugged, and the badge must follow.
    await pool.query(
      `UPDATE biometric_devices
          SET lastHeartbeatAt = DATE_SUB(NOW(), INTERVAL 40 SECOND),
              lastSeenAt = DATE_SUB(NOW(), INTERVAL 40 SECOND),
              lastSyncAt = DATE_SUB(NOW(), INTERVAL 40 SECOND),
              lastConnectionAt = DATE_SUB(NOW(), INTERVAL 40 SECOND)
        WHERE serialNumber = ?`,
      [SIM_SERIAL]
    );
    const stale = await getDeviceStatusSnapshot(SIM_SERIAL);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].connected, false, 'a 40-second-old heartbeat must read as disconnected');
    assert.equal(stale[0].status, 'DISCONNECTED');
    assert.ok(stale[0].secondsSinceLastSeen! > 15);

    await recordDeviceHeartbeat(SIM_SERIAL, '127.0.0.1');
    const fresh = await getDeviceStatusSnapshot(SIM_SERIAL);
    assert.equal(fresh[0].connected, true, 'a fresh heartbeat must flip it back to connected');
    assert.equal(fresh[0].status, 'CONNECTED');
    assert.ok((fresh[0].secondsSinceLastSeen ?? 99) <= 2, 'and report how recently it was heard from');
  });

  test('db', 'health reports the biometric subsystem', async () => {
    const health = await readBiometricHealth();
    assert.equal(typeof health.ok, 'boolean');
    assert.ok(health.devices.total >= 1);
    assert.ok(Array.isArray(health.reasons));
  });

  test('db', 'two employees punching on the same day get two separate attendance rows', async () => {
    // Regression guard: deriving the row id from a prefix of the employee id
    // made every "emp-demo-…" employee share one primary key, so the second
    // employee's punch overwrote the first one's row.
    // 2026-10-15, not a future date: tomorrow's punches are correctly rejected
    // as FUTURE_DATED before they can reach attendance.
    await ingestPunches([
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100201', punchTime: '2026-10-15 09:00:00', verifyMode: 15, punchState: 0 },
      { serialNumber: SIM_SERIAL, enrollmentNumber: '100202', punchTime: '2026-10-15 09:00:00', verifyMode: 1, punchState: 0 },
    ]);
    const [rows]: any = await pool.query(
      `SELECT employeeId, id FROM attendance
        WHERE employeeId IN ('emp-demo-100201','emp-demo-100202') AND attendanceDate = '2026-10-15'`
    );
    assert.equal(rows.length, 2, `expected one row per employee, got ${JSON.stringify(rows)}`);
    assert.notEqual(rows[0].id, rows[1].id, 'the two rows must not share a primary key');

    // Remove exactly the two rows this test created, identified by the same
    // deterministic id the engine uses, so nothing pre-existing is touched.
    for (const employeeId of ['emp-demo-100201', 'emp-demo-100202']) {
      await pool.query('DELETE FROM attendance WHERE id = ?', [attendanceRowId(employeeId, '2026-10-15')]);
    }
    await pool.query('DELETE FROM biometric_raw_punches WHERE punchTimeUtc >= ? AND punchTimeUtc < ? AND serialNumber = ?', [
      '2026-10-15 00:00:00', '2026-10-15 23:59:59', SIM_SERIAL,
    ]);
  });

  test('db', 'teardown removes only test rows', cleanup);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function databaseReachable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'biometric_raw_punches'`
    );
    return Number(rows[0]?.n || 0) > 0;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const withDatabase = !unitOnly && (await databaseReachable());
  console.log('================================================================');
  console.log('🧪 BIOMETRIC CORRECTNESS SUITE');
  console.log(`   ${withDatabase ? 'unit + database integration' : unitOnly ? 'unit only (BIOMETRIC_TEST_UNIT_ONLY=1)' : 'unit only — no database reachable'}`);
  console.log('================================================================\n');

  let passed = 0;
  let skipped = 0;
  const failures: Array<{ group: string; name: string; error: string }> = [];
  let currentGroup = '';

  for (const testCase of cases) {
    if (!withDatabase && testCase.group === 'db') {
      skipped++;
      continue;
    }
    if (testCase.group !== currentGroup) {
      currentGroup = testCase.group;
      console.log(`\n▶ ${currentGroup}`);
    }
    const started = Date.now();
    try {
      await testCase.run();
      passed++;
      console.log(`  ✔ ${testCase.name} (${Date.now() - started}ms)`);
    } catch (err: any) {
      failures.push({ group: testCase.group, name: testCase.name, error: err?.message || String(err) });
      console.log(`  ✖ ${testCase.name}`);
      console.log(`      ${err?.message || err}`);
    }
  }

  await pool.end().catch(() => undefined);

  console.log('\n----------------------------------------------------------------');
  console.log(`Total: ${cases.length}   Passed: ${passed}   Failed: ${failures.length}   Skipped: ${skipped}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  · [${failure.group}] ${failure.name}\n    ${failure.error}`);
    console.log('----------------------------------------------------------------');
    process.exit(1);
  }
  console.log('🎉 All biometric correctness tests passed.');
  console.log('----------------------------------------------------------------');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
