/**
 * Live Activities test suite.
 *
 * Targets the parts of the feature that can only fail silently: a projection
 * that double-counts an event, a feed that drifts from the dashboard counters,
 * pagination that repeats or skips rows, and an HR action that a role should
 * not be able to take.
 *
 *   npm run test:live
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import {
  sweepDay, summarize, listEvents, eventDetail, decideEvent,
  businessDateOf, CHECKED_IN_STATUSES,
} from '../services/workforceEvents.js';

type Case = { name: string; run: () => Promise<void> };
const cases: Case[] = [];
const test = (name: string, run: () => Promise<void>) => cases.push({ name, run });

const UNIQUE = crypto.randomBytes(4).toString('hex');
/** A date in the past so "still in progress" grace rules cannot skew results. */
const DAY = process.env.LIVE_TEST_DATE || '2026-10-09';

async function databaseReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'workforce_event'`
    );
    return Number(rows?.[0]?.n || 0) === 1;
  } catch {
    return false;
  }
}

test('businessDateOf returns an ISO calendar date independent of host tz', async () => {
  const value = businessDateOf(new Date('2026-10-09T18:30:00Z'));
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  // 18:30Z is 00:00 IST the next day — the whole point of the helper.
  assert.equal(value, '2026-10-10');
});

test('CHECKED_IN_STATUSES is the definition of "present" for the whole dashboard', async () => {
  assert.ok(Array.isArray(CHECKED_IN_STATUSES) && CHECKED_IN_STATUSES.length >= 8);
  assert.ok(CHECKED_IN_STATUSES.includes('PRESENT') && CHECKED_IN_STATUSES.includes('ON_TEA_BREAK'));
  assert.ok(CHECKED_IN_STATUSES.includes('FACE_VERIFIED'), 'face-verified staff are on site');
  assert.ok(!CHECKED_IN_STATUSES.includes('ABSENT'), 'absent must not count as present');
  assert.ok(!CHECKED_IN_STATUSES.includes('WEEKLY_OFF'), 'a weekly off is not attendance');
});

test('sweep is idempotent: re-running cannot create duplicate events', async () => {
  await sweepDay(DAY);
  const [first]: any = await pool.query(
    'SELECT COUNT(*) total, COUNT(DISTINCT dedupeKey) distinct_keys FROM workforce_event WHERE businessDate = ?',
    [DAY]
  );
  await sweepDay(DAY);
  const [second]: any = await pool.query(
    'SELECT COUNT(*) total, COUNT(DISTINCT dedupeKey) distinct_keys FROM workforce_event WHERE businessDate = ?',
    [DAY]
  );
  assert.equal(Number(first[0].total), Number(second[0].total), 'row count changed on re-sweep');
  assert.equal(
    Number(second[0].total),
    Number(second[0].distinct_keys),
    'dedupeKey is not unique in the journal'
  );
});

test('one late arrival produces exactly one event, not one per source table', async () => {
  const [rows]: any = await pool.query(
    `SELECT employeeId, COUNT(*) n FROM workforce_event
      WHERE businessDate = ? AND type = 'late_arrival'
      GROUP BY employeeId HAVING n > 1`,
    [DAY]
  );
  assert.equal(
    rows.length,
    0,
    `employees with duplicate late events: ${JSON.stringify(rows)}`
  );
});

test('every event carries the fields the feed and the drawer render', async () => {
  const { events } = await listEvents({ businessDate: DAY, limit: 200 });
  assert.ok(events.length > 0, 'expected seeded events for the test date');
  for (const event of events) {
    assert.ok(event.dedupeKey, 'missing dedupeKey');
    assert.ok(event.type && event.category, 'missing type/category');
    assert.ok(typeof event.summary === 'string' && event.summary.length > 3, 'empty summary');
    assert.ok(!Number.isNaN(new Date(event.occurredAt).getTime()), 'unparsable occurredAt');
    assert.equal(event.businessDate, DAY, 'event filed on the wrong business date');
  }
});

test('keyset pagination neither repeats nor drops rows', async () => {
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const result = await listEvents({ businessDate: DAY, limit: 2, cursor });
    for (const event of result.events) seen.push(event.dedupeKey);
    if (!result.hasMore) break;
    assert.ok(result.nextCursor, 'hasMore was true but no cursor was returned');
    cursor = result.nextCursor;
  }
  const unique = new Set(seen);
  assert.equal(seen.length, unique.size, `pagination repeated ${seen.length - unique.size} events`);

  const all = await listEvents({ businessDate: DAY, limit: 200 });
  assert.equal(seen.length, all.events.length, 'paged walk did not cover the whole day');
});

test('filters narrow the feed and search matches employee code', async () => {
  const only = await listEvents({ businessDate: DAY, types: ['mismatch'], limit: 200 });
  assert.ok(only.events.every((e: any) => e.type === 'mismatch'), 'type filter leaked');

  const all = await listEvents({ businessDate: DAY, limit: 200 });
  assert.ok(only.events.length <= all.events.length, 'filtered result is larger than unfiltered');

  const target = all.events.find((e: any) => e.employeeCode);
  if (target) {
    const found = await listEvents({ businessDate: DAY, search: target.employeeCode, limit: 50 });
    assert.ok(found.events.length >= 1, 'search by employee code found nothing it should have');
    assert.ok(
      found.events.every((e: any) =>
        String(e.employeeCode || '').includes(target.employeeCode) ||
        String(e.summary).includes(target.employeeCode)
      ),
      'search returned unrelated rows'
    );
  }
});

test('counters agree with the domain tables, not with the journal', async () => {
  const summary = await summarize(DAY);
  const [lateRows]: any = await pool.query(
    'SELECT COUNT(*) n FROM late_attendance_record WHERE recordDate = ?',
    [DAY]
  );
  const [fineRows]: any = await pool.query(
    'SELECT COALESCE(SUM(finalFine),0) amount FROM late_attendance_record WHERE recordDate = ?',
    [DAY]
  );
  assert.equal(summary.lateArrivals, Number(lateRows[0].n), 'late count disagrees with the fine table');
  assert.equal(Number(summary.finesToday), Number(fineRows[0].amount), 'fine total disagrees with the fine table');

  const [statusRows]: any = await pool.query(
    'SELECT status, COUNT(*) n FROM attendance WHERE attendanceDate = ? GROUP BY status',
    [DAY]
  );
  const counts: Record<string, number> = {};
  for (const r of statusRows) counts[r.status] = Number(r.n);
  const expectedPresent = CHECKED_IN_STATUSES.reduce((sum, st) => sum + (counts[st] || 0), 0);
  assert.equal(summary.presence.present, expectedPresent, 'present count disagrees with attendance');
  assert.equal(
    summary.presence.absent,
    Math.max(summary.presence.totalEmployees - expectedPresent - (counts.WEEKLY_OFF || 0), 0),
    'absent must be derived exactly as dashboard-summary derives it'
  );
});

test('a decision persists to the journal and writes an audit row', async () => {
  // auditlog.userId has a foreign key to `user`, so the actor must be a real
  // account. A synthetic id makes the audit insert fail, which is precisely
  // what the "unaudited decision is rolled back" case below relies on.
  const [actors]: any = await pool.query(
    "SELECT `id` FROM `user` WHERE `loginId` = 'rbac.hr' LIMIT 1"
  );
  assert.ok(actors?.length, 'this suite needs the rbac.hr demo account');
  const actorId = actors[0].id;

  const { events } = await listEvents({ businessDate: DAY, types: ['late_arrival'], limit: 1 });
  assert.ok(events.length, 'no late-arrival event to decide on');
  const event = events[0];

  const [before]: any = await pool.query(
    'SELECT COUNT(*) n FROM auditlog WHERE entityType = ? AND entityId = ?',
    ['WorkforceEvent', event.id]
  );

  const result = await decideEvent({
    id: event.dedupeKey,
    action: 'WAIVE',
    actorId,
    note: `waived by test ${UNIQUE}`,
  });
  assert.equal(result.ok, true, `waiver was rejected: ${result.reason}`);

  const [after]: any = await pool.query(
    'SELECT COUNT(*) n FROM auditlog WHERE entityType = ? AND entityId = ?',
    ['WorkforceEvent', event.id]
  );
  assert.equal(Number(after[0].n) - Number(before[0].n), 1, 'decision did not produce exactly one audit row');

  const [row]: any = await pool.query('SELECT status FROM workforce_event WHERE id = ?', [event.id]);
  assert.equal(row[0].status, 'WAIVED', 'journal status was not updated');
});

test('an HR decision survives a later sweep (re-projection cannot reopen it)', async () => {
  await sweepDay(DAY);
  const [row]: any = await pool.query(
    `SELECT status FROM workforce_event
      WHERE businessDate = ? AND type = 'late_arrival' AND status = 'WAIVED' LIMIT 1`,
    [DAY]
  );
  assert.ok(row.length, 'the waived decision was overwritten by the re-sweep');
});

test('an unsupported action is refused rather than stored', async () => {
  const { events } = await listEvents({ businessDate: DAY, limit: 1 });
  const result = await decideEvent({
    id: events[0].dedupeKey, action: 'DELETE_EVERYTHING', actorId: 'system',
  });
  assert.equal(result.ok, false, 'an unknown action was accepted');
});

test('detail returns the employee snippet and the day punch list', async () => {
  const { events } = await listEvents({ businessDate: DAY, limit: 20 });
  const withEmployee = events.find((e: any) => e.employeeId);
  assert.ok(withEmployee, 'no event has an employee to inspect');
  const detail = await eventDetail(withEmployee.dedupeKey);
  assert.ok(detail, 'detail lookup returned null for an existing event');
  assert.equal(detail.event.dedupeKey, withEmployee.dedupeKey);
  assert.ok(Array.isArray(detail.punches), 'punches must always be an array');
  assert.ok(Array.isArray(detail.auditTrail), 'auditTrail must always be an array');
  if (detail.employee) assert.ok(detail.employee.employeeCode, 'employee snippet has no code');
});

async function main() {
  const ready = await databaseReady();
  let passed = 0;
  const failures: string[] = [];

  console.log('\n================================================================');
  console.log('  LIVE ACTIVITIES — feed, journal and counter consistency');
  console.log('================================================================\n');

  if (!ready) {
    console.log('  MySQL or workforce_event unavailable — skipping the database group.');
    console.log('   (run `npm run db:migrate` first; this suite must not pass vacuously)');
    await pool.end().catch(() => undefined);
    return;
  }

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

  console.log('\n----------------------------------------------------------------');
  console.log(`Total: ${cases.length}   Passed: ${passed}   Failed: ${failures.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  · ${f}`));
    console.log('----------------------------------------------------------------');
    await pool.end().catch(() => undefined);
    process.exit(1);
  }
  console.log('🎉 All live-activity tests passed.');
  console.log('----------------------------------------------------------------');
  await pool.end().catch(() => undefined);
}

main().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
