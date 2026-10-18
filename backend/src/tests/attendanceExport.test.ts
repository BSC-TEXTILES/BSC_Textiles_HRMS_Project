/**
 * Attendance workbook test suite.
 *
 * Covers the parts of the Excel Download feature that can only be proven by
 * opening the generated file: does it stream a real .xlsx, do the punch times,
 * counts and verification labels come from the device ledger rather than a
 * default, are weekly off / holiday / absent kept distinct, is untrusted text
 * neutralised, and do the month and year sheets agree with the day rows.
 *
 * Fixtures are created under `exp-test-%` ids on dates with no production data
 * and removed again by the same suite — nothing here rewrites real attendance.
 *
 *   npm run test:export
 */
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { Writable } from 'stream';
import ExcelJS from 'exceljs';
import { pool } from '../nativeDb.js';
import {
  streamAnnualWorkbook,
  streamMonthlyWorkbook,
  type AttendanceExportScope,
} from '../services/attendance/attendanceWorkbook.js';

type Case = { name: string; run: () => Promise<void> };
const cases: Case[] = [];
const test = (name: string, run: () => Promise<void>) => cases.push({ name, run });

const EMP_A = 'exp-test-emp-a';
const EMP_B = 'exp-test-emp-b';
const ATT_1 = 'exp-test-att-1';
const ATT_2 = 'exp-test-att-2';
const ATT_3 = 'exp-test-att-3';
const PUNCH_IDS = ['exp-test-p-1', 'exp-test-p-2', 'exp-test-p-3', 'exp-test-p-4', 'exp-test-p-5'];
/** A month with no production attendance: 10 May 2025 was a Saturday. */
const DAY_WITH_PUNCHES = '2025-05-10';
const DAY_ABSENT_SATURDAY = '2025-05-17';
const DAY_NO_RECORD = '2025-05-24';
const NEXT_MONTH_DAY = '2025-06-07';

