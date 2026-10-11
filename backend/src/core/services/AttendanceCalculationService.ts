/**
 * Shared attendance calculation rules for the Attendance & Shifts module.
 *
 * Single source of truth for shift windows (including overnight shifts),
 * punch duration maths and derived display statuses, so the Shift Board API
 * and any other consumer (reports, payroll previews) agree on the numbers.
 *
 * All functions here are pure — they never touch the database and never
 * fabricate data: missing punches stay null/zero and unknown days fall back
 * to honest derived statuses instead of invented values.
 */

export interface ShiftLike {
  id?: string;
  name?: string;
  code?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  gracePeriod?: number | null;
  lateThreshold?: number | null;
}

export interface ShiftWindow {
  /** Scheduled login instant (local calendar date of the work day). */
  start: Date;
  /** Scheduled logout instant — next calendar day for overnight shifts. */
  end: Date;
  /** True when the shift ends on the following calendar day. */
  overnight: boolean;
}

export interface Durations {
  /** Seconds worked before the scheduled login (positive when early). */
  earlyLoginSeconds: number;
  /** Seconds late beyond the shift's late threshold (stored semantics). */
  lateLoginSeconds: number;
  /** Raw lateness in seconds regardless of grace/late threshold. */
  lateRawSeconds: number;
  /** Seconds left before the scheduled logout. */
  earlyLogoutSeconds: number;
  /** Seconds worked beyond the scheduled logout. */
  overtimeSeconds: number;
  /** Seconds between actual login and actual logout (0 when incomplete). */
  totalWorkingSeconds: number;
}

export type DisplayStatus =
  | 'PRESENT'
  | 'CHECKED_OUT'
  | 'PUNCHED_IN'
  | 'LATE'
  | 'ON_BREAK'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'WEEKLY_OFF'
  | 'HOLIDAY'
  | 'NOT_PUNCHED_IN'
  | 'INCOMPLETE'
  | 'SCHEDULED';

/** Statuses that count as "present on the floor" for KPIs and filters. */
const PRESENT_FAMILY: DisplayStatus[] = ['PRESENT', 'CHECKED_OUT', 'PUNCHED_IN', 'LATE', 'ON_BREAK'];

/** Attendance statuses that mean the employee is currently on a break. */
const BREAK_STATUSES = new Set(['ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK', 'LEFT_STORE']);

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strictly validates a yyyy-mm-dd calendar date (rejects 2026-02-30). */
export function isValidYmd(v: any): boolean {
  if (typeof v !== 'string' || !YMD_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** yyyy-mm-dd of `d` (default: now) using the local calendar. */
export function todayYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Day-of-week enum name used by the `weeklyoffrule.dayOfWeek` column. */
export function weekdayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Milliseconds since local midnight for a Date / ISO string / "HH:MM(:SS)". */
export function timeOfDayMs(v: Date | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return ((v.getHours() * 60 + v.getMinutes()) * 60 + v.getSeconds()) * 1000;
  }
  const s = String(v);
  const isoTime = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (isoTime) {
    return (Number(isoTime[1]) * 3600 + Number(isoTime[2]) * 60 + Number(isoTime[3] || 0)) * 1000;
  }
  const plain = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (plain) {
    return (Number(plain[1]) * 3600 + Number(plain[2]) * 60 + Number(plain[3] || 0)) * 1000;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000;
}

/** Builds a local calendar Date from yyyy-mm-dd plus ms-since-midnight. */
function instantFromYmd(ymd: string, msInDay: number): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(y, m - 1, d, 0, 0, 0, 0);
  return new Date(base.getTime() + msInDay);
}

/**
 * Scheduled window for a shift on a work date. Shift times are stored with a
 * dummy calendar day, so the time-of-day is re-anchored to the work date and
 * a shift whose end time is at or before its start rolls to the next day
 * (e.g. Night Shift 16:30 → 01:30).
 */
export function computeShiftWindow(shift: ShiftLike | null | undefined, workDateYmd: string): ShiftWindow | null {
  if (!shift) return null;
  const startMs = timeOfDayMs(shift.startTime);
  const endMs = timeOfDayMs(shift.endTime);
  if (startMs === null || endMs === null || !isValidYmd(workDateYmd)) return null;
  const start = instantFromYmd(workDateYmd, startMs);
  const overnight = endMs <= startMs;
  const end = instantFromYmd(workDateYmd, endMs + (overnight ? 24 * 60 * 60 * 1000 : 0));
  return { start, end, overnight };
}

/** Window taken straight from a record's scheduled login/logout instants. */
export function windowFromScheduled(
  scheduledLogin: Date | string | null | undefined,
  scheduledLogout: Date | string | null | undefined
): ShiftWindow | null {
  if (!scheduledLogin || !scheduledLogout) return null;
  const start = new Date(scheduledLogin);
  const end = new Date(scheduledLogout);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end, overnight: end.getTime() <= start.getTime() };
}

