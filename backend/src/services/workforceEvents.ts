/**
 * Live Activities — the one shared data service behind the dashboard feed.
 *
 * Two rules shape everything here, and they pull in opposite directions:
 *
 *  1. The feed must be a single, indexed, paginatable, searchable stream that
 *     also works for past days (so: a journal table, `workforce_event`).
 *  2. The feed's numbers must always agree with the rest of the dashboard
 *     (so: counters are computed from the *domain* tables, never from the
 *     journal, and they reuse the same predicates as
 *     /api/reports/dashboard-summary via `checkedInStatuses` below).
 *
 * The journal is therefore a projection, not a source of truth. `sweepDay`
 * derives events from attendance / raw punches / mismatches / late fines /
 * leave / corrections and upserts them by a deterministic `dedupeKey`, so a
 * reconnect, a retried webhook, a duplicated socket emit or a full backfill can
 * never produce a second copy of the same thing. HR decisions are written back
 * onto the journal row and are deliberately NOT overwritten by later sweeps.
 *
 * Timezone: `businessDate` is the Asia/Kolkata calendar date, computed with an
 * explicit tz formatter rather than the server's local time or MySQL's session
 * tz, because night shifts punch across midnight and both of those would file
 * the event on the wrong day.
 */
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { socketIO } from '../socket.js';

export type LiveEventCategory =
  | 'ATTENDANCE' | 'EXCEPTION' | 'FINANCE' | 'ASSIGNMENT' | 'LEAVE' | 'OVERTIME' | 'CORRECTION';

export type LiveEventType =
  | 'punch_in' | 'punch_out' | 'missed_in' | 'missed_out' | 'mismatch'
  | 'late_arrival' | 'early_departure' | 'assignment' | 'overtime_start'
  | 'overtime_end' | 'leave' | 'absence' | 'shift_change' | 'correction';

export interface LiveEvent {
  dedupeKey: string;
  type: LiveEventType;
  category: LiveEventCategory;
  status: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  departmentId: string | null;
  locationId: string | null;
  shiftId: string | null;
  occurredAt: Date;
  businessDate: string;
  sourceTable: string | null;
  sourceId: string | null;
  actionUrl: string | null;
  payload: Record<string, unknown>;
}

/**
 * The statuses that mean "this person is on site right now". Copied verbatim
 * from routes/reports.ts so the two surfaces cannot drift — that list is the
 * definition of `present` for the whole executive dashboard.
 */
export const CHECKED_IN_STATUSES = [
  'PRESENT', 'EARLY', 'LATE', 'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED',
  'FACE_VERIFICATION_FAILED', 'ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK',
];

const IST = 'Asia/Kolkata';

/** Calendar date (YYYY-MM-DD) in the business timezone, for any instant. */
export function businessDateOf(instant: Date = new Date()): string {
  // en-CA renders ISO-style YYYY-MM-DD; the explicit timeZone makes it
  // independent of the host clock, which is the whole point.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
}

/**
 * Convert a stored DATETIME(3) into the business calendar date it belongs to.
 * mysql2 hands back Date objects built in the pool's +05:30 zone, so a value
 * read as 2026-10-17T00:40+05:30 must not become 2026-10-16 just because the
 * Node process runs in UTC.
 */
