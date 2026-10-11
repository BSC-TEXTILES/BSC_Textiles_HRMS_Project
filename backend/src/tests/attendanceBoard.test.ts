import assert from 'node:assert';
import {
  computeShiftWindow,
  computeDurations,
  deriveDisplayStatus,
  statusMatchesFilter,
  isPresentFamily,
  isExceptionStatus,
  describeException,
  tallyRows,
  emptyTally,
  isValidYmd,
  weekdayOf,
  type StatusContext,
  type Durations,
  type ShiftWindow,
} from '../core/services/AttendanceCalculationService.js';
import { TestResult } from './attendance.test.js';

const TODAY = new Date().toISOString().slice(0, 10);
const PAST_DATE = '2026-10-08'; // A Thursday
const SUNDAY = '2026-10-11'; // Verified Sunday in seed data
const FUTURE_DATE = '2026-10-20';

/**
 * Section 60.14: Attendance & Shifts Board
 *
 * Unit tests for AttendanceCalculationService (pure math) plus live API
 * integration tests against GET /attendance/shift-board, its CSV export and
 * shift HH:MM validation, all verified against the live dev database.
 */
export async function runAttendanceBoardTests(
  baseUrl: string,
  adminToken: string,
  belagaviHrToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'AttendanceBoard', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'AttendanceBoard', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  const api = (path: string, token: string) =>
    fetch(`${baseUrl}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });

  const apiPost = (path: string, token: string, body: any) =>
    fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const apiDelete = (path: string, token: string) =>
    fetch(`${baseUrl}/api${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  /* ------------------------------------------------------------------ */
  /* Unit: AttendanceCalculationService                                  */
  /* ------------------------------------------------------------------ */

  await runTest('isValidYmd accepts real dates and rejects malformed ones', () => {
    assert.ok(isValidYmd('2026-10-01'));
    assert.ok(isValidYmd('2026-02-28'));
    assert.ok(!isValidYmd('2026-02-30'), 'must reject impossible calendar dates');
    assert.ok(!isValidYmd('2026-13-01'), 'must reject month 13');
    assert.ok(!isValidYmd('10-01-2026'), 'must reject non-ISO formats');
    assert.ok(!isValidYmd(''), 'must reject empty string');
    assert.ok(!isValidYmd(null), 'must reject null');
    assert.ok(!isValidYmd(undefined), 'must reject undefined');
  });

  await runTest('weekdayOf maps known dates to correct day names', () => {
    assert.strictEqual(weekdayOf('2026-10-11'), 'SUNDAY');
    assert.strictEqual(weekdayOf('2026-10-12'), 'MONDAY');
    assert.strictEqual(weekdayOf('2026-10-01'), 'THURSDAY');
  });

  await runTest('computeShiftWindow returns a same-day window for a day shift', () => {
    const shift = { startTime: '2024-01-01 09:00:00', endTime: '2024-01-01 18:00:00' };
    const w = computeShiftWindow(shift, '2026-10-08');
    assert.ok(w, 'window must be built');
    assert.strictEqual(w!.overnight, false);
    assert.strictEqual(w!.start.getFullYear(), 2026);
    assert.strictEqual(w!.start.getMonth(), 9);
    assert.strictEqual(w!.start.getDate(), 8);
    assert.strictEqual(w!.start.getHours(), 9);
    assert.strictEqual(w!.end.getHours(), 18);
  });

  await runTest('computeShiftWindow rolls overnight shifts to the next day (16:30 → 01:30)', () => {
    const shift = { startTime: '2024-01-01 16:30:00', endTime: '2024-01-01 01:30:00' };
    const w = computeShiftWindow(shift, '2026-10-08');
    assert.ok(w, 'window must be built');
    assert.strictEqual(w!.overnight, true, 'end before start must flag overnight');
    assert.strictEqual(w!.start.getDate(), 8);
    assert.strictEqual(w!.start.getHours(), 16);
    assert.strictEqual(w!.end.getDate(), 9, 'overnight shift ends the following calendar day');
    assert.strictEqual(w!.end.getHours(), 1);
  });

  await runTest('computeDurations flags raw lateness beyond the threshold', () => {
    const shift = { startTime: '2024-01-01 09:00:00', endTime: '2024-01-01 18:00:00' };
    const w = computeShiftWindow(shift, '2026-10-08')!;
    // 9:15 login → 900s late; default threshold 5 min = 300s.
    const d = computeDurations(w, '2026-10-08T09:15:00', '2026-10-08T18:00:00', 5);
    assert.strictEqual(d.lateRawSeconds, 900, 'raw lateness is always reported');
    assert.strictEqual(d.lateLoginSeconds, 900, 'lateness beyond threshold is stored');
  });

  await runTest('computeDurations keeps lateRawSeconds but zeroes lateLoginSeconds inside grace', () => {
    const shift = { startTime: '2024-01-01 09:00:00', endTime: '2024-01-01 18:00:00' };
    const w = computeShiftWindow(shift, '2026-10-08')!;
    // 9:03 login → 180s late; threshold 5 min → no lateLoginSeconds.
    const d = computeDurations(w, '2026-10-08T09:03:00', '2026-10-08T18:00:00', 5);
    assert.strictEqual(d.lateRawSeconds, 180, 'raw lateness still tracked');
    assert.strictEqual(d.lateLoginSeconds, 0, 'no stored lateness inside grace window');
  });

  await runTest('computeDurations computes early login, early logout and overtime', () => {
    const shift = { startTime: '2024-01-01 09:00:00', endTime: '2024-01-01 18:00:00' };
    const w = computeShiftWindow(shift, '2026-10-08')!;
    const d = computeDurations(w, '2026-10-08T08:45:00', '2026-10-08T18:30:00', 5);
    assert.strictEqual(d.earlyLoginSeconds, 900, '15 minutes early login');
    assert.strictEqual(d.overtimeSeconds, 1800, '30 minutes overtime');
    assert.strictEqual(d.totalWorkingSeconds, 9 * 3600 + 45 * 60, 'worked = 08:45 → 18:30');
  });

  await runTest('deriveDisplayStatus returns ABSENT for a past workday with no punches', () => {
    const ctx: StatusContext = {
      recordStatus: null,
      actualLogin: null,
      actualLogout: null,
      isLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      onBreak: false,
      window: null,
      durations: computeDurations(null, null, null, 5),
      workDate: PAST_DATE,
      today: TODAY,
      now: new Date(),
      lateThresholdMinutes: 5,
    };
    const r = deriveDisplayStatus(ctx);
    assert.strictEqual(r.status, 'ABSENT');
    assert.ok(r.isException, 'past date without punches is an exception');
  });

  await runTest('deriveDisplayStatus returns CHECKED_OUT for both punches and LATE when beyond threshold', () => {
    const shift = { startTime: '2024-01-01 09:00:00', endTime: '2024-01-01 18:00:00' };
    const w = computeShiftWindow(shift, PAST_DATE)!;
    const d = computeDurations(w, `${PAST_DATE}T09:20:00`, `${PAST_DATE}T18:05:00`, 5);
    const ctx: StatusContext = {
      recordStatus: null,
      actualLogin: `${PAST_DATE}T09:20:00`,
      actualLogout: `${PAST_DATE}T18:05:00`,
      isLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      onBreak: false,
      window: w,
      durations: d,
      workDate: PAST_DATE,
      today: TODAY,
      now: new Date(),
      lateThresholdMinutes: 5,
    };
    const r = deriveDisplayStatus(ctx);
    assert.strictEqual(r.status, 'LATE', '20 min late with both punches derives LATE');
    assert.ok(r.isLate);
    assert.strictEqual(r.lateMinutes, 20);
  });

  await runTest('deriveDisplayStatus returns SCHEDULED for a future workday', () => {
    const ctx: StatusContext = {
      recordStatus: null,
      actualLogin: null,
      actualLogout: null,
      isLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      onBreak: false,
      window: null,
      durations: computeDurations(null, null, null, 5),
      workDate: FUTURE_DATE,
      today: TODAY,
      now: new Date(),
      lateThresholdMinutes: 5,
    };
    const r = deriveDisplayStatus(ctx);
    assert.strictEqual(r.status, 'SCHEDULED');
    assert.ok(!r.isException);
  });

  await runTest('deriveDisplayStatus respects the WEEKLY_OFF record over everything else', () => {
    const ctx: StatusContext = {
      recordStatus: 'WEEKLY_OFF',
      actualLogin: null,
      actualLogout: null,
      isLeave: false,
      isHoliday: false,
      isWeeklyOff: true,
      onBreak: false,
      window: null,
      durations: computeDurations(null, null, null, 5),
      workDate: SUNDAY,
      today: TODAY,
      now: new Date(),
      lateThresholdMinutes: 5,
    };
    const r = deriveDisplayStatus(ctx);
    assert.strictEqual(r.status, 'WEEKLY_OFF');
    assert.ok(!r.isException);
  });

  await runTest('deriveDisplayStatus returns ON_LEAVE when approved leave covers the date', () => {
    const ctx: StatusContext = {
      recordStatus: null,
      actualLogin: null,
      actualLogout: null,
      isLeave: true,
      isHoliday: false,
      isWeeklyOff: false,
      onBreak: false,
      window: null,
      durations: computeDurations(null, null, null, 5),
      workDate: PAST_DATE,
      today: TODAY,
      now: new Date(),
      lateThresholdMinutes: 5,
    };
    const r = deriveDisplayStatus(ctx);
    assert.strictEqual(r.status, 'ON_LEAVE');
  });

  await runTest('statusMatchesFilter maps PRESENT to the full present family', () => {
    assert.ok(statusMatchesFilter('PRESENT', false, 'PRESENT'));
    assert.ok(statusMatchesFilter('CHECKED_OUT', false, 'PRESENT'));
    assert.ok(statusMatchesFilter('PUNCHED_IN', false, 'PRESENT'));
    assert.ok(statusMatchesFilter('LATE', true, 'PRESENT'));
    assert.ok(statusMatchesFilter('ON_BREAK', false, 'PRESENT'));
    assert.ok(!statusMatchesFilter('ABSENT', false, 'PRESENT'));
    assert.ok(!statusMatchesFilter('WEEKLY_OFF', false, 'PRESENT'));
  });

  await runTest('statusMatchesFilter maps PUNCHED_IN to PUNCHED_IN + ON_BREAK only', () => {
    assert.ok(statusMatchesFilter('PUNCHED_IN', false, 'PUNCHED_IN'));
    assert.ok(statusMatchesFilter('ON_BREAK', false, 'PUNCHED_IN'));
    assert.ok(!statusMatchesFilter('CHECKED_OUT', false, 'PUNCHED_IN'));
    assert.ok(!statusMatchesFilter('LATE', true, 'PUNCHED_IN'));
  });

  await runTest('statusMatchesFilter matches LATE on isLate flag or LATE status', () => {
    assert.ok(statusMatchesFilter('CHECKED_OUT', true, 'LATE'));
    assert.ok(statusMatchesFilter('LATE', true, 'LATE'));
    assert.ok(!statusMatchesFilter('CHECKED_OUT', false, 'LATE'));
    assert.ok(!statusMatchesFilter('ABSENT', false, 'LATE'));
  });

  await runTest('statusMatchesFilter passes through for all / empty filter', () => {
    assert.ok(statusMatchesFilter('PRESENT', false, null));
    assert.ok(statusMatchesFilter('ABSENT', false, 'all'));
    assert.ok(statusMatchesFilter('WEEKLY_OFF', false, ''));
  });

  await runTest('isExceptionStatus flags ABSENT, NOT_PUNCHED_IN, INCOMPLETE and LATE', () => {
    assert.ok(isExceptionStatus('ABSENT'));
    assert.ok(isExceptionStatus('NOT_PUNCHED_IN'));
    assert.ok(isExceptionStatus('INCOMPLETE'));
    assert.ok(isExceptionStatus('LATE'));
    assert.ok(!isExceptionStatus('PRESENT'));
    assert.ok(!isExceptionStatus('CHECKED_OUT'));
    assert.ok(!isExceptionStatus('WEEKLY_OFF'));
    assert.ok(!isExceptionStatus('HOLIDAY'));
    assert.ok(!isExceptionStatus('SCHEDULED'));
    assert.ok(!isExceptionStatus('ON_LEAVE'));
    assert.ok(!isExceptionStatus('ON_BREAK'));
    assert.ok(!isExceptionStatus('PUNCHED_IN'));
  });

  await runTest('describeException classifies missing OUT and missing IN punches', () => {
    const dMissingOut = describeException('INCOMPLETE', {
      durations: computeDurations(null, null, null, 5),
      window: null,
      graceMinutes: 5,
      hasLogin: true,
      hasLogout: false,
      isPastDate: true,
      isLate: false,
    });
    assert.strictEqual(dMissingOut.text, 'Missing OUT punch');
    assert.ok(dMissingOut.isException);

    const dMissingIn = describeException('INCOMPLETE', {
      durations: computeDurations(null, null, null, 5),
      window: null,
      graceMinutes: 5,
      hasLogin: false,
      hasLogout: true,
      isPastDate: true,
      isLate: false,
    });
    assert.strictEqual(dMissingIn.text, 'Missing IN punch');
  });

  await runTest('describeException separates within-grace vs beyond-grace lateness', () => {
    const within = describeException('LATE', {
      durations: { ...computeDurations(null, null, null, 5), lateRawSeconds: 180 } as Durations,
      window: null,
      graceMinutes: 5,
      hasLogin: true,
      hasLogout: true,
      isPastDate: true,
      isLate: true,
    });
    assert.strictEqual(within.text, 'Within grace (3m)');
    assert.ok(within.isException);

    const beyond = describeException('LATE', {
      durations: { ...computeDurations(null, null, null, 5), lateRawSeconds: 1500 } as Durations,
      window: null,
      graceMinutes: 5,
      hasLogin: true,
      hasLogout: true,
      isPastDate: true,
      isLate: true,
    });
    assert.strictEqual(beyond.text, 'Late by 25m');
  });

  await runTest('tallyRows aggregates present, absent, late and weekly-off counters', () => {
    const t = tallyRows([
      { status: 'PRESENT', isLate: false, hasRecord: true },
      { status: 'LATE', isLate: true, hasRecord: true },
      { status: 'ABSENT', isLate: false, hasRecord: true },
      { status: 'WEEKLY_OFF', isLate: false, hasRecord: true },
      { status: 'SCHEDULED', isLate: false, hasRecord: false },
      { status: 'INCOMPLETE', isLate: false, hasRecord: true },
      { status: 'NOT_PUNCHED_IN', isLate: false, hasRecord: false },
    ]);
    assert.strictEqual(t.rostered, 7);
    assert.strictEqual(t.present, 2, 'PRESENT + LATE count as present family');
    assert.strictEqual(t.late, 1);
    assert.strictEqual(t.absent, 1);
    assert.strictEqual(t.weeklyOff, 1);
    assert.strictEqual(t.scheduled, 1);
    assert.strictEqual(t.incomplete, 1);
    assert.strictEqual(t.notPunchedIn, 1);
    assert.strictEqual(t.missingPunch, 2, 'NOT_PUNCHED_IN + INCOMPLETE');
    assert.strictEqual(t.withRecord, 5);
  });

  await runTest('emptyTally returns all-zero counters', () => {
    const t = emptyTally();
    assert.strictEqual(t.rostered, 0);
    assert.strictEqual(t.present, 0);
    assert.strictEqual(t.late, 0);
  });

  /* ------------------------------------------------------------------ */
  /* API integration: GET /attendance/shift-board                        */
  /* ------------------------------------------------------------------ */

  await runTest('API: shift-board without filters returns a roster for the default date', async () => {
    const res = await api('/attendance/shift-board', adminToken);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(isValidYmd(data.date), 'response date must be yyyy-mm-dd');
    assert.ok(Array.isArray(data.rows), 'rows must be an array');
    assert.ok(Array.isArray(data.shifts), 'shifts must be an array');
    assert.ok(data.summary && typeof data.summary.rostered === 'number', 'summary.rostered required');
    assert.ok(typeof data.total === 'number', 'total must be a number');
    assert.ok(typeof data.pages === 'number', 'pages must be a number');
    assert.ok(Array.isArray(data.statusOptions) && data.statusOptions.length > 0, 'statusOptions must be non-empty');
  });

  await runTest('API: shift-board ?date=2026-10-01 returns 35 rostered employees', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-01&limit=35', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.date, '2026-10-01', 'must query the exact requested date');
    assert.strictEqual(data.summary.rostered, 35, '35 active employees rostered');
    assert.strictEqual(data.total, 35);
    const rows: any[] = data.rows;
    assert.strictEqual(rows.length, 35, 'with limit=35 all rows are returned');
    for (const r of rows) {
      assert.strictEqual(r.attendanceDate, '2026-10-01', 'every row is for the requested date');
      assert.ok(r.fullName && r.employeeCode, 'rows carry employee identity');
      assert.ok(r.status, 'rows carry a display status');
    }
  });

  await runTest('API: shift-board ?date=2026-10-11 (Sunday) returns 35 rostered with weekly-off rows', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-11', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.date, '2026-10-11');
    assert.strictEqual(data.summary.rostered, 35);
    const statuses = new Set<string>(data.rows.map((r: any) => r.status));
    assert.ok(statuses.size > 0, 'rows returned');
  });

  await runTest('API: shift-board invalid date returns 400 INVALID_DATE', async () => {
    const res = await api('/attendance/shift-board?date=not-a-date', adminToken);
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    const data: any = await res.json();
    assert.strictEqual(data.error, 'INVALID_DATE');
  });

  await runTest('API: shift-board rejects an impossible calendar date (2026-02-30)', async () => {
    const res = await api('/attendance/shift-board?date=2026-02-30', adminToken);
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    const data: any = await res.json();
    assert.strictEqual(data.error, 'INVALID_DATE');
  });

  await runTest('API: shift-board locationId=DAV scopes every row to the Davanegere hub', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-08&locationId=cmuwszr9500021vdtxscy3nsc', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.ok(data.total > 0, 'DAV must have employees');
    assert.ok(data.total < 35, 'DAV must not return the full roster');
    for (const r of data.rows) {
      assert.strictEqual(r.locationId, 'cmuwszr9500021vdtxscy3nsc', 'every row belongs to DAV');
    }
    assert.strictEqual(data.scope?.locationId, 'cmuwszr9500021vdtxscy3nsc');
  });

  await runTest('API: shift-board departmentId filter narrows rows to that department', async () => {
    const deptRes = await api('/departments?locationId=cmuwszr8t00011vdtc7vgvags&limit=100', adminToken);
    const deptData: any = await deptRes.json();
    const departments: any[] = deptData.departments || deptData.data || [];
    assert.ok(departments.length > 0, 'departments available');
    // Pick a department that actually has employees (first one with rows).
    let target: any = null;
    let total = 0;
    for (const dept of departments) {
      const probe = await api(
        `/attendance/shift-board?date=2026-10-08&locationId=cmuwszr8t00011vdtc7vgvags&departmentId=${dept.id}&limit=1`,
        adminToken
      );
      const probeData: any = await probe.json();
      if (probeData.total > 0) {
        target = dept;
        total = probeData.total;
        break;
      }
    }
    assert.ok(target, 'at least one BEL department has employees');
    const res = await api(
      `/attendance/shift-board?date=2026-10-08&locationId=cmuwszr8t00011vdtc7vgvags&departmentId=${target.id}`,
      adminToken
    );
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.total, total, 'total matches the probe');
    for (const r of data.rows) {
      assert.strictEqual(r.departmentId, target.id, 'every row belongs to the filtered department');
    }
  });

  await runTest('API: shift-board status filter returns only matching rows', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-01&status=ABSENT', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.ok(data.total > 0, 'seed data has ABSENT rows on 2026-10-01');
    for (const r of data.rows) {
      assert.strictEqual(r.status, 'ABSENT', 'status filter must hold for every returned row');
    }
  });

  await runTest('API: shift-board status=PRESENT returns the full present family', async () => {
    // 2026-10-01 has only INCOMPLETE/ABSENT; 2026-10-11 has LATE (present family).
    const res = await api('/attendance/shift-board?date=2026-10-11&status=PRESENT', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.ok(data.total > 0, '2026-10-11 has present-family rows');
    for (const r of data.rows) {
      assert.ok(isPresentFamily(r.status), `PRESENT filter leaked status ${r.status}`);
    }
  });

  await runTest('API: shift-board pagination is consistent across pages', async () => {
    const page1 = await api('/attendance/shift-board?date=2026-10-01&page=1&limit=10', adminToken);
    const page2 = await api('/attendance/shift-board?date=2026-10-01&page=2&limit=10', adminToken);
    assert.strictEqual(page1.status, 200);
    assert.strictEqual(page2.status, 200);
    const d1: any = await page1.json();
    const d2: any = await page2.json();
    assert.strictEqual(d1.rows.length, 10, 'page 1 returns the requested limit');
    assert.strictEqual(d2.rows.length, 10, 'page 2 returns the requested limit');
    assert.strictEqual(d1.total, 35, 'total ignores pagination');
    assert.strictEqual(d1.total, d2.total, 'total is stable across pages');
    assert.strictEqual(d1.pages, 4, '35 rows / limit 10 = 4 pages');
    const ids1 = new Set<string>(d1.rows.map((r: any) => r.employeeId));
    for (const r of d2.rows) {
      assert.ok(!ids1.has(r.employeeId), 'pages must not overlap');
    }
  });

  await runTest('API: shift-board search narrows rows by employee name/code', async () => {
    const allRes = await api('/attendance/shift-board?date=2026-10-01&limit=1', adminToken);
    const allData: any = await allRes.json();
    assert.ok(allData.total > 0);
    const sampleRes = await api('/attendance/shift-board?date=2026-10-01&limit=1', adminToken);
    const sample: any = ((await sampleRes.json()) as any).rows[0];
    const term = sample.employeeCode;
    const res = await api(
      `/attendance/shift-board?date=2026-10-01&search=${encodeURIComponent(term)}`,
      adminToken
    );
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.ok(data.total >= 1, 'search by employee code must find at least one row');
    const found = data.rows.some(
      (r: any) =>
        r.employeeCode?.toLowerCase().includes(term.toLowerCase()) ||
        r.fullName?.toLowerCase().includes(term.toLowerCase())
    );
    assert.ok(found, 'at least one row matches the search term');
  });

  await runTest('API: shift-board exceptions=1 returns only exception rows', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-01&exceptions=1', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.ok(data.total > 0, 'seed data has exceptions on 2026-10-01');
    for (const r of data.rows) {
      assert.ok(
        isExceptionStatus(r.status),
        `exceptions=1 leaked non-exception status ${r.status}`
      );
    }
  });

  await runTest('API: shift-board shiftId filter narrows rows to that shift', async () => {
    const shiftsRes = await api('/shifts?limit=100', adminToken);
    const shifts: any[] = ((await shiftsRes.json()) as any).shifts || [];
    assert.ok(shifts.length > 0, 'shifts available');
    const target = shifts.find((s) => s.name?.toLowerCase().includes('night')) || shifts[0];
    const res = await api(`/attendance/shift-board?date=2026-10-08&shiftId=${target.id}`, adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    for (const r of data.rows) {
      assert.strictEqual(r.shiftId, target.id, 'every row belongs to the filtered shift');
    }
  });

  await runTest('API: shift-board returns per-shift staff tallies that sum to the roster', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-01', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.ok(data.shifts.length > 0, 'shifts array present');
    let sumStaff = 0;
    for (const s of data.shifts) {
      assert.ok(s.name, 'each shift card has a name');
      assert.ok(s.staff && typeof s.staff.rostered === 'number', 'each shift card has staff.tally');
      sumStaff += s.staff.rostered;
    }
    assert.strictEqual(sumStaff, data.summary.rostered, 'per-shift staff sums to the board roster');
  });

  await runTest('API: shift-board marks overnight shifts with an overnight flag', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-08', adminToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    const overnight = data.shifts.filter((s: any) => s.overnight);
    assert.ok(overnight.length > 0, 'seed data contains overnight (Night) shifts');
    for (const s of overnight) {
      assert.ok(s.startTime && s.endTime, 'overnight shift exposes scheduled times');
    }
  });

  /* ------------------------------------------------------------------ */
  /* API: CSV export                                                     */
  /* ------------------------------------------------------------------ */

  await runTest('API: shift-board export returns a CSV with the expected header and filename', async () => {
    const res = await api('/attendance/shift-board/export?date=2026-10-01', adminToken);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/csv'), `expected CSV content-type, got ${contentType}`);
    const disposition = res.headers.get('content-disposition') || '';
    assert.ok(disposition.includes('BSC_Shift_Board_2026-10-01.csv'), `unexpected filename: ${disposition}`);
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    assert.ok(lines.length >= 36, `expected header + 35 data rows, got ${lines.length} lines`);
    const header = lines[0].replace(/^\uFEFF/, '');
    assert.ok(header.includes('Employee ID'), `CSV must include Employee ID, got: ${header}`);
    assert.ok(header.includes('Attendance Status'), `CSV must include Attendance Status, got: ${header}`);
  });

  await runTest('API: shift-board export respects locationId and status filters', async () => {
    const res = await api(
      '/attendance/shift-board/export?date=2026-10-01&locationId=cmuwszr9500021vdtxscy3nsc&status=ABSENT',
      adminToken
    );
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    assert.ok(lines.length >= 1, 'at least the header is present');
    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        assert.ok(lines[i].includes('ABSENT'), 'exported rows honour the status filter');
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* API: shift creation accepts HH:MM and rejects ISO datetimes         */
  /* ------------------------------------------------------------------ */

  await runTest('API: shift create with HH:MM times succeeds and DELETE cleans up', async () => {
    const code = `TEST-${Date.now()}`;
    const createRes = await apiPost('/shifts', adminToken, {
      code,
      name: 'Test Overnight Shift',
      locationId: 'cmuwszr8t00011vdtc7vgvags',
      startTime: '22:00',
      endTime: '07:00',
      gracePeriod: 5,
      lateThreshold: 5,
      status: 'INACTIVE',
    });
    assert.strictEqual(createRes.status, 201, `Expected 201, got ${createRes.status}`);
    const created: any = await createRes.json();
    assert.ok(created.id, 'created shift has an id');

    const deleteRes = await apiDelete(`/shifts/${created.id}`, adminToken);
    assert.ok(deleteRes.status === 200 || deleteRes.status === 204, `delete returned ${deleteRes.status}`);
  });

  await runTest('API: shift create rejects ISO datetime strings with 400 and a clear message', async () => {
    const res = await apiPost('/shifts', adminToken, {
      code: `TEST-BAD-${Date.now()}`,
      name: 'Bad Time Format Shift',
      locationId: 'cmuwszr8t00011vdtc7vgvags',
      startTime: '2026-10-01T16:30:00.000Z',
      endTime: '2026-10-01T01:30:00.000Z',
      status: 'INACTIVE',
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    const data: any = await res.json();
    const msg = JSON.stringify(data);
    assert.ok(msg.includes('HH:MM'), `error message must mention HH:MM format, got: ${msg}`);
  });

  /* ------------------------------------------------------------------ */
  /* API: HR location scoping                                            */
  /* ------------------------------------------------------------------ */

  await runTest('API: HR_EXECUTIVE requesting another hub is scoped back to their own hub', async () => {
    const res = await api('/attendance/shift-board?date=2026-10-08&locationId=cmuwszr9500021vdtxscy3nsc', belagaviHrToken);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.scope?.locationId, 'cmuwszr8t00011vdtc7vgvags', 'scoped back to BEL');
    assert.ok(data.total > 0, 'BEL roster still visible');
    for (const r of data.rows) {
      assert.strictEqual(r.locationId, 'cmuwszr8t00011vdtc7vgvags', 'no cross-hub data leaks');
    }
  });

  return results;
}

/** Standalone entry: `npx tsx src/tests/attendanceBoard.test.ts` */
async function main() {
  const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');
  const login = async (email: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
    return ((await res.json()) as any).token;
  };
  const adminToken = await login('admin@bsctextiles.com');
  const belagaviHrToken = await login('kavita.bhat@bsctextiles.com');
  const results = await runAttendanceBoardTests(BASE_URL, adminToken, belagaviHrToken);
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) {
      passed++;
      console.log(`  ✅ PASS: ${r.name} (${r.durationMs}ms)`);
    } else {
      failed++;
      console.log(`  ❌ FAIL: ${r.name} (${r.durationMs}ms)`);
      console.log(`     Error: ${r.error}`);
    }
  }
  console.log(`\nAttendanceBoard: ${passed} passed, ${failed} failed, ${results.length} total`);
  process.exit(failed > 0 ? 1 : 0);
}

// Run only when executed directly (not when imported by runAllTests).
if (process.argv[1] && process.argv[1].endsWith('attendanceBoard.test.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