/**
 * Duration maths for one punch pair. Follows the same conventions as
 * POST /api/attendance: `lateLoginSeconds` is only populated beyond the late
 * threshold, while `lateRawSeconds` always reports the raw lateness so the UI
 * can show "late by Xm" even inside grace.
 */
export function computeDurations(
  window: ShiftWindow | null,
  actualLogin: Date | string | null | undefined,
  actualLogout: Date | string | null | undefined,
  lateThresholdMinutes?: number | null
): Durations {
  const out: Durations = {
    earlyLoginSeconds: 0,
    lateLoginSeconds: 0,
    lateRawSeconds: 0,
    earlyLogoutSeconds: 0,
    overtimeSeconds: 0,
    totalWorkingSeconds: 0,
  };

  const inDate = actualLogin ? new Date(actualLogin) : null;
  const outDate = actualLogout ? new Date(actualLogout) : null;
  const hasIn = !!inDate && !isNaN(inDate.getTime());
  const hasOut = !!outDate && !isNaN(outDate.getTime());

  if (hasIn && hasOut && inDate && outDate) {
    out.totalWorkingSeconds = Math.max(0, Math.floor((outDate.getTime() - inDate.getTime()) / 1000));
  }

  if (window && hasIn && inDate) {
    const diffMs = inDate.getTime() - window.start.getTime();
    if (diffMs < 0) {
      out.earlyLoginSeconds = Math.floor(-diffMs / 1000);
    } else {
      out.lateRawSeconds = Math.floor(diffMs / 1000);
      const thresholdSec = (lateThresholdMinutes ?? 5) * 60;
      if (out.lateRawSeconds > thresholdSec) out.lateLoginSeconds = out.lateRawSeconds;
    }
  }

  if (window && hasOut && outDate) {
    const diffMs = outDate.getTime() - window.end.getTime();
    if (diffMs < 0) {
      out.earlyLogoutSeconds = Math.floor(-diffMs / 1000);
    } else {
      out.overtimeSeconds = Math.floor(diffMs / 1000);
    }
  }

  return out;
}

export interface StatusContext {
  /** Stored attendance.status for the day, if a record exists. */
  recordStatus?: string | null;
  actualLogin?: Date | string | null;
  actualLogout?: Date | string | null;
  /** Approved leave covers this date. */
  isLeave: boolean;
  /** Holiday configured for the location/department on this date. */
  isHoliday: boolean;
  /** Weekly-off rule (location/dept/employee scope) matches this date. */
  isWeeklyOff: boolean;
  /** An employee break is currently ACTIVE for the day. */
  onBreak: boolean;
  window: ShiftWindow | null;
  durations: Durations;
  /** yyyy-mm-dd of the work day being rendered. */
  workDate: string;
  /** yyyy-mm-dd of "now". */
  today: string;
  /** Local now. */
  now: Date;
  lateThresholdMinutes?: number | null;
}

export interface StatusResult {
  status: DisplayStatus;
  /** Beyond the shift's late threshold (or the record says LATE). */
  isLate: boolean;
  /** Minutes late (raw, including time inside grace). */
  lateMinutes: number;
  isException: boolean;
}

export function isPresentFamily(status: DisplayStatus): boolean {
  return PRESENT_FAMILY.includes(status);
}