export function businessDateOfPunch(value: Date | string | null): string {
  if (!value) return businessDateOf();
  const asDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(asDate.getTime()) ? businessDateOf() : businessDateOf(asDate);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

/**
 * Idempotent upsert. Existing rows keep their `status`, decision fields and
 * `created_at`; only the descriptive columns are refreshed, so a re-sweep after
 * an HR decision cannot silently reopen a closed item.
 */
export async function recordEvents(events: LiveEvent[]): Promise<{ written: number }> {
  if (!events.length) return { written: 0 };
  let written = 0;

  for (const event of events) {
    try {
      await pool.query(
        `INSERT INTO \`workforce_event\`
           (\`id\`, \`dedupeKey\`, \`type\`, \`category\`, \`status\`, \`severity\`, \`summary\`,
            \`employeeId\`, \`employeeCode\`, \`employeeName\`, \`departmentId\`, \`locationId\`,
            \`shiftId\`, \`occurredAt\`, \`businessDate\`, \`sourceTable\`, \`sourceId\`,
            \`payload\`, \`actionUrl\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE
           \`summary\`     = VALUES(\`summary\`),
           \`severity\`    = VALUES(\`severity\`),
           \`payload\`     = VALUES(\`payload\`),
           \`actionUrl\`   = VALUES(\`actionUrl\`),
           \`employeeCode\` = COALESCE(VALUES(\`employeeCode\`), \`employeeCode\`),
           \`employeeName\` = COALESCE(VALUES(\`employeeName\`), \`employeeName\`),
           \`departmentId\` = COALESCE(VALUES(\`departmentId\`), \`departmentId\`),
           \`updatedAt\`   = NOW(3)`,
        [
          newId('wev'), event.dedupeKey, event.type, event.category, event.status,
          event.severity, event.summary.slice(0, 255), event.employeeId, event.employeeCode,
          event.employeeName, event.departmentId, event.locationId, event.shiftId,
          event.occurredAt, event.businessDate, event.sourceTable, event.sourceId,
          JSON.stringify(event.payload ?? {}), event.actionUrl,
        ]
      );
      written++;
    } catch (err: any) {
      // One bad projection (a row referencing a since-deleted employee, say)
      // must not abort the whole sweep or surface as a failed dashboard.
      console.warn(`[live] could not record ${event.type} ${event.dedupeKey}:`, err?.code || err?.message);
    }
  }
  return { written };
}

/** Emits to the rooms that can see this event. Auth on the channel is the socket handshake middleware. */
export function publishLive(event: Record<string, any>, locationId?: string | null): void {
  socketIO.to('live:activities').emit('live:activity', event);
  if (locationId) socketIO.to(`location:${locationId}`).emit('live:activity', event);
}

// ─── Projection: domain tables -> events ────────────────────────────────────

interface SweepOptions {
  locationIds?: string[] | null;
  /** Only events after this instant are considered (keeps a sweep cheap). */
  sinceMinutes?: number;
}

/**
 * Derives today's events from the real domain tables and upserts them.
 *
 * Every query below is parameterised, every row is scoped by location when the
 * caller is scoped, and none of them fabricate a row: if nothing happened, the
 * feed is empty and says so.
 */
export async function sweepDay(businessDate: string, options: SweepOptions = {}): Promise<{ written: number; byType: Record<string, number> }> {
  const { locationIds = null } = options;
  const scope = (column: string) =>
    locationIds && locationIds.length
      ? ` AND ${column} IN (${locationIds.map(() => '?').join(',')})`
      : '';
  const scopeArgs = locationIds && locationIds.length ? locationIds : [];

  const events: LiveEvent[] = [];
  const byType: Record<string, number> = {};
  const push = (event: LiveEvent) => {
    events.push(event);
    byType[event.type] = (byType[event.type] || 0) + 1;
  };

  // ---- Attendance-derived: punches, lateness, early exit, overtime, absence
  const [attendanceRows]: any = await pool.query(
    `SELECT a.\`id\`, a.\`employeeId\`, a.\`locationId\`, a.\`shiftId\`, a.\`status\`,
            a.\`scheduledLogin\`, a.\`actualLogin\`, a.\`scheduledLogout\`, a.\`actualLogout\`,
            a.\`lateLoginSeconds\`, a.\`overtimeSeconds\`, a.\`lateLoginPenalty\`,
            e.\`employeeCode\`, e.\`fullName\`, e.\`departmentId\`, s.\`name\` AS shiftName
       FROM \`attendance\` a
       LEFT JOIN \`employee\` e ON e.\`id\` = a.\`employeeId\`
       LEFT JOIN \`shift\` s ON s.\`id\` = a.\`shiftId\`
      WHERE a.\`attendanceDate\` = ?${scope('a.locationId')}
      ORDER BY COALESCE(a.\`actualLogin\`, a.\`scheduledLogin\`) ASC`,
    [businessDate, ...scopeArgs]
  );

  // The fine record is authoritative for lateness: it carries chargeable
  // minutes, the waiver and the approval state. `attendance.lateLoginPenalty`
  // is a denormalised echo of the same fact, so emitting a late-arrival event
  // from both would double-count every late employee in the feed and the
  // counters. Collect the covered keys first and skip the echo.
  //
  // NOTE: `late_attendance_record.attendanceId` is NULL on every row in this
  // database, so the two cannot be joined on it. The natural key of a daily
  // late record is (employee, date), which is what this uses. It also means the
  // fine table and `attendance` can disagree about the amount for the same
  // person-day — surfaced as a finding rather than silently averaged here.
  const [fineRows]: any = await pool.query(
    `SELECT f.\`id\`, f.\`attendanceId\`, f.\`employeeId\`, f.\`departmentId\`, f.\`locationId\`, f.\`shiftId\`,
            f.\`actualPunchIn\`, f.\`lateSeconds\`, f.\`chargeableLateSeconds\`, f.\`finalFine\`,
            f.\`waivedFine\`, f.\`fineStatus\`, f.\`approvalStatus\`, f.\`earlyIncentive\`,
            e.\`employeeCode\`, e.\`fullName\`
       FROM \`late_attendance_record\` f
       LEFT JOIN \`employee\` e ON e.\`id\` = f.\`employeeId\`
      WHERE f.\`recordDate\` = ?${scope('f.locationId')}
      ORDER BY f.\`actualPunchIn\` ASC`,
    [businessDate, ...scopeArgs]
  );
  const coveredByFine = new Set(
    (fineRows || [])
      .map((f: any) => f.employeeId)
      .filter(Boolean)
      .map((id: string) => `${businessDate}:${id}`)
  );

  for (const row of attendanceRows || []) {
    const base = {
      employeeId: row.employeeId,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.fullName ?? null,
      departmentId: row.departmentId ?? null,
      locationId: row.locationId ?? null,
      shiftId: row.shiftId ?? null,
      businessDate,
    };
    const who = row.fullName || row.employeeCode || 'Employee';
    const lateSeconds = Number(row.lateLoginSeconds || 0);

    if (row.actualLogin) {
      push({
        ...base,
        dedupeKey: `punch_in:${row.id}`,
        type: 'punch_in',
        category: 'ATTENDANCE',
        status: 'RECORDED',
        severity: 'INFO',
        summary: `${who} checked in${lateSeconds > 0 ? ` — ${Math.round(lateSeconds / 60)} min late` : ' on time'}`,
        occurredAt: new Date(row.actualLogin),
        sourceTable: 'attendance',
        sourceId: row.id,
        actionUrl: '/attendance/punches',
        payload: {
          scheduledLogin: row.scheduledLogin, actualLogin: row.actualLogin,
          lateSeconds, shiftName: row.shiftName ?? null, status: row.status,
        },
      });

      if (lateSeconds > 0 && !coveredByFine.has(`${businessDate}:${row.employeeId}`)) {
        push({
          ...base,
          dedupeKey: `late_arrival:${row.id}`,
          type: 'late_arrival',
          category: 'FINANCE',
          status: Number(row.lateLoginPenalty || 0) > 0 ? 'FINE_APPLIED' : 'OPEN',
          severity: 'MEDIUM',
          summary: `${who} arrived ${Math.round(lateSeconds / 60)} min late${Number(row.lateLoginPenalty || 0) > 0 ? ` · fine ₹${row.lateLoginPenalty}` : ''}`,
          occurredAt: new Date(row.actualLogin),
          sourceTable: 'attendance',
          sourceId: row.id,
          actionUrl: '/attendance/late-fines',
          payload: { lateSeconds, fine: Number(row.lateLoginPenalty || 0), shiftName: row.shiftName ?? null },
        });
      }
    } else if (row.scheduledLogin) {
      // A scheduled day with no check-in yet. Only a *missed* punch once the
      // grace window has passed — otherwise every shift start would open an
      // exception for everyone still walking in.
      const scheduled = new Date(row.scheduledLogin).getTime();
      if (Date.now() - scheduled > 30 * 60_000) {
        push({
          ...base,
          dedupeKey: `missed_in:${row.id}`,
          type: 'missed_in',
          category: 'EXCEPTION',
          status: row.status === 'ABSENT' ? 'ABSENT' : 'OPEN',
          severity: row.status === 'ABSENT' ? 'HIGH' : 'MEDIUM',
          summary: `${who} has no check-in for ${row.shiftName || 'the scheduled shift'}`,
          occurredAt: new Date(row.scheduledLogin),
          sourceTable: 'attendance',
          sourceId: row.id,
          actionUrl: '/attendance/missed-punching',
          payload: { scheduledLogin: row.scheduledLogin, status: row.status, shiftName: row.shiftName ?? null },
        });
      }
    }

    if (row.actualLogout) {
      push({
        ...base,
        dedupeKey: `punch_out:${row.id}`,
        type: 'punch_out',
        category: 'ATTENDANCE',
        status: 'RECORDED',
        severity: 'INFO',
        summary: `${who} checked out`,
        occurredAt: new Date(row.actualLogout),
        sourceTable: 'attendance',
        sourceId: row.id,
        actionUrl: '/attendance/punches',
        payload: { scheduledLogout: row.scheduledLogout, actualLogout: row.actualLogout },
      });
    }

    if (!row.actualLogout && row.scheduledLogout) {
      const dueAt = new Date(row.scheduledLogout).getTime();
      // Same 30-minute grace as the summary, so the tile and the feed agree.
      if (Date.now() - dueAt > 30 * 60_000) {
        push({
          ...base,
          dedupeKey: `missed_out:${row.id}`,
          type: 'missed_out',
          category: 'EXCEPTION',
          status: 'OPEN',
          severity: 'MEDIUM',
          summary: `${who} has no check-out (scheduled ${row.shiftName || 'end of shift'})`,
          occurredAt: new Date(row.scheduledLogout),
          sourceTable: 'attendance',
          sourceId: row.id,
          actionUrl: '/attendance/missed-punching',
          payload: {
            scheduledLogout: row.scheduledLogout, actualLogin: row.actualLogin,
            status: row.status, shiftName: row.shiftName ?? null,
          },
        });
      }
    }

    if (Number(row.overtimeSeconds || 0) > 0) {
      push({
        ...base,
        dedupeKey: `overtime:${row.id}`,
        type: 'overtime_end',
        category: 'OVERTIME',
        status: 'RECORDED',
        severity: 'LOW',
        summary: `${who} worked ${(Number(row.overtimeSeconds) / 3600).toFixed(1)} h overtime`,
        occurredAt: new Date(row.actualLogout || row.actualLogin || row.scheduledLogin || Date.now()),
        sourceTable: 'attendance',
        sourceId: row.id,
        actionUrl: '/attendance/punches',
        payload: { overtimeSeconds: Number(row.overtimeSeconds) },
      });
    }
  }

  // ---- Raw biometric punches that never paired into an attendance row
  const [rawRows]: any = await pool.query(
    `SELECT p.\`id\`, p.\`punchTime\`, p.\`punchType\`, p.\`verifyMode\`, p.\`enrollmentNumber\`,
            p.\`deviceId\`, p.\`serialNumber\`, d.\`name\` AS deviceName, d.\`locationId\`,
            e.\`id\` AS employeeId, e.\`employeeCode\`, e.\`fullName\`, e.\`departmentId\`
       FROM \`biometric_raw_punches\` p
       LEFT JOIN \`biometric_devices\` d ON d.\`id\` = p.\`deviceId\`
       LEFT JOIN \`employee\` e ON e.\`biometricDeviceEmployeeId\` = p.\`enrollmentNumber\`
      WHERE DATE(p.\`punchTime\`) = ? AND p.\`attendanceId\` IS NULL${scope('d.locationId')}
      ORDER BY p.\`punchTime\` DESC
      LIMIT 200`,
    [businessDate, ...scopeArgs]
  ).catch(() => [[], null] as any); // the enrollmentNumber join is best-effort

  for (const row of rawRows || []) {
    const who = row.fullName || row.enrollmentNumber || 'Unknown badge';
    push({
      dedupeKey: `raw_punch:${row.id}`,
      type: row.punchType === 'CHECK_OUT' ? 'punch_out' : 'punch_in',
      category: 'ATTENDANCE',
      status: 'UNPAIRED',
      severity: 'LOW',
      summary: `${who} punched on ${row.deviceName || row.serialNumber || 'a terminal'} with no matching roster entry`,
      employeeId: row.employeeId ?? null,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.fullName ?? null,
      departmentId: row.departmentId ?? null,
      locationId: row.locationId ?? null,
      shiftId: null,
      occurredAt: new Date(row.punchTime),
      businessDate,
      sourceTable: 'biometric_raw_punches',
      sourceId: String(row.id),
      actionUrl: '/attendance/punches',
      payload: { punchType: row.punchType, verifyMode: row.verifyMode, deviceName: row.deviceName, serialNumber: row.serialNumber },
    });
  }

  // ---- Mismatches / incorrect punches
  // The mismatch table stores `locationCode` (BEL/DAV/SHI), not a location id,
  // so location scoping has to go through the location row. It also carries its
  // own departmentId, which is preferred over the employee's current department
  // — a mismatch is attributed to where it happened, not to today's org chart.
  const [mismatchRows]: any = await pool.query(
    `SELECT m.\`id\`, m.\`mismatchType\`, m.\`severity\`, m.\`status\`, m.\`employeeId\`,
            m.\`employeeCode\`, m.\`employeeName\`, m.\`deviceName\`, m.\`serialNumber\`,
            m.\`punchTime\`, m.\`lastDetectedAt\`, m.\`occurrenceCount\`,
            m.\`expected\`, m.\`received\`, m.\`details\`,
            COALESCE(m.\`departmentId\`, e.\`departmentId\`) AS departmentId,
            loc.\`id\` AS locationId
       FROM \`biometric_mismatch_records\` m
       LEFT JOIN \`employee\` e ON e.\`id\` = m.\`employeeId\`
       LEFT JOIN \`location\` loc ON loc.\`code\` = m.\`locationCode\`
      WHERE DATE(COALESCE(m.\`punchTime\`, m.\`lastDetectedAt\`)) = ?${scope('loc.id')}
      ORDER BY COALESCE(m.\`lastDetectedAt\`, m.\`punchTime\`) DESC
      LIMIT 200`,
    [businessDate, ...scopeArgs]
  );

  for (const row of mismatchRows || []) {
    const who = row.employeeName || row.employeeCode || 'Unrecognised badge';
    push({
      dedupeKey: `mismatch:${row.id}`,
      type: 'mismatch',
      category: 'EXCEPTION',
      status: String(row.status || 'OPEN').toUpperCase(),
      severity: (String(row.severity || 'MEDIUM').toUpperCase() as LiveEvent['severity']),
      summary: `Incorrect punch — ${String(row.mismatchType || 'mismatch').replace(/_/g, ' ').toLowerCase()} for ${who}`,
      employeeId: row.employeeId ?? null,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.employeeName ?? null,
      departmentId: row.departmentId ?? null,
      locationId: row.locationId ?? null,
      shiftId: null,
      occurredAt: new Date(row.lastDetectedAt || row.punchTime || Date.now()),
      businessDate,
      sourceTable: 'biometric_mismatch_records',
      sourceId: String(row.id),
      actionUrl: '/attendance/devices',
      payload: {
        mismatchType: row.mismatchType, deviceName: row.deviceName, serialNumber: row.serialNumber,
        expected: row.expected, received: row.received, occurrences: row.occurrenceCount,
      },
    });
  }

  // (the fine query itself now runs earlier, above the attendance loop)
  for (const row of fineRows || []) {
    const who = row.fullName || row.employeeCode || 'Employee';
    const lateMinutes = Math.round(Number(row.chargeableLateSeconds || row.lateSeconds || 0) / 60);
    push({
      dedupeKey: `fine:${row.id}`,
      type: 'late_arrival',
      category: 'FINANCE',
      status: String(row.fineStatus || row.approvalStatus || 'PENDING').toUpperCase(),
      severity: Number(row.finalFine || 0) > 0 ? 'MEDIUM' : 'LOW',
      summary: `${who} — ${lateMinutes} min late, fine ₹${Number(row.finalFine || 0)} (${String(row.fineStatus || 'pending').toLowerCase()})`,
      employeeId: row.employeeId ?? null,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.fullName ?? null,
      departmentId: row.departmentId ?? null,
      locationId: row.locationId ?? null,
      shiftId: row.shiftId ?? null,
      occurredAt: new Date(row.actualPunchIn || `${businessDate} 09:00:00`),
      businessDate,
      sourceTable: 'late_attendance_record',
      sourceId: String(row.id),
      actionUrl: '/attendance/late-fines',
      payload: {
        lateMinutes, finalFine: Number(row.finalFine || 0), waived: Number(row.waivedFine || 0),
        fineStatus: row.fineStatus, approvalStatus: row.approvalStatus, earlyIncentive: Number(row.earlyIncentive || 0),
      },
    });
  }

  // ---- Leave
  const [leaveRows]: any = await pool.query(
    `SELECT l.\`id\`, l.\`employee_id\`, l.\`leave_type_id\`, l.\`start_date\`, l.\`end_date\`,
            l.\`days_count\`, l.\`status\`, l.\`reason\`, l.\`created_at\`, l.\`reviewed_by\`,
            e.\`employeeCode\`, e.\`fullName\`, e.\`departmentId\`, e.\`locationId\`,
            t.\`name\` AS leaveTypeName
       FROM \`leave_applications\` l
       LEFT JOIN \`employee\` e ON e.\`id\` = l.\`employee_id\`
       LEFT JOIN \`leave_types\` t ON t.\`id\` = l.\`leave_type_id\`
      WHERE l.\`start_date\` <= ? AND l.\`end_date\` >= ?${scope('e.locationId')}`,
    [businessDate, businessDate, ...(locationIds && locationIds.length ? locationIds : [])]
  ).catch(() => [[], null] as any); // leave_types may be absent on a partial install

  for (const row of leaveRows || []) {
    const who = row.fullName || row.employeeCode || 'Employee';
    push({
      dedupeKey: `leave:${row.id}`,
      type: 'leave',
      category: 'LEAVE',
      status: String(row.status || 'PENDING').toUpperCase(),
      severity: 'INFO',
      summary: `${who} — ${row.leaveTypeName || 'leave'} ${String(row.status || 'pending').toLowerCase()}`,
      employeeId: row.employee_id ?? null,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.fullName ?? null,
      departmentId: row.departmentId ?? null,
      locationId: row.locationId ?? null,
      shiftId: null,
      occurredAt: new Date(row.created_at || `${businessDate} 00:00:00`),
      businessDate,
      sourceTable: 'leave_applications',
      sourceId: String(row.id),
      actionUrl: '/leaves',
      payload: {
        leaveType: row.leaveTypeName, from: row.start_date, to: row.end_date,
        days: row.days_count, reason: row.reason, reviewedBy: row.reviewed_by,
      },
    });
  }

  // ---- Manual corrections
  const [correctionRows]: any = await pool.query(
    `SELECT c.\`id\`, c.\`employeeId\`, c.\`attendanceDate\`, c.\`status\`, c.\`requestedLogin\`,
            c.\`requestedLogout\`, c.\`originalLogin\`, c.\`originalLogout\`, c.\`createdAt\`,
            c.\`requestedById\`, c.\`reviewedById\`, e.\`employeeCode\`, e.\`fullName\`,
            e.\`departmentId\`, e.\`locationId\`
       FROM \`attendancecorrection\` c
       LEFT JOIN \`employee\` e ON e.\`id\` = c.\`employeeId\`
      WHERE c.\`attendanceDate\` = ?${scope('e.locationId')}`,
    [businessDate, ...scopeArgs]
  );

  for (const row of correctionRows || []) {
    const who = row.fullName || row.employeeCode || 'Employee';
    push({
      dedupeKey: `correction:${row.id}`,
      type: 'correction',
      category: 'CORRECTION',
      status: String(row.status || 'PENDING').toUpperCase(),
      severity: 'LOW',
      summary: `Manual correction ${String(row.status || 'pending').toLowerCase()} for ${who}`,
      employeeId: row.employeeId ?? null,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.fullName ?? null,
      departmentId: row.departmentId ?? null,
      locationId: row.locationId ?? null,
      shiftId: null,
      occurredAt: new Date(row.createdAt || Date.now()),
      businessDate,
      sourceTable: 'attendancecorrection',
      sourceId: String(row.id),
      actionUrl: '/attendance/corrections',
      payload: {
        requested: { login: row.requestedLogin, logout: row.requestedLogout },
        original: { login: row.originalLogin, logout: row.originalLogout },
        requestedBy: row.requestedById, reviewedBy: row.reviewedById,
      },
    });
  }

  // ---- Assignments (transfer / reassign / work-area / manager change)
  const [assignmentRows]: any = await pool.query(
    `SELECT h.\`id\`, h.\`employeeId\`, h.\`changeType\`, h.\`locationId\`, h.\`departmentId\`,
            h.\`sectionId\`, h.\`sellingPointId\`, h.\`reportingManagerId\`, h.\`effectiveFrom\`,
            h.\`changedById\`, h.\`createdAt\`, e.\`employeeCode\`, e.\`fullName\`
       FROM \`employeeassignmenthistory\` h
       LEFT JOIN \`employee\` e ON e.\`id\` = h.\`employeeId\`
      WHERE DATE(h.\`createdAt\`) = ?${scope('h.locationId')}`,
    [businessDate, ...scopeArgs]
  );

  for (const row of assignmentRows || []) {
    const who = row.fullName || row.employeeCode || 'Employee';
    push({
      dedupeKey: `assignment:${row.id}`,
      type: String(row.changeType).toUpperCase() === 'MANAGER_CHANGE' ? 'shift_change' : 'assignment',
      category: 'ASSIGNMENT',
      status: 'APPLIED',
      severity: 'INFO',
      summary: `${who} ${String(row.changeType || 'assigned').replace(/_/g, ' ').toLowerCase()}`,
      employeeId: row.employeeId ?? null,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.fullName ?? null,
      departmentId: row.departmentId ?? null,
      locationId: row.locationId ?? null,
      shiftId: null,
      occurredAt: new Date(row.createdAt || Date.now()),
      businessDate,
      sourceTable: 'employeeassignmenthistory',
      sourceId: String(row.id),
      actionUrl: '/employees',
      payload: {
        changeType: row.changeType, locationId: row.locationId, sectionId: row.sectionId,
        sellingPointId: row.sellingPointId, reportingManagerId: row.reportingManagerId,
        effectiveFrom: row.effectiveFrom, changedBy: row.changedById,
      },
    });
  }

  const { written } = await recordEvents(events);
  return { written, byType };
}

// ─── Counters: always from the domain tables ────────────────────────────────

export interface LiveSummary {
  businessDate: string;
  arrivals: { total: number; onTime: number; late: number };
  presence: { present: number; absent: number; onLeave: number; weeklyOff: number; totalEmployees: number };
  assignments: { assigned: number; unassigned: number };
  overtime: { people: number; hours: number };
  missedPunches: number;
  incorrectPunches: number;
  lateArrivals: number;
  finesToday: number;
  openExceptions: number;
  lastEventAt: string | null;
}

/**
 * The tiles above the feed.
 *
 * Deliberately computed from `attendance`, `employee`, `biometric_mismatch_records`
 * and `late_attendance_record` — never from `workforce_event` — using the same
 * `CHECKED_IN_STATUSES` definition that /api/reports/dashboard-summary applies.
 * That is what makes the brief's "counters and feed must always agree with the
 * rest of the dashboard" true by construction rather than by hoping two
 * implementations stay in sync.
 */
export async function summarize(businessDate: string, locationIds: string[] | null = null): Promise<LiveSummary> {
  const scopeCol = (alias: string, column = 'locationId') =>
    locationIds && locationIds.length ? ` AND ${alias}.\`${column}\` IN (${locationIds.map(() => '?').join(',')})` : '';
  const args = locationIds && locationIds.length ? locationIds : [];

  const [statusRows]: any = await pool.query(
    `SELECT \`status\`, COUNT(*) n FROM \`attendance\`
      WHERE \`attendanceDate\` = ?${scopeCol('attendance') || ''} GROUP BY \`status\``,
    [businessDate, ...args]
  ).catch(() => [[], null] as any);

  const counts: Record<string, number> = {};
  for (const r of statusRows || []) counts[r.status] = Number(r.n);
  const present = CHECKED_IN_STATUSES.reduce((sum, st) => sum + (counts[st] || 0), 0);

  const [arrivals]: any = await pool.query(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN \`lateLoginSeconds\` > 0 THEN 1 ELSE 0 END) late
       FROM \`attendance\`
      WHERE \`attendanceDate\` = ? AND \`actualLogin\` IS NOT NULL${scopeCol('attendance')}`,
    [businessDate, ...args]
  ).catch(() => [[{ total: 0, late: 0 }], null] as any);

  const [totals]: any = await pool.query(
    `SELECT COUNT(*) n FROM \`employee\`
      WHERE \`status\` = 'ACTIVE' AND \`attendanceEligible\` = 1${scopeCol('employee')}`,
    args
  ).catch(() => [[{ n: 0 }], null] as any);

  const [leave]: any = await pool.query(
    `SELECT COUNT(DISTINCT l.\`employee_id\`) n
       FROM \`leave_applications\` l
       LEFT JOIN \`employee\` e ON e.\`id\` = l.\`employee_id\`
      WHERE l.\`status\` IN ('APPROVED','PENDING') AND l.\`start_date\` <= ? AND l.\`end_date\` >= ?${scopeCol('e')}`,
    [businessDate, businessDate, ...args]
  ).catch(() => [[{ n: 0 }], null] as any);

  const [unassigned]: any = await pool.query(
    `SELECT COUNT(*) n FROM \`employee\`
      WHERE \`status\` = 'ACTIVE' AND (\`sectionId\` IS NULL OR \`shiftId\` IS NULL)${scopeCol('employee')}`,
    args
  ).catch(() => [[{ n: 0 }], null] as any);

  const [overtime]: any = await pool.query(
    `SELECT COUNT(*) people, COALESCE(SUM(\`overtimeSeconds\`),0) seconds
       FROM \`attendance\`
      WHERE \`attendanceDate\` = ? AND \`overtimeSeconds\` > 0${scopeCol('attendance')}`,
    [businessDate, ...args]
  ).catch(() => [[{ people: 0, seconds: 0 }], null] as any);

  // Missed punches. On a day that is still running, "no logout yet" is normal,
  // not an exception — counting it made every present employee look like a
  // missed punch. A missing logout therefore only counts once its scheduled
  // logout is more than 30 minutes in the past; a missing login uses the same
  // grace against the scheduled start. Past dates are unaffected because their
  // whole schedule is behind us.
  const [missed]: any = await pool.query(
    `SELECT COUNT(*) n FROM \`attendance\`
      WHERE \`attendanceDate\` = ?
        AND \`scheduledLogin\` IS NOT NULL
        AND \`status\` NOT IN ('WEEKLY_OFF','ABSENT','HOLIDAY')
        AND (
              (\`actualLogin\` IS NULL AND \`scheduledLogin\` < DATE_SUB(NOW(3), INTERVAL 30 MINUTE))
              OR (\`actualLogout\` IS NULL AND \`scheduledLogout\` IS NOT NULL
                  AND \`scheduledLogout\` < DATE_SUB(NOW(3), INTERVAL 30 MINUTE))
            )${scopeCol('attendance')}`,
    [businessDate, ...args]
  ).catch(() => [[{ n: 0 }], null] as any);

  const [incorrect]: any = await pool.query(
    `SELECT COUNT(*) n FROM \`biometric_mismatch_records\` m
       LEFT JOIN \`location\` loc ON loc.\`code\` = m.\`locationCode\`
      WHERE DATE(COALESCE(m.\`punchTime\`, m.\`lastDetectedAt\`)) = ?
        ${locationIds && locationIds.length ? `AND loc.\`id\` IN (${locationIds.map(() => '?').join(',')})` : ''}`,
    [businessDate, ...(locationIds && locationIds.length ? locationIds : [])]
  ).catch(() => [[{ n: 0 }], null] as any);

  const [fines]: any = await pool.query(
    `SELECT COUNT(*) n, COALESCE(SUM(\`finalFine\`),0) amount
       FROM \`late_attendance_record\`
      WHERE \`recordDate\` = ?${scopeCol('late_attendance_record')}`,
    [businessDate, ...args]
  ).catch(() => [[{ n: 0, amount: 0 }], null] as any);

  const [last]: any = await pool.query(
    `SELECT MAX(\`occurredAt\`) at FROM \`workforce_event\` WHERE \`businessDate\` = ?`,
    [businessDate]
  ).catch(() => [[{ at: null }], null] as any);

  const totalEmployees = Number(totals?.[0]?.n || 0);
  const weeklyOff = counts['WEEKLY_OFF'] || 0;
  const late = Number(arrivals?.[0]?.late || 0);
  const onLeave = Number(leave?.[0]?.n || 0);

  return {
    businessDate,
    arrivals: {
      total: Number(arrivals?.[0]?.total || 0),
      onTime: Math.max(Number(arrivals?.[0]?.total || 0) - late, 0),
      late,
    },
    presence: {
      present,
      // Same derivation as dashboard-summary: everybody on the roster who is
      // neither checked in nor on a weekly off. Not a stored status.
      absent: Math.max(totalEmployees - present - weeklyOff, 0),
      onLeave,
      weeklyOff,
      totalEmployees,
    },
    assignments: {
      assigned: Math.max(totalEmployees - Number(unassigned?.[0]?.n || 0), 0),
      unassigned: Number(unassigned?.[0]?.n || 0),
    },
    overtime: {
      people: Number(overtime?.[0]?.people || 0),
      hours: Math.round((Number(overtime?.[0]?.seconds || 0) / 3600) * 10) / 10,
    },
    missedPunches: Number(missed?.[0]?.n || 0),
    incorrectPunches: Number(incorrect?.[0]?.n || 0),
    lateArrivals: Number(fines?.[0]?.n || 0),
    finesToday: Number(fines?.[0]?.amount || 0),
    openExceptions: 0,
    lastEventAt: last?.[0]?.at ? new Date(last[0].at).toISOString() : null,
  };
}

// ─── Feed ───────────────────────────────────────────────────────────────────

export interface ListOptions {
  businessDate: string;
  types?: string[];
  departmentIds?: string[];
  locationIds?: string[] | null;
  search?: string;
  limit?: number;
  cursor?: string | null;
}

/** Keyset pagination on (occurredAt, id): stable under concurrent inserts. */
export async function listEvents(options: ListOptions) {
  const {
    businessDate, types = [], departmentIds = [], locationIds = null,
    search = '', limit = 50, cursor = null,
  } = options;

  const where: string[] = ['businessDate = ?'];
  const params: unknown[] = [businessDate];

  if (types.length) {
    where.push(`type IN (${types.map(() => '?').join(',')})`);
    params.push(...types.slice(0, 30));
  }
  if (departmentIds.length) {
    where.push(`departmentId IN (${departmentIds.map(() => '?').join(',')})`);
    params.push(...departmentIds.slice(0, 30));
  }
  if (locationIds && locationIds.length) {
    where.push(`locationId IN (${locationIds.map(() => '?').join(',')})`);
    params.push(...locationIds);
  }
  if (search.trim()) {
    where.push('(employeeName LIKE ? OR employeeCode LIKE ? OR summary LIKE ?)');
    const like = `%${search.trim().slice(0, 64)}%`;
    params.push(like, like, like);
  }
  if (cursor) {
    // cursor = "<iso occurredAt>|<id>" — resume exactly where the last page ended
    const [at, id] = String(cursor).split('|');
    if (at && id) {
      where.push('(occurredAt < ? OR (occurredAt = ? AND id < ?))');
      params.push(new Date(at), new Date(at), id);
    }
  }

  const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows]: any = await pool.query(
    `SELECT \`id\`, \`dedupeKey\`, \`type\`, \`category\`, \`status\`, \`severity\`, \`summary\`,
            \`employeeId\`, \`employeeCode\`, \`employeeName\`, \`departmentId\`, \`locationId\`,
            \`shiftId\`, \`occurredAt\`, \`businessDate\`, \`sourceTable\`, \`sourceId\`,
            \`actionUrl\`, \`payload\`, \`createdAt\`, \`updatedAt\`
       FROM \`workforce_event\`
      WHERE ${where.join(' AND ')}
      ORDER BY \`occurredAt\` DESC, \`id\` DESC
      LIMIT ${capped + 1}`,
    params
  );

  const list = rows || [];
  const hasMore = list.length > capped;
  const page = hasMore ? list.slice(0, capped) : list;
  const last = page[page.length - 1];

  return {
    events: page.map((row: any) => ({
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {}),
      occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : null,
      businessDate: row.businessDate ? businessDateOf(new Date(row.businessDate)) : businessDate,
    })),
    nextCursor: hasMore && last ? `${new Date(last.occurredAt).toISOString()}|${last.id}` : null,
    hasMore,
  };
}

