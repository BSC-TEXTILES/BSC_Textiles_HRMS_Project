import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Total-punches drill-down (biometric ledger).
 *
 * Built only from endpoints that already exist on the backend:
 *   GET /api/attendance/today        — today's punch rows (actual in/out times,
 *                                      stored late seconds, shift window)
 *   GET /api/devices/attendance-log  — the real terminal punch ledger (verify
 *                                      method, match value, device, floor)
 *   GET /api/devices                 — the terminal registry (dropdown list)
 *   GET /api/departments             — department id → name map
 *
 * Every figure is derived from those rows. Nothing is seeded: when the terminals
 * or the attendance ledger have no record, the count is zero, the field is null
 * and the drawer renders an empty state instead of a demonstration fleet.
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

const GRACE_BUFFER_SECONDS = 300;
const AVATAR_PALETTE = ['#0058be', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

function textOr(value: any): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clockText(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function hourLabel(hour24: number): string {
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(h).padStart(2, '0')}:00 ${suffix}`;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const today = ymd(new Date());

  const [todayPayload, logPayload, devicesPayload, departmentsPayload] = await Promise.all([
    backendGet(request, '/attendance/today'),
    backendGet(request, `/devices/attendance-log?from=${today}&to=${today}&limit=500&sort=desc`),
    backendGet(request, '/devices'),
    backendGet(request, '/departments'),
  ]);

  const attendances: any[] = Array.isArray(todayPayload?.attendances)
    ? todayPayload.attendances
    : [];
  const ledgerRows: any[] = Array.isArray(logPayload?.rows) ? logPayload.rows : [];
  const devices: any[] = Array.isArray(devicesPayload?.devices) ? devicesPayload.devices : [];
  const departments: any[] = Array.isArray(departmentsPayload?.departments)
    ? departmentsPayload.departments
    : Array.isArray(departmentsPayload)
      ? departmentsPayload
      : [];

  const deptName = new Map<string, string>();
  for (const dept of departments) {
    const id = textOr(dept?.id);
    const name = textOr(dept?.name);
    if (id && name) deptName.set(id, name);
  }

  // Latest terminal read per employee code — the real method/score/terminal for
  // each punch row. Unmatched device ids stay flagged, never renamed.
  const punchByCode = new Map<string, any>();
  for (const row of ledgerRows) {
    const code = textOr(row.employeeCode);
    if (!code) continue;
    const existing = punchByCode.get(code);
    if (!existing || String(row.punchTimeUtc || '') > String(existing.punchTimeUtc || '')) {
      punchByCode.set(code, row);
    }
  }

  const now = Date.now();
  const records = attendances
    .filter((row) => row?.actualLogin || row?.actualLogout)
    .map((row, idx) => {
      const emp = row.employee ?? {};
      const code = textOr(emp.employeeCode) ?? textOr(row.employeeId) ?? 'Unmatched device ID';
      const punch = punchByCode.get(code);

      const inAt = row.actualLogin ? new Date(row.actualLogin) : null;
      const outAt = row.actualLogout ? new Date(row.actualLogout) : null;
      const punchType: 'IN' | 'OUT' = outAt ? 'OUT' : 'IN';

      const scheduledIn = row.scheduledLogin ? new Date(row.scheduledLogin) : null;
      const scheduledOut = row.scheduledLogout ? new Date(row.scheduledLogout) : null;
      const rawLateSeconds =
        scheduledIn && inAt ? Math.round((inAt.getTime() - scheduledIn.getTime()) / 1000) : null;
      const storedLateSeconds = Number(row.lateLoginSeconds);

      let status: 'COMPLETED' | 'LATE' | 'GRACE' | 'ON_TIME' = 'ON_TIME';
      if (outAt) status = 'COMPLETED';
      else if (Number.isFinite(storedLateSeconds) && storedLateSeconds > 0) status = 'LATE';
      else if (rawLateSeconds !== null && rawLateSeconds > 0 && rawLateSeconds <= GRACE_BUFFER_SECONDS) {
        status = 'GRACE';
      }

      // An unclosed checkout is only reportable when the stored shift end has
      // actually passed; a null schedule is not treated as a missing punch.
      const shiftEnded = Boolean(scheduledOut && scheduledOut.getTime() < now);
      const isMissingPunch = Boolean(inAt && !outAt && shiftEnded);

      const method = textOr(punch?.verifyModeLabel);
      const methodKnown = Boolean(method) && !method!.startsWith('Unknown');
      const matchValue = punch?.matchValue === null || punch?.matchValue === undefined || punch?.matchValue === ''
        ? null
        : Number(punch.matchValue);

      return {
        id: String(row.id),
        employeeId: code,
        employeeName: textOr(emp.fullName) ?? 'Unmatched device ID',
        department: (emp.departmentId ? deptName.get(emp.departmentId) : null) ?? textOr(punch?.departmentName) ?? 'Not recorded',
        terminalCode: textOr(punch?.serialNumber),
        terminalName: textOr(punch?.deviceName),
        locationName: textOr(punch?.locationCode),
        punchTime: clockText(outAt ?? inAt),
        punchType,
        method: methodKnown ? method : null,
        matchScore: matchValue !== null && Number.isFinite(matchValue) ? matchValue : null,
        shiftName: textOr(row.shift?.name) ?? textOr(emp.shift?.name) ?? null,
        status,
        avatarColor: AVATAR_PALETTE[idx % AVATAR_PALETTE.length],
        isMissingPunch,
        expectedShiftEnd: isMissingPunch ? clockText(scheduledOut) : undefined,
        missingReason: isMissingPunch
          ? `Shift ended${scheduledOut ? ` at ${clockText(scheduledOut)}` : ''} with no checkout punch recorded`
          : undefined,
      };
    });

  const inPunchOnly = records.filter((r) => r.punchType === 'IN').length;
  const outPunchCompleted = records.filter((r) => r.punchType === 'OUT').length;
  const missingPunchesCount = records.filter((r) => r.isMissingPunch).length;

  // Terminal-side reconciliation rate for today's ledger rows.
  const matchedRows = ledgerRows.filter(
    (row) => row.mappingStatus === 'MAPPED' && row.syncStatus === 'PROCESSED'
  ).length;
  const syncRate =
    ledgerRows.length > 0 ? Number(((matchedRows / ledgerRows.length) * 100).toFixed(1)) : null;

  const shiftBuckets = new Map<string, number>();
  for (const record of records) {
    const key = record.shiftName ?? 'Shift not assigned';
    shiftBuckets.set(key, (shiftBuckets.get(key) ?? 0) + 1);
  }
  const shiftDistribution = Object.fromEntries(shiftBuckets);

  // Punch-in velocity by hour, straight from the stored login instants.
  const hourBuckets = new Map<number, number>();
  for (const row of attendances) {
    if (!row.actualLogin) continue;
    const at = new Date(row.actualLogin);
    if (Number.isNaN(at.getTime())) continue;
    const hour = at.getHours();
    hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1);
  }
  const hourEntries = [...hourBuckets.entries()].sort((a, b) => a[0] - b[0]);
  const maxPunches = hourEntries.reduce((max, [, count]) => Math.max(max, count), 0);
  const avgPunches =
    hourEntries.length > 0
      ? hourEntries.reduce((sum, [, count]) => sum + count, 0) / hourEntries.length
      : 0;
  const hourlyVelocity = hourEntries.map(([hour, punches]) => ({
    hour: hourLabel(hour),
    punches,
    velocity:
      punches === maxPunches && maxPunches > 0
        ? 'Peak'
        : punches >= avgPunches * 1.5
          ? 'Surge'
          : 'Normal',
  }));

  // Terminal dropdown: the real registry, extended with any ledger serial the
  // registry does not know about (kept as "Unregistered terminal").
  const terminalsList: Array<{ code: string; name: string }> = [];
  const seenTerminals = new Set<string>();
  for (const device of devices) {
    const code = textOr(device.serialNumber) ?? textOr(device.id);
    if (!code || seenTerminals.has(code)) continue;
    seenTerminals.add(code);
    terminalsList.push({ code, name: textOr(device.name) ?? 'Unnamed terminal' });
  }
  for (const row of ledgerRows) {
    const code = textOr(row.serialNumber) ?? textOr(row.deviceId);
    if (!code || seenTerminals.has(code)) continue;
    seenTerminals.add(code);
    terminalsList.push({ code, name: textOr(row.deviceName) ?? 'Unregistered terminal' });
  }

  const departmentsList = departments
    .map((dept) => textOr(dept?.name))
    .filter((name): name is string => Boolean(name))
    .sort();

  return NextResponse.json({
    success: true,
    data: {
      records,
      pagination: {
        total: records.length,
        page: 1,
        limit: records.length,
        totalPages: 1,
      },
      stats: {
        totalPunchesToday: records.length,
        inPunchOnly,
        outPunchCompleted,
        syncRate,
        missingPunchesCount,
        missingPunchesAlert:
          missingPunchesCount > 0
            ? `${missingPunchesCount} staff member${missingPunchesCount === 1 ? '' : 's'} without a confirmed checkout punch`
            : null,
        shiftDistribution,
      },
      hourlyVelocity,
      terminalsList,
      departmentsList,
    },
    timestamp: new Date().toISOString(),
  });
}
