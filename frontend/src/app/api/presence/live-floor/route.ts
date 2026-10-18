import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Live floor presence drill-down.
 *
 * Built only from endpoints that already exist on the backend:
 *   GET /api/attendance/today        — today's attendance rows (who is on shift)
 *   GET /api/devices/attendance-log  — the real terminal punch events
 *   GET /api/employees               — the roster (denominator for occupancy)
 *
 * Anything the terminals or the database do not report (zone capacity, last
 * week's occupancy baseline, absence authorisations, optical latency) is null or
 * an empty list so the drawer renders an honest empty state instead of a
 * demonstration roster.
 */

const API_BASE = (
  process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api`
    : 'http://localhost:4000/api'
).replace(/\/+$/, '');

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

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function wallClock(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function textOr(value: any): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function departmentLabelOf(row: any): string | null {
  const dept = row?.departmentName ?? row?.department ?? row?.employee?.department;
  if (typeof dept === 'string') return dept.trim() || null;
  if (dept && typeof dept === 'object') return textOr(dept.name);
  return null;
}

const CHECKED_IN_STATUSES = new Set([
  'PRESENT',
  'EARLY',
  'LATE',
  'OVERTIME',
  'FACE_VERIFIED',
  'ON_LUNCH',
  'ON_TEA_BREAK',
]);

const COLOUR_PALETTE = ['#0058be', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9'];

export async function GET(request: Request) {
  const today = ymd(new Date());

  const [attendancePayload, logPayload, employeePayload] = await Promise.all([
    backendGet(request, '/attendance/today'),
    backendGet(request, `/devices/attendance-log?from=${today}&to=${today}&limit=300&sort=desc`),
    backendGet(request, '/employees?limit=500&page=1'),
  ]);

  const attendances: any[] = Array.isArray(attendancePayload?.attendances)
    ? attendancePayload.attendances
    : [];
  const punchRows: any[] = Array.isArray(logPayload?.rows) ? logPayload.rows : [];
  const roster: any[] = Array.isArray(employeePayload?.employees) ? employeePayload.employees : [];

  // Latest terminal read per employee code — used for zone, terminal and the
  // sensor feed. Unmatched device ids stay flagged, never renamed.
  const punchByCode = new Map<string, any>();
  for (const row of punchRows) {
    const code = textOr(row.employeeCode);
    if (!code) continue;
    const existing = punchByCode.get(code);
    if (!existing || String(row.punchTimeUtc || '') > String(existing.punchTimeUtc || '')) {
      punchByCode.set(code, row);
    }
  }

  const presentStaff = attendances
    .filter((row) => row?.actualLogin && CHECKED_IN_STATUSES.has(String(row.status || '').toUpperCase()))
    .map((row) => {
      const emp = row.employee ?? {};
      const code = textOr(emp.employeeCode) ?? textOr(row.employeeId);
      const punch = code ? punchByCode.get(code) : undefined;
      return {
        id: String(row.id),
        code: code ?? 'Unmatched device ID',
        name: textOr(emp.fullName) ?? 'Unmatched device ID',
        dept: departmentLabelOf(row) ?? departmentLabelOf(punch) ?? 'Not recorded',
        zone: textOr(punch?.floorName) ?? textOr(emp.floor?.name ?? emp.floor) ?? 'Floor not reported',
        role: textOr(emp.designation) ?? 'Designation not recorded',
        punchIn: wallClock(row.actualLogin),
        status: String(row.status ?? 'RECORDED'),
        terminal: textOr(punch?.deviceName),
      };
    });

  const missingStaff = attendances
    .filter((row) => !CHECKED_IN_STATUSES.has(String(row.status || '').toUpperCase()))
    .map((row) => {
      const emp = row.employee ?? {};
      const rawStatus = String(row.status ?? 'RECORDED').toUpperCase();
      return {
        id: String(row.id),
        code: textOr(emp.employeeCode) ?? textOr(row.employeeId) ?? 'Unmatched device ID',
        name: textOr(emp.fullName) ?? 'Unmatched device ID',
        dept: departmentLabelOf(row) ?? 'Not recorded',
        // Only the status the HRMS actually holds. Leave approvals, field duty and
        // shift rosters are not inferred from an absence.
        reason: rawStatus,
        detail: null,
        expectedShift: textOr(row.shift?.name) ?? textOr(emp.shift?.name ?? emp.shift),
      };
    });

  const expectedTotal = roster.length || null;
  const presentCount = presentStaff.length;
  const missingCount = missingStaff.length;
  const floorOccupancyRate =
    expectedTotal && expectedTotal > 0
      ? Number(((presentCount / expectedTotal) * 100).toFixed(1))
      : null;

  // Department coverage from the rows we actually have.
  const deptBuckets = new Map<string, { present: number; expected: number }>();
  for (const empRow of roster) {
    const dept = departmentLabelOf(empRow) ?? 'Department not recorded';
    const bucket = deptBuckets.get(dept) ?? { present: 0, expected: 0 };
    bucket.expected += 1;
    deptBuckets.set(dept, bucket);
  }
  for (const staff of presentStaff) {
    const bucket = deptBuckets.get(staff.dept);
    if (bucket) bucket.present += 1;
  }
  const departmentSplit = [...deptBuckets.entries()]
    .filter(([, bucket]) => bucket.expected > 0)
    .sort((a, b) => b[1].expected - a[1].expected)
    .slice(0, 8)
    .map(([name, bucket], idx) => ({
      name,
      present: bucket.present,
      expected: bucket.expected,
      pct: Number(((bucket.present / bucket.expected) * 100).toFixed(1)),
      status: bucket.present > 0 ? `${bucket.present} on floor` : 'No one checked in',
      color: COLOUR_PALETTE[idx % COLOUR_PALETTE.length],
    }));

  // Zones exist only where a terminal reported a floor. Capacity is not modelled
  // anywhere in the database, so it is left unreported rather than guessed.
  const zoneBuckets = new Map<string, { staff: typeof presentStaff; feeds: any[] }>();
  for (const staff of presentStaff) {
    if (!staff.zone || staff.zone === 'Floor not reported') continue;
    const bucket = zoneBuckets.get(staff.zone) ?? { staff: [], feeds: [] };
    bucket.staff.push(staff);
    zoneBuckets.set(staff.zone, bucket);
  }
  for (const row of punchRows) {
    const zone = textOr(row.floorName);
    if (!zone) continue;
    const bucket = zoneBuckets.get(zone);
    if (!bucket) continue;
    const matchValue =
      row.matchValue === null || row.matchValue === undefined || row.matchValue === ''
        ? null
        : Number(row.matchValue);
    const reportedMethod = textOr(row.verifyModeLabel);
    const methodKnown = Boolean(reportedMethod) && !reportedMethod!.startsWith('Unknown');
    bucket.feeds.push({
      terminalId: textOr(row.serialNumber) ?? textOr(row.deviceId) ?? '—',
      terminalName: textOr(row.deviceName) ?? 'Unregistered terminal',
      timestamp: textOr(row.punchTimeLocal) ?? wallClock(row.punchTimeUtc) ?? '—',
      employeeCode: textOr(row.employeeCode) ?? 'Unmatched device ID',
      employeeName: textOr(row.employeeName) ?? 'Unmatched device ID',
      // A face score is printed only when the terminal itself sent one.
      authMethod: methodKnown
        ? matchValue !== null && Number.isFinite(matchValue)
          ? `${reportedMethod} (${matchValue}%)`
          : reportedMethod!
        : 'Not reported by device',
      signalHealth: 'Latency not reported by device',
      status: row.status === 'MATCHED' ? 'VERIFIED' : String(row.status ?? 'RECORDED'),
    });
  }
  const floorZones = [...zoneBuckets.entries()].map(([name, bucket], idx) => {
    const count = bucket.staff.length;
    return {
      id: `zone-${idx + 1}`,
      name,
      badge: null,
      count,
      capacity: null,
      occupancyPct: null,
      status: count > 0 ? `${count} checked in` : 'No check-ins',
      staff: bucket.staff,
      capacityUtilization: null,
      // Newest terminal reads for this floor, as reported by the device.
      sensorFeed: bucket.feeds
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, 10),
      hourlyTrend: [],
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        presentCount,
        expectedTotal,
        missingCount,
        floorOccupancyRate,
        // No historical occupancy series is exposed by the backend today.
        occupancyDelta: null,
        lastWeekAverage: null,
        recordsToday: attendances.length,
      },
      missingReasonsSummary: null,
      presentStaff,
      missingStaff,
      departmentSplit,
      floorZones,
      historicalTrend: [],
    },
    timestamp: new Date().toISOString(),
  });
}