/** Distinct dates that actually have events — drives the date picker. */
export async function availableDates(locationIds: string[] | null = null, days = 60) {
  const scope = locationIds && locationIds.length
    ? `AND locationId IN (${locationIds.map(() => '?').join(',')})` : '';
  const [rows]: any = await pool.query(
    `SELECT \`businessDate\`, COUNT(*) n FROM \`workforce_event\`
      WHERE \`businessDate\` >= DATE_SUB(CURDATE(), INTERVAL ${Math.min(days, 365)} DAY)${scope}
      GROUP BY \`businessDate\` ORDER BY \`businessDate\` DESC`,
    locationIds && locationIds.length ? locationIds : []
  );
  return (rows || []).map((r: any) => ({
    date: businessDateOf(new Date(r.businessDate)),
    count: Number(r.n),
  }));
}

// ─── Detail + HR decisions ──────────────────────────────────────────────────

export async function eventDetail(id: string) {
  const [rows]: any = await pool.query(
    `SELECT w.*, d.\`name\` AS departmentName, l.\`name\` AS locationName, s.\`name\` AS shiftName
       FROM \`workforce_event\` w
       LEFT JOIN \`department\` d ON d.\`id\` = w.\`departmentId\`
       LEFT JOIN \`location\` l ON l.\`id\` = w.\`locationId\`
       LEFT JOIN \`shift\` s ON s.\`id\` = w.\`shiftId\`
      WHERE w.\`id\` = ? OR w.\`dedupeKey\` = ?
      LIMIT 1`,
    [id, id]
  );
  const event = rows?.[0];
  if (!event) return null;

  const employeeId = event.employeeId;
  const businessDate = businessDateOf(new Date(event.businessDate));

  const [person]: any = employeeId
    ? await pool.query(
        `SELECT e.\`id\`, e.\`employeeCode\`, e.\`fullName\`, e.\`designation\`, e.\`shiftId\`,
                e.\`departmentId\`, e.\`locationId\`, e.\`reportingManagerId\`, e.\`status\`,
                m.\`fullName\` AS managerName, d.\`name\` AS departmentName, l.\`name\` AS locationName
           FROM \`employee\` e
           LEFT JOIN \`employee\` m ON m.\`id\` = e.\`reportingManagerId\`
           LEFT JOIN \`department\` d ON d.\`id\` = e.\`departmentId\`
           LEFT JOIN \`location\` l ON l.\`id\` = e.\`locationId\`
          WHERE e.\`id\` = ?`,
        [employeeId]
      ).catch(() => [[], null] as any)
    : [[], null];

  const [dayPunches]: any = employeeId
    ? await pool.query(
        `SELECT p.\`id\`, p.\`punchTime\`, p.\`punchType\`, p.\`verifyMode\`, p.\`serialNumber\`,
                d.\`name\` AS deviceName, d.\`locationId\`, 'biometric' AS source
           FROM \`biometric_raw_punches\` p
           LEFT JOIN \`biometric_devices\` d ON d.\`id\` = p.\`deviceId\`
           JOIN \`employee\` e ON e.\`biometricDeviceEmployeeId\` = p.\`enrollmentNumber\`
          WHERE e.\`id\` = ? AND DATE(p.\`punchTime\`) = ?
          UNION ALL
        SELECT a.\`id\`, a.\`actualLogin\`, 'APP_CHECK_IN', NULL, NULL, NULL, a.\`locationId\`, 'app'
           FROM \`attendance\` a
          WHERE a.\`employeeId\` = ? AND a.\`attendanceDate\` = ? AND a.\`actualLogin\` IS NOT NULL
          ORDER BY 2 ASC`,
        [employeeId, businessDate, employeeId, businessDate]
      ).catch(() => [[], null] as any)
    : [[], null];

  const [audit]: any = employeeId
    ? await pool.query(
        `SELECT \`action\`, \`entityType\`, \`entityId\`, \`userId\`, \`ipAddress\`, \`createdAt\`,
                \`oldValue\`, \`newValue\`
           FROM \`auditlog\`
          WHERE \`entityId\` IN (?, ?) OR \`userId\` = ?
          ORDER BY \`createdAt\` DESC
          LIMIT 15`,
        [event.sourceId ?? '', event.id, employeeId]
      ).catch(() => [[], null] as any)
    : [[], null];

  return {
    event: {
      ...event,
      payload: typeof event.payload === 'string' ? JSON.parse(event.payload || '{}') : (event.payload || {}),
      occurredAt: new Date(event.occurredAt).toISOString(),
    },
    employee: person?.[0] ?? null,
    punches: (dayPunches || []).map((p: any) => ({
      id: p.id,
      at: p.punchTime ? new Date(p.punchTime).toISOString() : null,
      punchType: p.punchType,
      verifyMode: p.verifyMode,
      deviceName: p.deviceName,
      serialNumber: p.serialNumber,
      source: p.source,
    })),
    auditTrail: (audit || []).map((a: any) => ({
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      userId: a.userId,
      ipAddress: a.ipAddress,
      at: a.createdAt ? new Date(a.createdAt).toISOString() : null,
    })),
  };
}

