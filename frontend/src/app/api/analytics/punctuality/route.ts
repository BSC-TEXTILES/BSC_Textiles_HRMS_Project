import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Punctuality drill-down data.
 *
 * Everything here is derived from the two backend endpoints that already exist:
 *   GET /api/attendance/today          — today's attendance rows (real punch times)
 *   GET /api/analysis/punctuality      — daily late/on-time aggregates from the DB
 *
 * Nothing is seeded, defaulted or "demonstrated". When the backend has no record
 * the field is null or an empty list and the drawer renders an empty state.
 */

const API_BASE = (
  process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api`
    : 'http://localhost:4000/api'
).replace(/\/+$/, '');

const GRACE_BUFFER_SECONDS = 300;
const TARGET_RATE = 95.0;
const WARNING_THRESHOLD = 90.0;

const AVATAR_PALETTE = ['#0058be', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

/** Forward the caller's session so the backend applies the same row scoping. */
async function backendGet(request: Request, path: string): Promise<any | null> {
  try {
    const cookie = request.headers.get('cookie');
    const authorization = request.headers.get('authorization');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cookie) headers.cookie = cookie;
    if (authorization) headers.authorization = authorization;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE}${path}`, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function departmentNameOf(row: any): string | null {
  const emp = row?.employee ?? {};
  const dept = emp.department ?? row?.department;
  if (typeof dept === 'string' && dept.trim()) return dept.trim();
  if (dept && typeof dept === 'object' && typeof dept.name === 'string' && dept.name.trim()) {
    return dept.name.trim();
  }
  return null;
}

function designationOf(row: any): string | null {
  const emp = row?.employee ?? {};
  return emp.designation ?? emp.floor ?? null;
}

/** Wall-clock time in the store's own zone, or null when nothing was punched. */
function clockTextOf(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function shiftLabelOf(row: any): string | null {
  const shift = row?.shift ?? row?.employee?.shift;
  if (!shift) return null;
  const name = typeof shift === 'string' ? shift : shift.name;
  const start = typeof shift === 'object' ? shift.startTime : null;
  if (!name) return null;
  return start ? `${name} (${String(start).slice(0, 5)})` : String(name);
}

/** Seconds between the scheduled and the actual clock-in; 0 when early/on time. */
function lateSecondsOf(row: any): number | null {
  if (!row?.actualLogin || !row?.scheduledLogin) return null;
  const logged = new Date(row.actualLogin).getTime();
  const scheduled = new Date(row.scheduledLogin).getTime();
  if (Number.isNaN(logged) || Number.isNaN(scheduled)) return null;
  if (row.lateLoginSeconds !== null && row.lateLoginSeconds !== undefined) {
    const stored = Number(row.lateLoginSeconds);
    if (Number.isFinite(stored) && stored >= 0) return stored;
  }
  return Math.max(0, Math.round((logged - scheduled) / 1000));
}

function isLateRow(row: any): boolean {
  if (String(row?.status || '').toUpperCase() === 'LATE') return true;
  const secs = lateSecondsOf(row);
  return secs !== null && secs > GRACE_BUFFER_SECONDS;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 86400000);

  const [todayPayload, trendPayload] = await Promise.all([
    backendGet(request, '/attendance/today'),
    backendGet(request, `/analysis/punctuality?startDate=${ymd(weekAgo)}&endDate=${ymd(today)}`),
  ]);

  const attendances: any[] = Array.isArray(todayPayload?.attendances)
    ? todayPayload.attendances
    : Array.isArray(todayPayload?.attendance)
      ? todayPayload.attendance
      : [];

  // Tab 1: late arrivals reported by today's attendance rows.
  const lateArrivals = attendances
    .filter((row) => isLateRow(row))
    .map((row) => {
      const emp = row.employee ?? {};
      const secs = lateSecondsOf(row) ?? 0;
      return {
        id: String(row.id),
        code: emp.employeeCode ?? null,
        name: emp.fullName ?? null,
        department: departmentNameOf(row),
        scheduledIn: clockTextOf(row.scheduledLogin),
        actualIn: clockTextOf(row.actualLogin),
        minutesLate: Math.round(secs / 60),
        reason: row.notes ?? row.lateReason ?? null,
        // A deduction is only reportable once the late-fine engine has produced
        // one for the row; today's attendance payload carries no approved amount.
        penaltyApplied: null,
        status: String(row.status ?? 'RECORDED'),
      };
    });

  // Tab 2: rows that clocked in after the bell but inside the grace buffer.
  const gracePeriodStaff = attendances
    .filter((row) => {
      if (String(row?.status || '').toUpperCase() === 'LATE') return false;
      const secs = lateSecondsOf(row);
      return secs !== null && secs > 0 && secs <= GRACE_BUFFER_SECONDS;
    })
    .map((row, idx) => {
      const emp = row.employee ?? {};
      const secs = lateSecondsOf(row) ?? 0;
      return {
        id: String(row.id),
        code: emp.employeeCode ?? null,
        name: emp.fullName ?? null,
        department: departmentNameOf(row),
        shiftName: shiftLabelOf(row),
        scheduledTime: clockTextOf(row.scheduledLogin),
        actualPunchTime: clockTextOf(row.actualLogin),
        graceUsedMinutes: Number((secs / 60).toFixed(1)),
        remainingGraceSeconds: Math.max(0, GRACE_BUFFER_SECONDS - secs),
        status: String(row.status ?? 'RECORDED'),
        verdict: `Marked On-Time — ${Number((secs / 60).toFixed(1))} min of the ${GRACE_BUFFER_SECONDS / 60}-minute grace buffer used`,
        avatar: AVATAR_PALETTE[idx % AVATAR_PALETTE.length],
      };
    });

  // Tab 3: department on-time split from the same real rows.
  const deptBuckets = new Map<string, { onTime: number; late: number }>();
  for (const row of attendances) {
    if (!row?.actualLogin) continue;
    const dept = departmentNameOf(row) ?? designationOf(row) ?? null;
    if (!dept) continue;
    const bucket = deptBuckets.get(dept) ?? { onTime: 0, late: 0 };
    if (isLateRow(row)) bucket.late += 1;
    else bucket.onTime += 1;
    deptBuckets.set(dept, bucket);
  }
  const departmentBreakdown = [...deptBuckets.entries()].map(([department, bucket]) => {
    const total = bucket.onTime + bucket.late;
    const onTimePct = total > 0 ? Number(((bucket.onTime / total) * 100).toFixed(1)) : null;
    return {
      department,
      onTimePct,
      target: TARGET_RATE,
      staffCount: total,
      status:
        onTimePct === null
          ? 'No data reported'
          : onTimePct >= TARGET_RATE
            ? 'At or above target'
            : 'Below target',
    };
  });

  // Tab 4: daily punctuality curve straight from the analysis service.
  const trendRows: any[] = Array.isArray(trendPayload?.trend) ? trendPayload.trend : [];
  const sevenDayTrends = trendRows
    .filter((row) => Number(row.totalRecords || 0) > 0)
    .map((row) => {
      const total = Number(row.totalRecords);
      const late = Number(row.lateCount || 0);
      return {
        day: row.label ?? row.date ?? '—',
        punctualityRate: Number((((total - late) / total) * 100).toFixed(1)),
        target: TARGET_RATE,
        lateCount: late,
        isCurrent: String(row.date || '').slice(0, 10) === ymd(today),
      };
    });

  const onTimeEmployees = attendances.filter(
    (row) => row?.actualLogin && !isLateRow(row)
  ).length;
  const lateArrivalsCount = lateArrivals.length;
  const measured = onTimeEmployees + lateArrivalsCount;
  const currentPunctualityRate =
    measured > 0 ? Number(((onTimeEmployees / measured) * 100).toFixed(1)) : null;

  return NextResponse.json({
    success: true,
    data: {
      metrics: {
        currentPunctualityRate,
        onTimeEmployees,
        gracePeriodEmployees: gracePeriodStaff.length,
        lateArrivalsCount,
        targetRate: TARGET_RATE,
        warningThreshold: WARNING_THRESHOLD,
        isWarningTriggered:
          currentPunctualityRate !== null && currentPunctualityRate < WARNING_THRESHOLD,
        hasRecords: measured > 0,
      },
      lateArrivals,
      gracePeriodStaff,
      departmentBreakdown,
      sevenDayTrends,
    },
    timestamp: new Date().toISOString(),
  });
}