async function databaseReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function fakeRes() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const stream: any = new Writable({
    write(chunk: any, _enc: any, cb: any) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  stream.headersSent = false;
  stream.setHeader = (name: string, value: string) => {
    headers[name.toLowerCase()] = String(value);
    return stream;
  };
  stream.getHeader = (name: string) => headers[name.toLowerCase()];
  stream.destroy = () => stream;
  stream._result = () => ({ headers, buffer: Buffer.concat(chunks) });
  return stream;
}

async function exportMonthly(scope: AttendanceExportScope) {
  const res = fakeRes();
  const rows = await streamMonthlyWorkbook(res, scope);
  const { headers, buffer } = res._result();
  const file = path.join(os.tmpdir(), `exp-test-monthly-${Date.now()}.xlsx`);
  await fs.writeFile(file, buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  await fs.unlink(file).catch(() => undefined);
  return { rows, headers, workbook, bytes: buffer.length };
}

async function exportAnnual(scope: AttendanceExportScope) {
  const res = fakeRes();
  const rows = await streamAnnualWorkbook(res, scope);
  const { headers, buffer } = res._result();
  const file = path.join(os.tmpdir(), `exp-test-annual-${Date.now()}.xlsx`);
  await fs.writeFile(file, buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  await fs.unlink(file).catch(() => undefined);
  return { rows, headers, workbook, bytes: buffer.length };
}

function asText(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Column index (1-based) of a header on the sheet's header row. */
function columnIndex(sheet: ExcelJS.Worksheet, header: string): number {
  const headerRow = sheet.getRow(8) as any;
  const values = (headerRow.values as any[]) || [];
  const index = values.findIndex((v: any) => asText(v).trim() === header);
  assert.notEqual(index, -1, `column "${header}" is missing from the sheet header row`);
  return index; // values is 1-based, so this is already the 1-based column number
}

function cellOf(sheet: ExcelJS.Worksheet, rowNumber: number, header: string): string {
  const value = sheet.getRow(rowNumber).getCell(columnIndex(sheet, header)).value;
  if (value instanceof Date) {
    // Excel shows the serial date in local parts, so the assertion must read it
    // the same way instead of shifting it back to UTC.
    return [String(value.getFullYear()), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  }
  return asText(value);
}

async function setup() {
  const [locations]: any = await pool.query('SELECT id, code FROM location ORDER BY code LIMIT 2');
  if (locations.length < 2) throw new Error('This suite needs at least two stores in the database');
  const bel = locations.find((l: any) => l.code === 'BEL') || locations[0];
  const other = locations.find((l: any) => l.id !== bel.id) || locations[1];

  await pool.query(
    `INSERT INTO employee (id, employeeCode, firstName, lastName, fullName, email, phone, gender,
                           locationId, designation, role, status, joiningDate, createdAt, updatedAt)
     VALUES (?, '9955001', 'Export', 'Alpha', 'Export Alpha', 'exp-a@test.invalid', '+91 9000000001', 'male',
             ?, 'Sales Associate', 'SALES_EMPLOYEE', 'ACTIVE', '2024-01-01', NOW(), NOW())
     ON DUPLICATE KEY UPDATE locationId = VALUES(locationId), designation = VALUES(designation), status = 'ACTIVE'`,
    [EMP_A, bel.id]
  );
  // An untrusted designation is the injection vector: it is free text on the
  // employee master and it is written into every sheet.
  await pool.query(
    `INSERT INTO employee (id, employeeCode, firstName, lastName, fullName, email, phone, gender,
                           locationId, designation, role, status, joiningDate, createdAt, updatedAt)
     VALUES (?, '9955002', 'Export', 'Beta', 'Export Beta', 'exp-b@test.invalid', '+91 9000000002', 'female',
             ?, '=HYPERLINK("http://test.invalid","pwned")', 'SALES_EMPLOYEE', 'ACTIVE', '2024-01-01', NOW(), NOW())
     ON DUPLICATE KEY UPDATE locationId = VALUES(locationId), designation = VALUES(designation), status = 'ACTIVE'`,
    [EMP_B, other.id]
  );

  const attendanceRows = [
    {
      id: ATT_1,
      employeeId: EMP_A,
      locationId: bel.id,
      date: DAY_WITH_PUNCHES,
      status: 'PRESENT',
      login: '2025-05-10 09:30:00.000',
      logout: '2025-05-10 18:30:00.000',
      total: 32400,
      late: 0,
      incentive: 0,
      penalty: 0,
    },
    {
      id: ATT_2,
      employeeId: EMP_A,
      locationId: bel.id,
      date: DAY_ABSENT_SATURDAY,
      status: 'ABSENT',
      login: null,
      logout: null,
      total: 0,
      late: 0,
      incentive: 0,
      penalty: 0,
    },
    {
      id: ATT_3,
      employeeId: EMP_B,
      locationId: other.id,
      date: NEXT_MONTH_DAY,
      status: 'LATE',
      login: '2025-06-07 10:05:00.000',
      logout: '2025-06-07 18:30:00.000',
      total: 30300,
      late: 300,
      incentive: 0,
      penalty: 5,
    },
  ];
  for (const row of attendanceRows) {
    await pool.query(
      `INSERT INTO attendance (id, employeeId, locationId, attendanceDate, actualLogin, actualLogout,
                               totalWorkingSeconds, effectiveWorkingSeconds, lateLoginSeconds,
                               status, faceVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE actualLogin = VALUES(actualLogin), status = VALUES(status)`,
      [row.id, row.employeeId, row.locationId, row.date, row.login, row.logout, row.total, row.total, row.late, row.status]
    );
  }

  const punches = [
    { id: PUNCH_IDS[0], utc: '2025-05-10 04:00:00', type: 'CHECK_IN', label: 'Face', employee: EMP_A, code: '9001' },
    { id: PUNCH_IDS[1], utc: '2025-05-10 07:30:00', type: 'MIDDLE', label: 'Face', employee: EMP_A, code: '9001' },
    { id: PUNCH_IDS[2], utc: '2025-05-10 13:00:00', type: 'CHECK_OUT', label: 'Face', employee: EMP_A, code: '9001' },
    // A terminal that sent no verify code must not be reported as Face.
    { id: PUNCH_IDS[3], utc: '2025-05-11 04:15:00', type: 'CHECK_IN', label: 'Not reported by device', employee: EMP_A, code: '9001' },
    // Belongs to the second employee, in the other store.
    { id: PUNCH_IDS[4], utc: '2025-06-07 04:35:00', type: 'CHECK_IN', label: 'Card', employee: EMP_B, code: '9002' },
  ];
  for (const punch of punches) {
    await pool.query(
      `INSERT INTO biometric_raw_punches
         (id, employeeId, serialNumber, enrollmentNumber, normalizedId, punchTime, punchTimeUtc, rawTimezone,
          punchType, verifyModeLabel, receivedAt, syncStatus, isProcessed, mappingStatus, dedupHash, source)
       VALUES (?, ?, 'EXP-TEST-SERIAL', ?, ?, ?, ?, 'Asia/Kolkata', ?, ?, NOW(), 'PROCESSED', 1, 'MAPPED', ?, 'CONNECTOR')
       ON DUPLICATE KEY UPDATE verifyModeLabel = VALUES(verifyModeLabel), punchTimeUtc = VALUES(punchTimeUtc)`,
      [punch.id, punch.employee, punch.code, punch.code, punch.utc, punch.utc, punch.type, punch.label, `exp-${punch.id}`]
    );
  }
}

async function cleanup() {
  await pool.query('DELETE FROM biometric_raw_punches WHERE id IN (?)', [PUNCH_IDS]).catch(() => undefined);
  for (const id of PUNCH_IDS) {
    await pool.query('DELETE FROM biometric_raw_punches WHERE id = ?', [id]).catch(() => undefined);
  }
  await pool.query('DELETE FROM attendance WHERE id LIKE ?', ['exp-test-%']).catch(() => undefined);
  await pool.query('DELETE FROM employee WHERE id LIKE ?', ['exp-test-%']).catch(() => undefined);
}

const MONTH_SCOPE: AttendanceExportScope = { from: '2025-05-01', to: '2025-05-31' };

test('the download really is an xlsx with the documented sheet layout', async () => {
  const { workbook, bytes, headers } = await exportMonthly(MONTH_SCOPE);
  assert.ok(bytes > 2000, 'the file must be a real workbook, not an empty stream');
  assert.match(String(headers['content-type']), /spreadsheetml/);
  assert.match(String(headers['content-disposition']), /^attachment; filename="attendance-monthly-2025-05-01-to-2025-05-31\.xlsx"$/);
  const names = workbook.worksheets.map((s) => s.name);
  assert.deepEqual(names, ['Daily Attendance', 'Monthly Summary']);
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  assert.equal(sheet.columnCount, 24);
  for (const header of ['Employee ID', 'First Punch', 'Last Punch', 'Punch Count', 'Attendance Status', 'Verification Method (device-reported)', 'Source Terminal(s)']) {
    assert.ok(columnIndex(sheet, header) > 0, `${header} must be a column`);
  }
  const view: any = (sheet.views || [])[0];
  assert.equal(view.state, 'frozen', 'headers must stay visible when the sheet scrolls');
  assert.equal(view.ySplit, 8);
  assert.match(String((sheet as any).autoFilter), /^A8:X8$/, 'the filter must span exactly the header row');
});

test('first punch, last punch and punch count come from the device ledger', async () => {
  const { workbook } = await exportMonthly(MONTH_SCOPE);
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  const rows = sheetRowCountWith(sheet, '9955001');
  assert.ok(rows.length >= 1, 'the fixture employee must appear');
  const punchDay = rows.find((row) => cellOf(sheet, row, 'Date').startsWith('2025-05-10'))!;
  assert.ok(punchDay, 'the day with three punches must be exported');
  assert.equal(cellOf(sheet, punchDay, 'Punch Count'), '3');
  assert.equal(cellOf(sheet, punchDay, 'First Punch'), '09:30:00');
  assert.equal(cellOf(sheet, punchDay, 'Last Punch'), '18:30:00');
  assert.equal(cellOf(sheet, punchDay, 'Total Working (hrs)'), '9');
  assert.equal(cellOf(sheet, punchDay, 'Attendance Status'), 'PRESENT');
});

test('punch times are the store-timezone wall clock, not the server timezone', async () => {
  const { workbook } = await exportMonthly(MONTH_SCOPE);
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  const may11 = sheetRowCountWith(sheet, '9955001').find((row) => cellOf(sheet, row, 'Date').startsWith('2025-05-11'));
  assert.ok(may11, 'a punch at 09:45 IST on 11 May must land on 11 May, not 10 May');
  assert.equal(cellOf(sheet, may11!, 'First Punch'), '09:45:00');
});

test('verification method is the device label and never an invented score', async () => {
  const { workbook } = await exportMonthly(MONTH_SCOPE);
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  const text: string[] = [];
  sheet.eachRow((row) => {
    (row.values as any[]).slice(1).forEach((v) => text.push(asText(v)));
  });
  assert.ok(text.some((v) => v === 'Face'), 'the Face label reported by the terminal is exported');
  assert.ok(
    text.some((v) => v === 'Not reported by device'),
    'a punch with no verify code is reported as such'
  );
  const faceMatchClaims = text.filter((v) => /\d+(\.\d+)?\s*%/.test(v) || /9[0-9]\.[0-9]/.test(v));
  assert.deepEqual(faceMatchClaims, [], 'no face-match percentage may be manufactured');
});

test('weekly off, holiday and absent are not inferred from the weekday', async () => {
  const { workbook } = await exportMonthly(MONTH_SCOPE);
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  const saturday = sheetRowCountWith(sheet, '9955001').find((row) => cellOf(sheet, row, 'Date').startsWith(DAY_ABSENT_SATURDAY));
  assert.ok(saturday, 'the ABSENT fixture row must be exported');
  assert.equal(cellOf(sheet, saturday!, 'Attendance Status'), 'ABSENT');
  assert.equal(cellOf(sheet, saturday!, 'Day'), 'Saturday');
  const statuses = sheetRowCountWith(sheet, '9955001').map((row) => cellOf(sheet, row, 'Attendance Status'));
  assert.ok(!statuses.includes('WEEKLY_OFF'), 'no weekly-off rule exists, so none may be claimed');
  assert.ok(!statuses.includes('HOLIDAY'), 'no holiday master entry exists for May 2025');
});

test('a day with neither an attendance row nor a punch is not invented', async () => {
  const { workbook } = await exportMonthly({ from: '2025-07-01', to: '2025-07-31' });
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  const rows: string[] = [];
  sheet.eachRow((row, n) => {
    if (n > 8) rows.push(asText(row.getCell(1).value));
  });
  assert.ok(
    rows.some((v) => v.includes('No attendance or punch records exist')),
    'an empty period must say so instead of filling the sheet'
  );
});

test('untrusted employee text cannot become a spreadsheet formula', async () => {
  const { workbook } = await exportMonthly({ from: '2025-06-01', to: '2025-06-30' });
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  const rows = sheetRowCountWith(sheet, '9955002');
  assert.ok(rows.length >= 1, 'the second fixture employee must appear');
  const designation = cellOf(sheet, rows[0], 'Designation');
  assert.ok(designation.startsWith("'="), `expected a neutralised formula, got ${JSON.stringify(designation)}`);
  const rawFormulaCells: number[] = [];
  sheet.eachRow((row, n) => {
    if (n <= 8) return;
    (row.values as any[]).slice(1).forEach((v) => {
      const text = asText(v);
      if (/^(=|@|\t|\r)/.test(text)) rawFormulaCells.push(n);
    });
  });
  assert.deepEqual(rawFormulaCells, [], 'no exported cell may start with a formula trigger');
});

test('the month summary is the sum of its own day rows', async () => {
  const { workbook } = await exportMonthly(MONTH_SCOPE);
  const days = workbook.getWorksheet('Daily Attendance')!;
  const summary = workbook.getWorksheet('Monthly Summary')!;
  const fixtureRows = sheetRowCountWith(days, '9955001');
  const summaryRows = sheetRowCountWith(summary, '9955001');
  assert.equal(summaryRows.length, 1, 'one summary row per employee');
  const presentDays = fixtureRows.filter((n) => cellOf(days, n, 'Attendance Status') === 'PRESENT').length;
  assert.equal(
    Number(cellOf(summary, summaryRows[0], 'Present Days')),
    presentDays,
    'the summary must not disagree with the register it was built from'
  );
});

test('the annual sheet splits the same records by month', async () => {
  const { workbook } = await exportAnnual({ from: '2025-01-01', to: '2025-12-31' });
  const breakdown = workbook.getWorksheet('Monthly Breakdown')!;
  const totals = workbook.getWorksheet('Annual Summary')!;
  const months = sheetRowCountWith(breakdown, '9955001').map((n) => cellOf(breakdown, n, 'Month')).sort();
  assert.deepEqual(months, ['2025-05'], 'each month with records gets exactly one breakdown row');
  const juneMonths = sheetRowCountWith(breakdown, '9955002').map((n) => cellOf(breakdown, n, 'Month'));
  assert.deepEqual(juneMonths, ['2025-06'], 'the second fixture only has June records');
  const summaryRow = sheetRowCountWith(totals, '9955001')[0];
  assert.equal(Number(cellOf(totals, summaryRow, 'Present Days')), 1);
});

test('store scope restricts which employees appear in the file', async () => {
  const [locations]: any = await pool.query('SELECT id, code FROM location WHERE code = "BEL" LIMIT 1');
  const { workbook } = await exportMonthly({ ...MONTH_SCOPE, locationId: locations[0].id });
  const sheet = workbook.getWorksheet('Daily Attendance')!;
  const codes: string[] = [];
  sheet.eachRow((row, n) => {
    if (n > 8) codes.push(asText(row.getCell(1).value));
  });
  assert.ok(codes.includes('9955001'), 'the Belagavi fixture must be in a Belagavi export');
  assert.ok(!codes.includes('9955002'), 'another store must not leak into a scoped export');
});

function sheetRowCountWith(sheet: ExcelJS.Worksheet, employeeCode: string): number[] {
  const matches: number[] = [];
  sheet.eachRow((row, n) => {
    if (n <= 8) return;
    if (asText(row.getCell(1).value) === employeeCode) matches.push(n);
  });
  return matches;
}

async function main() {
  if (!(await databaseReady())) {
    console.error('Database is not reachable — start MySQL before running npm run test:export');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log(' BSC TEXTILES HRMS — ATTENDANCE EXPORT TEST SUITE');
  console.log('================================================================');

  await setup();
  let passed = 0;
  const failures: string[] = [];
  try {
    for (const testCase of cases) {
      try {
        await testCase.run();
        console.log(`  ✔ ${testCase.name}`);
        passed++;
      } catch (err: any) {
        console.log(`  ✖ ${testCase.name}`);
        console.log(`      ${(err?.message || String(err)).split('\n')[0]}`);
        failures.push(testCase.name);
      }
    }
  } finally {
    await cleanup();
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`Total: ${cases.length}   Passed: ${passed}   Failed: ${failures.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  · ${f}`));
    console.log('----------------------------------------------------------------');
    await pool.end().catch(() => undefined);
    process.exit(1);
  }
  console.log('🎉 All attendance-export tests passed.');
  console.log('----------------------------------------------------------------');
  await pool.end().catch(() => undefined);
}

main().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