/**
 * Derives the display status for one employee/day.
 *
 * Priority: stored WEEKLY_OFF → punches → leave → holiday → weekly-off rule →
 * stored ABSENT → date-relative schedule checks. No punch data is ever
 * invented; future dates stay SCHEDULED and past dates without punches are
 * ABSENT (or NOT_PUNCHED_IN while today's shift is still running).
 */
export function deriveDisplayStatus(ctx: StatusContext): StatusResult {
  const lateMinutes = Math.round(ctx.durations.lateRawSeconds / 60);
  const threshold = (ctx.lateThresholdMinutes ?? 5) * 60;
  const isLate =
    ctx.recordStatus === 'LATE' || ctx.durations.lateRawSeconds > threshold;

  const finish = (status: DisplayStatus, isException: boolean): StatusResult => {
    const present = isPresentFamily(status);
    return {
      status,
      isLate: isLate && present,
      lateMinutes: isLate && present ? lateMinutes : 0,
      isException,
    };
  };

  if (ctx.recordStatus === 'WEEKLY_OFF') return finish('WEEKLY_OFF', false);

  const hasIn = !!ctx.actualLogin;
  const hasOut = !!ctx.actualLogout;
  const windowEndMs = ctx.window ? ctx.window.end.getTime() : null;
  const isPast = ctx.workDate < ctx.today;
  const isToday = ctx.workDate === ctx.today;

  if (hasIn || hasOut) {
    if (ctx.onBreak || (ctx.recordStatus && BREAK_STATUSES.has(ctx.recordStatus))) {
      return finish('ON_BREAK', false);
    }
    if (hasIn && hasOut) {
      return isLate ? finish('LATE', true) : finish('CHECKED_OUT', false);
    }
    if (hasIn && !hasOut) {
      if (windowEndMs !== null && ctx.now.getTime() > windowEndMs) {
        // The shift window has closed without an OUT punch.
        if (isPast || isToday) return finish('INCOMPLETE', true);
      }
      return isLate ? finish('LATE', true) : finish('PUNCHED_IN', false);
    }
    // OUT without IN — data problem, flag it.
    return finish('INCOMPLETE', true);
  }

  if (ctx.isLeave) return finish('ON_LEAVE', false);
  if (ctx.isHoliday) return finish('HOLIDAY', false);
  if (ctx.isWeeklyOff) return finish('WEEKLY_OFF', false);
  if (ctx.recordStatus === 'ABSENT') return finish('ABSENT', true);

  if (ctx.workDate > ctx.today) return finish('SCHEDULED', false);

  if (isToday) {
    const dueMs = windowEndMs ?? null;
    if (dueMs !== null && ctx.now.getTime() > dueMs) return finish('ABSENT', true);
    return finish('NOT_PUNCHED_IN', true);
  }

  return finish('ABSENT', true);
}

/** Maps a filter token (from the UI) onto a derived row. */
export function statusMatchesFilter(status: DisplayStatus, isLate: boolean, filter?: string | null): boolean {
  if (!filter || filter === 'all') return true;
  switch (filter) {
    case 'PRESENT':
      return isPresentFamily(status);
    case 'PUNCHED_IN':
      return status === 'PUNCHED_IN' || status === 'ON_BREAK';
    case 'CHECKED_OUT':
      return status === 'CHECKED_OUT';
    case 'LATE':
      return isLate || status === 'LATE';
    default:
      return status === filter;
  }
}

/** Exception rows surfaced by the Grace Period / regularization view. */
export function isExceptionStatus(status: DisplayStatus): boolean {
  return (
    status === 'ABSENT' ||
    status === 'NOT_PUNCHED_IN' ||
    status === 'INCOMPLETE' ||
    status === 'LATE'
  );
}

