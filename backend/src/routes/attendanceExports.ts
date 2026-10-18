/**
 * Attendance Excel Download.
 *
 * Three server-generated `.xlsx` workbooks behind one menu item:
 *   GET /monthly — one row per employee per recorded day, plus a per-employee
 *                  month summary sheet;
 *   GET /annual  — month-by-month breakdown plus annual totals;
 *   GET /punches — the raw terminal transaction ledger (reuses the biometric ops
 *                  exporter, so there is only one punch-export code path).
 *
 * Authorisation is enforced here, not in the UI: the caller needs the ATTENDANCE
 * module's `export` action, non-elevated users are pinned to their own showroom,
 * and every download is written to the audit trail (with a MASS_EXPORT security
 * event once a file passes a bulk threshold).
 */

import { Router, Response } from 'express';
import { authenticate, getScopedLocationId, AuthRequest } from '../middleware/auth.js';
import { attachAccess, requireAction } from '../middleware/rbac.js';
import { exportLimiter } from '../middleware/rateLimiting.js';
import {
  streamAnnualWorkbook,
  streamMonthlyWorkbook,
  type AttendanceExportScope,
} from '../services/attendance/attendanceWorkbook.js';
import { runOpsExport, type OpsExportFilters } from '../services/biometric/exportWorkbook.js';
import { AuditService } from '../services/auditService.js';
import { SecurityMonitoringService } from '../services/securityMonitoringService.js';
import { prisma } from '../nativeDb.js';

const router = Router();

/** A year plus a week of slack; anything wider is almost certainly a bad form fill. */
const MAX_RANGE_DAYS = 380;
const MASS_EXPORT_ROWS = 5000;

router.use(authenticate, attachAccess);

function ymd(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : text;
}