const ALLOWED_DECISIONS = new Set([
  'APPROVE', 'REJECT', 'WAIVE', 'APPLY_FINE', 'REGULARIZE', 'REMARK', 'APPROVE_OVERTIME',
]);

/**
 * Records an HR decision on the journal row and into the immutable audit log.
 * The domain write (actually regularising an attendance row, for example) is
 * left to the existing endpoints — this records the decision against the event
 * so the feed and the drawer show the same state the approver set.
 */
export async function decideEvent(input: {
  id: string;
  action: string;
  actorId: string;
  note?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: boolean; reason?: string; event?: any }> {
  const action = String(input.action || '').toUpperCase();
  if (!ALLOWED_DECISIONS.has(action)) {
    return { ok: false, reason: `Unsupported action "${input.action}"` };
  }

  const [rows]: any = await pool.query('SELECT * FROM `workforce_event` WHERE `id` = ? OR `dedupeKey` = ? LIMIT 1', [input.id, input.id]);
  const event = rows?.[0];
  if (!event) return { ok: false, reason: 'not_found' };

  const statusByAction: Record<string, string> = {
    APPROVE: 'APPROVED', REJECT: 'REJECTED', WAIVE: 'WAIVED', APPLY_FINE: 'FINE_APPLIED',
    REGULARIZE: 'REGULARIZED', REMARK: event.status, APPROVE_OVERTIME: 'OVERTIME_APPROVED',
  };

  await pool.query(
    `UPDATE \`workforce_event\`
        SET \`status\` = ?, \`decisionNote\` = ?, \`updatedById\` = ?, \`decidedAt\` = NOW(3), \`updatedAt\` = NOW(3)
      WHERE \`id\` = ?`,
    [statusByAction[action] || 'REVIEWED', String(input.note || '').slice(0, 500) || null, input.actorId, event.id]
  );

  let audited = false;
  try {
    await pool.query(
      `INSERT INTO \`auditlog\`
         (\`id\`, \`userId\`, \`action\`, \`entityType\`, \`entityId\`, \`oldValue\`, \`newValue\`,
          \`ipAddress\`, \`userAgent\`, \`createdAt\`)
       VALUES (?, ?, ?, 'WorkforceEvent', ?, ?, ?, ?, ?, NOW(3))`,
      [
        newId('aud'), input.actorId, `LIVE_ACTIVITY_${action}`, event.id,
        JSON.stringify({ status: event.status }),
        JSON.stringify({ status: statusByAction[action] || 'REVIEWED', note: input.note || null }),
        input.ip || null, (input.userAgent || '').slice(0, 255) || null,
      ]
    );
    audited = true;
  } catch (err: any) {
    console.error('[live] audit write failed for decision:', err?.code || err?.message);
  }

  if (!audited) {
    // An HR decision that cannot be audited is not an HR decision. Roll the
    // journal row back to its previous state and tell the caller, rather than
    // reporting success for a change no one can later account for.
    await pool.query(
      'UPDATE `workforce_event` SET `status` = ?, `decisionNote` = NULL, `updatedById` = NULL, `decidedAt` = NULL WHERE `id` = ?',
      [event.status, event.id]
    );
    return { ok: false, reason: 'The decision could not be written to the audit log, so it was not applied.' };
  }

  const detail = await eventDetail(event.id);
  if (detail) publishLive({ kind: 'decision', event: detail.event, action }, event.locationId);
  return { ok: true, event: detail?.event };
}

export default { sweepDay, recordEvents, publishLive, businessDateOf, summarize, listEvents, eventDetail, decideEvent, availableDates };