/** Human readable punch exception for a derived row (used by the modal/CSV). */
export function describeException(
  status: DisplayStatus,
  ctx: {
    durations: Durations;
    window: ShiftWindow | null;
    graceMinutes?: number | null;
    hasLogin: boolean;
    hasLogout: boolean;
    isPastDate: boolean;
    isLate: boolean;
  }
): { text: string; tone: 'green' | 'blue' | 'amber' | 'red' | 'slate'; isException: boolean } {
  switch (status) {
    case 'WEEKLY_OFF':
      return { text: 'Weekly Off', tone: 'slate', isException: false };
    case 'HOLIDAY':
      return { text: 'Holiday', tone: 'blue', isException: false };
    case 'ON_LEAVE':
      return { text: 'On Leave', tone: 'blue', isException: false };
    case 'SCHEDULED':
      return { text: 'Scheduled', tone: 'slate', isException: false };
    case 'ABSENT':
      return { text: 'Absent', tone: 'red', isException: true };
    case 'NOT_PUNCHED_IN':
      return { text: 'Not punched yet', tone: 'amber', isException: true };
    case 'INCOMPLETE':
      return ctx.hasLogin && !ctx.hasLogout
        ? { text: 'Missing OUT punch', tone: 'red', isException: true }
        : { text: 'Missing IN punch', tone: 'red', isException: true };
    case 'ON_BREAK':
      return { text: 'On break', tone: 'blue', isException: false };
    case 'PUNCHED_IN':
      return ctx.isLate
        ? { text: `Late by ${Math.round(ctx.durations.lateRawSeconds / 60)}m`, tone: 'amber', isException: true }
        : { text: 'Punched in', tone: 'green', isException: false };
    case 'CHECKED_OUT':
    case 'PRESENT':
    case 'LATE':
      break;
    default:
      break;
  }

  if (ctx.isLate) {
    const grace = (ctx.graceMinutes ?? 5) * 60;
    const lateSec = ctx.durations.lateRawSeconds;
    return lateSec <= grace
      ? { text: `Within grace (${Math.round(lateSec / 60)}m)`, tone: 'blue', isException: true }
      : { text: `Late by ${Math.round(lateSec / 60)}m`, tone: 'amber', isException: true };
  }
  if (ctx.durations.earlyLogoutSeconds > 0) {
    return { text: `Early exit ${Math.round(ctx.durations.earlyLogoutSeconds / 60)}m`, tone: 'amber', isException: true };
  }
  if (ctx.durations.overtimeSeconds > 0) {
    return { text: `Overtime ${Math.round(ctx.durations.overtimeSeconds / 60)}m`, tone: 'blue', isException: false };
  }
  return { text: 'On time', tone: 'green', isException: false };
}

/** Aggregated counters shared by KPI cards and per-shift cards. */
export interface BoardTally {
  rostered: number;
  present: number;
  checkedOut: number;
  onBreak: number;
  late: number;
  absent: number;
  onLeave: number;
  weeklyOff: number;
  holiday: number;
  notPunchedIn: number;
  incomplete: number;
  scheduled: number;
  missingPunch: number;
  withRecord: number;
}

export function emptyTally(): BoardTally {
  return {
    rostered: 0,
    present: 0,
    checkedOut: 0,
    onBreak: 0,
    late: 0,
    absent: 0,
    onLeave: 0,
    weeklyOff: 0,
    holiday: 0,
    notPunchedIn: 0,
    incomplete: 0,
    scheduled: 0,
    missingPunch: 0,
    withRecord: 0,
  };
}

export function tallyRows(rows: Array<{ status: DisplayStatus; isLate: boolean; hasRecord: boolean }>): BoardTally {
  const t = emptyTally();
  for (const r of rows) {
    t.rostered += 1;
    if (r.hasRecord) t.withRecord += 1;
    if (isPresentFamily(r.status)) t.present += 1;
    if (r.status === 'CHECKED_OUT') t.checkedOut += 1;
    if (r.status === 'ON_BREAK') t.onBreak += 1;
    if (r.isLate || r.status === 'LATE') t.late += 1;
    if (r.status === 'ABSENT') t.absent += 1;
    if (r.status === 'ON_LEAVE') t.onLeave += 1;
    if (r.status === 'WEEKLY_OFF') t.weeklyOff += 1;
    if (r.status === 'HOLIDAY') t.holiday += 1;
    if (r.status === 'NOT_PUNCHED_IN') t.notPunchedIn += 1;
    if (r.status === 'INCOMPLETE') t.incomplete += 1;
    if (r.status === 'SCHEDULED') t.scheduled += 1;
  }
  t.missingPunch = t.notPunchedIn + t.incomplete;
  return t;
}