function monthBounds(year: number, month: number): { from: string; to: string } | null {
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Reads the period from `year`+`month`, `year` alone (annual), or `from`/`to`.
 * Returns a client-facing error string rather than throwing, so a bad range is a
 * 400 with a reason and never a silently empty workbook.
 */
function resolveRange(req: AuthRequest): { range?: { from: string; to: string }; error?: string } {
  const from = ymd(req.query.from);
  const to = ymd(req.query.to);
  if (req.query.from !== undefined || req.query.to !== undefined) {
    if (!from || !to) return { error: 'from and to must both be valid calendar dates (YYYY-MM-DD).' };
    if (from > to) return { error: 'from must be on or before to.' };
    const days = (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000;
    if (days > MAX_RANGE_DAYS) return { error: `The export window may not exceed ${MAX_RANGE_DAYS} days.` };
    return { range: { from, to } };
  }

  const year = Number(req.query.year);
  if (!Number.isFinite(year)) return { error: 'Provide year (with optional month), or from and to.' };
  const monthRaw = req.query.month;
  if (monthRaw === undefined || String(monthRaw) === '' || String(monthRaw).toLowerCase() === 'all') {
    return { range: { from: `${year}-01-01`, to: `${year}-12-31` } };
  }
  const bounds = monthBounds(year, Number(monthRaw));
  if (!bounds) return { error: 'month must be between 1 and 12.' };
  return { range: bounds };
}

async function buildScope(req: AuthRequest): Promise<AttendanceExportScope | { error: string }> {
  const resolved = resolveRange(req);
  if (resolved.error) return { error: resolved.error };

  // Location users can only ever export their own showroom; an elevated caller may
  // narrow it with locationId (id or code).
  const scoped = getScopedLocationId(req.user, req.query.locationId);
  const locationId = scoped && scoped !== 'all' ? scoped : null;

  return {
    from: resolved.range!.from,
    to: resolved.range!.to,
    locationId,
    departmentId: req.query.departmentId ? String(req.query.departmentId) : null,
    employeeId: req.query.employeeId ? String(req.query.employeeId) : null,
  };
}

async function locationCodeFor(locationId: string | null | undefined): Promise<string | undefined> {
  if (!locationId) return undefined;
  const location = await prisma.location.findFirst({
    where: { OR: [{ id: locationId }, { code: locationId.toUpperCase() }] },
    select: { code: true },
  });
  return location?.code;
}

function describeScope(scope: AttendanceExportScope): string {
  const parts = [`${scope.from}..${scope.to}`];
  if (scope.locationId) parts.push(`store=${scope.locationId}`);
  if (scope.departmentId) parts.push(`department=${scope.departmentId}`);
  if (scope.employeeId) parts.push(`employee=${scope.employeeId}`);
  return parts.join(' ');
}

async function recordDownload(
  req: AuthRequest,
  res: Response,
  kind: string,
  scope: AttendanceExportScope,
  rows: number
): Promise<void> {
  const entityType = kind === 'punches' ? 'BiometricPunch' : 'Attendance';
  await AuditService.log({
    userId: req.user?.id,
    locationId: scope.locationId || req.user?.locationId || undefined,
    action: 'ATTENDANCE_EXPORT_DOWNLOAD',
    entityType,
    entityId: kind,
    ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'Client',
    riskScore: rows > MASS_EXPORT_ROWS ? 55 : 20,
    tags: ['attendance-export'],
    after: { kind, filters: describeScope(scope), rows, fileName: res.getHeader('content-disposition') || null },
  }).catch((err) => console.warn('[attendance-export] audit write failed:', err?.message));

  if (rows > MASS_EXPORT_ROWS) {
    await SecurityMonitoringService.recordEvent({
      type: 'MASS_EXPORT',
      severity: 'MEDIUM',
      userId: req.user?.id,
      ipAddress: req.ip,
      locationId: scope.locationId || req.user?.locationId || undefined,
      riskScore: 55,
      details: { kind, filters: describeScope(scope), rows, exportedBy: req.user?.fullName || req.user?.email || null },
    }).catch((err) => console.warn('[attendance-export] security event failed:', err?.message));
  }
}

function fail(req: AuthRequest, res: Response, kind: string, error: any): void {
  console.error(`[attendance-export] ${kind} failed:`, error);
  if (res.headersSent) {
    // Half a workbook is worse than no workbook: destroy so the browser discards it.
    res.destroy();
    return;
  }
  res.status(500).json({ error: `Export failed: ${error?.message || 'unknown error'}` });
}

router.get('/monthly', requireAction('ATTENDANCE', 'export'), exportLimiter, async (req: AuthRequest, res: Response) => {
  const scope = await buildScope(req);
  if ('error' in scope) return res.status(400).json({ error: scope.error });
  try {
    const rows = await streamMonthlyWorkbook(res, scope);
    await recordDownload(req, res, 'monthly', scope, rows);
    res.end();
  } catch (error: any) {
    fail(req, res, 'monthly', error);
  }
});

router.get('/annual', requireAction('ATTENDANCE', 'export'), exportLimiter, async (req: AuthRequest, res: Response) => {
  const scope = await buildScope(req);
  if ('error' in scope) return res.status(400).json({ error: scope.error });
  try {
    const rows = await streamAnnualWorkbook(res, scope);
    await recordDownload(req, res, 'annual', scope, rows);
    res.end();
  } catch (error: any) {
    fail(req, res, 'annual', error);
  }
});

/**
 * Detailed punch transactions. Delegates to the biometric ops exporter so the
 * ledger sheet stays defined in exactly one place.
 */
router.get('/punches', requireAction('ATTENDANCE', 'export'), exportLimiter, async (req: AuthRequest, res: Response) => {
  const scope = await buildScope(req);
  if ('error' in scope) return res.status(400).json({ error: scope.error });
  const format = String(req.query.format || '').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
  try {
    const locationCode = await locationCodeFor(scope.locationId);
    const filters: OpsExportFilters = {
      from: scope.from,
      to: scope.to,
      locationCode,
      departmentId: scope.departmentId || undefined,
      employeeId: scope.employeeId || undefined,
      serialNumber: req.query.serialNumber ? String(req.query.serialNumber) : undefined,
      verifyMethod: req.query.verifyMethod ? String(req.query.verifyMethod) : undefined,
      status: 'all',
    };
    const result = await runOpsExport({ res, kind: 'complete', format, filters });
    await recordDownload(req, res, 'punches', scope, result.rows);
  } catch (error: any) {
    fail(req, res, 'punches', error);
  }
});

export default router;
