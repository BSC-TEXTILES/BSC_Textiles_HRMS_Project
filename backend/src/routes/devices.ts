/**
 * Biometric device API.
 *
 * Auth model is unchanged: either a user JWT or the edge-connector key. The
 * ingest and ADMS paths accept device traffic; the admin paths require the
 * matching RBAC permission.
 *
 * Connectivity endpoints never open a socket to a terminal except
 * `test-connection`, `/:id/info` and `/:id/sync-clock`, which are explicit
 * operator actions. Everything the dashboard polls is computed from stored
 * heartbeats, so refreshing the page cannot hammer a shop-floor device.
 */

import { Router } from 'express';
import { authenticate, authorize, AuthRequest, isElevatedRole, resolveLocationCodeToId } from '../middleware/auth.js';
import {
  listBiometricDevices,
  registerBiometricDevice,
  updateBiometricDevice,
  probeDeviceSocket,
  syncSingleDevice,
  syncAllDevices,
  getDeviceSyncLogs,
  getRawPunchesLedger,
  getEmployeeBiometricMappings,
  saveEmployeeBiometricMapping,
  ingestRawPunches,
  ingestDeviceUsers,
  getEmployeeBiometricSyncDetails,
  syncEmployeeBiometric,
  getDeviceStatusSnapshot,
  readLiveDeviceInfo,
  syncDeviceClock,
  deviceEnvironmentOf,
  recordDeviceHeartbeat,
  decoratePunchRow,
  listDeviceAttendanceLog,
} from '../services/biometricService.js';
import {
  loadGlobalSettings,
  saveGlobalSettings,
  getDeviceConfig,
  listDeviceConfigs,
} from '../services/biometric/settings.js';
import { deviceIntegrationConfig } from '../config/deviceConfig.js';
import {
  listUnmappedPunches,
  assignUnmappedPunch,
  retryHeldPunches,
  startCalibration,
  getCalibrationSession,
  closeCalibrationSession,
  applyCalibrationMapping,
  listVerifyModeMapping,
  upsertVerifyModeMapping,
  deleteVerifyModeMapping,
  listRejectedPunches,
} from '../services/biometric/review.js';
import {
  buildAttendanceReport,
  toCsv,
  sendCsv,
  sendXlsx,
  describeFilters,
  ReportFilters,
  ALLOWED_DAV_RANGE_CODES,
  MB160_DAV_1601_1610_COLUMNS,
} from '../services/biometric/report.js';
import {
  deviceLog,
  classifyDeviceError,
  failureCodeForDeviceCode,
  type DeviceFailureCode,
} from '../services/biometric/logger.js';
import {
  listMismatchRecords,
  getMismatchRecord,
  getMismatchSummary,
  runFullMismatchScan,
  MISMATCH_TYPES,
} from '../services/biometric/mismatch.js';
import { resolveMismatch, MISMATCH_RESOLVE_ACTIONS } from '../services/biometric/mismatchResolution.js';
import { runOpsExport, ExportKind, ExportFormat, OpsExportFilters } from '../services/biometric/exportWorkbook.js';
import { AuditService } from '../services/auditService.js';
import { readWorkerHeartbeat } from '../workers/biometricWorker.js';
import { pool } from '../nativeDb.js';
import { resolvePunchPhoto } from '../services/biometric/photos.js';
import { fromUtcMysqlString, formatWallString } from '../services/biometric/timeCodec.js';
import { STANDARD_ZK_VERIFY_MODES, MethodFamily } from '../services/biometric/verifyMode.js';

const router = Router();

function getBiometricConnectorKey(): string {
  const key = process.env.BIOMETRIC_CONNECTOR_KEY;
  if (!key || key.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Security Error: BIOMETRIC_CONNECTOR_KEY must be configured in production.');
    }
    return 'bsc-dev-connector-key-not-for-production';
  }
  return key.trim();
}

const CONNECTOR_KEY = getBiometricConnectorKey();

function checkDeviceLocationAccess(
  user: AuthRequest['user'] | undefined,
  deviceLocationId?: string | null,
  deviceLocationCode?: string | null
): boolean {
  if (!user) return false;
  if (isElevatedRole(user.role)) return true;
  const userLocId = resolveLocationCodeToId(user.locationId);
  const devLocId = resolveLocationCodeToId(deviceLocationId || deviceLocationCode);
  return Boolean(userLocId && devLocId && userLocId === devLocId);
}

/** Dual authentication: a user JWT or the edge connector secret. */
router.use((req: any, res, next) => {
  const headerKey = req.headers['x-connector-key'];
  const bearerKey = req.headers.authorization?.replace('Bearer ', '');
  if ((headerKey && headerKey === CONNECTOR_KEY) || (bearerKey && bearerKey === CONNECTOR_KEY)) {
    req.user = {
      id: 'connector-svc',
      email: 'connector@bsctextiles.internal',
      fullName: 'BSC Biometric Hardware Connector',
      role: 'SUPER_ADMIN',
      permissions: ['ALL'],
      locationId: null,
    };
    return next();
  }
  return authenticate(req, res, next);
});

/** Non-elevated callers are pinned to their own showroom. */
function scopedLocation(req: AuthRequest, requested?: string): string {
  if (isElevatedRole(req.user?.role)) return requested || 'ALL';
  if (requested && requested !== 'ALL') {
    const reqLocId = resolveLocationCodeToId(requested);
    const userLocId = resolveLocationCodeToId(req.user?.locationId);
    if (reqLocId !== userLocId) return '';
  }
  return req.user?.locationId || requested || 'ALL';
}

/**
 * Mismatch resolution changes employee/device masters, so the task's "Admin/HR
 * only" rule is enforced here on top of the RBAC action check — a floor manager
 * with VIEW/EDIT on the devices module still cannot rewrite mappings.
 */
const MISMATCH_RESOLVER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE']);

function canResolveMismatches(req: AuthRequest): boolean {
  return Boolean(req.user && MISMATCH_RESOLVER_ROLES.has(req.user.role));
}

/**
 * The public HTTP contract for a device operation that did not complete
 * (repair brief §4). A terminal that was never reached can be reported in two
 * truthful ways only: the right status code, and the class of what went wrong.
 *
 * `200` is reserved for an operation the terminal actually confirmed — there is
 * no code here that returns a success shape for a failure, and nothing in this
 * map ever returns 200.
 */
function deviceHttpFailure(code?: DeviceFailureCode | null): {
  status: number;
  code: 'CONNECT_TIMEOUT' | 'CONNECT_REFUSED' | 'DEVICE_DISABLED' | 'PROTOCOL_ERROR' | 'UNREACHABLE';
} {
  switch (code) {
    case 'CONNECT_TIMEOUT':
      // The server gave up waiting on the terminal: a gateway timeout, exactly as
      // an operator reading "the device never answered" would expect.
      return { status: 504, code: 'CONNECT_TIMEOUT' };
    case 'CONNECT_REFUSED':
      return { status: 502, code: 'CONNECT_REFUSED' };
    case 'DEVICE_DISABLED':
      // Not a network fault at all; the registry says do not talk to it.
      return { status: 409, code: 'DEVICE_DISABLED' };
    case 'AUTH_ERROR':
    case 'PROTOCOL_ERROR':
      // The brief's contract folds "the terminal answered and refused us" into the
      // protocol class; the precise class is still returned as `failureCode`.
      return { status: 502, code: 'PROTOCOL_ERROR' };
    case 'NETWORK_UNREACHABLE':
    case 'UNREACHABLE':
    default:
      return { status: 502, code: 'UNREACHABLE' };
  }
}

/**
 * The structured error body every device operation returns on failure. `error`
 * and `message` carry the same operator-facing sentence (`error` because that is
 * the shape the frontend's axios handler already reads), and `requestId` is the
 * id `timingMiddleware` put on this request and its `X-Request-Id` header, so one
 * failed click can be followed through the device log.
 */
function sendDeviceFailure(
  res: any,
  req: AuthRequest,
  args: {
    failureCode?: DeviceFailureCode | null;
    deviceId: string;
    serialNumber: string | null;
    message: string;
    durationMs: number;
    extra?: Record<string, unknown>;
    explicitCode?: 'CONNECT_TIMEOUT' | 'CONNECT_REFUSED' | 'DEVICE_DISABLED' | 'PROTOCOL_ERROR' | 'UNREACHABLE' | 'DEVICE_NOT_FOUND';
    explicitStatus?: number;
  }
): void {
  const mapped = deviceHttpFailure(args.failureCode);
  const status = args.explicitStatus ?? mapped.status;
  const code = args.explicitCode ?? mapped.code;
  const requestId = req.metrics?.requestId ?? (req.headers['x-request-id'] as string) ?? null;

  res.status(status).json({
    error: args.message,
    code,
    failureCode: args.failureCode ?? null,
    deviceId: args.deviceId,
    serialNumber: args.serialNumber,
    message: args.message,
    durationMs: args.durationMs,
    requestId,
    ...(args.extra || {}),
  });
}

/**
 * Registry writes (add / edit / deactivate / re-map) reuse the same role set as
 * mismatch resolution on purpose: both rewrite the data that decides *whose*
 * punch a record is. `authorize('EDIT')` alone let any floor manager with EDIT
 * on the devices module register a terminal or move one to another floor, which
 * silently re-routes every punch from that device. The showroom check further
 * down still applies on top of this.
 */

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationCode = scopedLocation(req, req.query.locationCode as string);
    if (!locationCode) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const devices = await listBiometricDevices(locationCode);
    res.json({ success: true, devices, total: devices.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve hardware devices: ' + error.message });
  }
});

/**
 * GET /api/devices/status — the badge feed. Heartbeat arithmetic only, no
 * sockets, so the UI can call it every few seconds.
 */
router.get('/status', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const settings = await loadGlobalSettings();
    const all = await getDeviceStatusSnapshot();
    const allowed = isElevatedRole(req.user?.role)
      ? all
      : all.filter((d) => resolveLocationCodeToId(d.locationCode) === resolveLocationCodeToId(req.user?.locationId));

    const workerHeartbeat = await readWorkerHeartbeat();
    res.json({
      success: true,
      syncMode: deviceIntegrationConfig.syncMode,
      devices: allowed,
      connected: allowed.filter((d) => d.connected).length,
      disconnected: allowed.filter((d) => !d.connected).length,
      anyConnected: allowed.some((d) => d.connected),
      heartbeatTimeoutSeconds: settings.heartbeatTimeoutSeconds,
      driftWarnSeconds: settings.clockDriftWarnSeconds,
      defaultTimezone: settings.defaultTimezone,
      worker: {
        lastHeartbeatAt: workerHeartbeat,
        ageSeconds: workerHeartbeat ? Math.floor((Date.now() - new Date(workerHeartbeat).getTime()) / 1000) : null,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Device status unavailable: ' + error.message });
  }
});

/**
 * GET /api/devices/sdk-status — hardware/SDK compatibility summary. Read-only
 * and derived entirely from stored device records, so the dashboard can poll
 * it without dialling a terminal.
 */
router.get('/sdk-status', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationCode = scopedLocation(req, req.query.locationCode as string);
    if (!locationCode) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const devices = await listBiometricDevices(locationCode);
    const statuses = await getDeviceStatusSnapshot();
    const statusById = new Map(statuses.map((s) => [s.deviceId, s]));
    const protocols = Array.from(new Set(devices.map((d: any) => d.protocol).filter(Boolean))) as string[];
    const subnets = Array.from(
      new Set(
        devices
          .map((d: any) =>
            typeof d.ipAddress === 'string' && d.ipAddress.includes('.') && !d.ipAddress.startsWith('127.')
              ? d.ipAddress.split('.').slice(0, 3).join('.') + '.0/24'
              : null
          )
          .filter(Boolean)
      )
    ) as string[];

    // Which failure class each registered terminal is currently in, and how many
    // of them are real shop-floor hardware rather than this machine's simulator.
    const byFailureClass: Record<string, number> = {};
    for (const device of devices) {
      const code = (device as any).failureCode ?? (statusById.get((device as any).id)?.failureCode ?? null);
      const key = code ?? ((device as any).connected ? 'HEALTHY' : 'UNREACHABLE');
      byFailureClass[key] = (byFailureClass[key] || 0) + 1;
    }
    const production = devices.filter((d: any) => d.usableAsProductionEvidence !== false);
    const fixtures = devices.filter((d: any) => d.usableAsProductionEvidence === false);
    const productionSynced = production.filter((d: any) => Boolean(d.lastSyncAt) && d.connected);
    const productionReachable = production.filter((d: any) => d.connected);

    res.json({
      success: true,
      sdkCompatibility: devices.length > 0 ? 'SUPPORTED' : 'NO_DEVICES',
      protocol: protocols.length === 0 ? 'ZK-TCP (eSSL/ZKTeco push SDK)' : protocols.join(', '),
      supportedProtocols: protocols,
      deviceCount: devices.length,
      devices: devices.map((d: any) => {
        const snapshot = statusById.get(d.id);
        return {
          id: d.id,
          serialNumber: d.serialNumber,
          name: d.name,
          protocol: d.protocol,
          locationCode: d.locationCode,
          ipAddress: d.ipAddress,
          port: d.port,
          connected: d.connected ?? snapshot?.connected ?? false,
          status: d.status ?? snapshot?.status ?? 'DISCONNECTED',
          lastSyncAt: d.lastSyncAt ?? snapshot?.lastSyncAt ?? null,
          /** Log code as stored, e.g. CONNECT_TIMEOUT. */
          lastErrorCode: d.lastErrorCode ?? snapshot?.lastErrorCode ?? null,
          /** Public class (brief §2), or null while the link is healthy. */
          failureCode: d.failureCode ?? snapshot?.failureCode ?? null,
          lastError: d.lastError ?? snapshot?.lastError ?? null,
          consecutiveFailures: d.consecutiveFailures ?? snapshot?.consecutiveFailures ?? 0,
          nextRetryAt: d.nextRetryAt ?? snapshot?.nextRetryAt ?? null,
          environment: d.environment ?? snapshot?.environment ?? 'PRODUCTION',
          environmentLabel: d.environmentLabel ?? snapshot?.environmentLabel ?? 'Registered terminal address',
          usableAsProductionEvidence: d.usableAsProductionEvidence ?? snapshot?.usableAsProductionEvidence ?? true,
        };
      }),
      diagnostics: {
        /** Counts by failure class so "all offline" and "all refused" are not the same message. */
        byFailureClass,
        productionTerminals: production.length,
        developmentFixtures: fixtures.length,
        /**
         * Reachable here means a terminal answered, and synchronised means records
         * were actually stored — never a claim inferred from a config row.
         */
        productionTerminalsReachable: productionReachable.length,
        productionTerminalsSynchronised: productionSynced.length,
        note: production.length > 0 && productionReachable.length === 0
          ? 'No registered shop-floor terminal answered the configured SDK from this machine; anything reported as synchronised here came from stored history, not from a live device.'
          : 'Reachability is measured against the terminal; development fixtures are counted separately and are never shop-floor evidence.',
      },
      networkEnvironment: {
        isolatedShowroomSubnets: true,
        subnets: subnets.length > 0 ? subnets : ['192.168.100.0/24'],
        note: 'Terminals stay on the showroom LAN and push to the cloud API; the API never dials in.',
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SDK status unavailable: ' + error.message });
  }
});

// ─── Biometric ops: mismatch queue, ATTENDANCE LOG , exports, summary ────────

function queryList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const list = Array.isArray(value) ? value.map(String) : String(value).split(',');
  const cleaned = list.map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function queryStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** `scopedLocation` may return a location id (from the JWT) or a code; the ops
 *  tables store codes, so the scope is normalised before filtering. */
async function scopeToCode(scope: string): Promise<string> {
  if (!scope || scope === 'ALL') return scope;
  const [rows]: any = await pool.query('SELECT code FROM location WHERE id = ? OR code = ? LIMIT 1', [scope, scope]);
  return rows[0]?.code ?? String(scope).toUpperCase();
}

/**
 * GET /api/devices/ops-summary — the mismatch section's KPI cards: devices
 * online/offline, open mismatches by type, not-synced employees, unknown users,
 * punches today. One round-trip so the dashboard never shows mixed snapshots.
 */
router.get('/ops-summary', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const scope = scopedLocation(req, req.query.locationCode as string);
    if (!scope) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const code = await scopeToCode(scope);
    const summary = await getMismatchSummary(code === 'ALL' ? null : code);
    res.json({ success: true, summary, checkedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: 'Ops summary unavailable: ' + error.message });
  }
});

/**
 * GET /api/devices/mismatches — the HR work queue. Filters: status (default
 * OPEN), types, severity, floor, section, department, device, employee search,
 * date range; paginated and sortable.
 */
router.get('/mismatches', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const scope = scopedLocation(req, req.query.locationCode as string);
    if (!scope) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const code = await scopeToCode(scope);

    const result = await listMismatchRecords({
      status: queryStr(req.query.status) ?? 'OPEN',
      types: queryList(req.query.types ?? req.query.type)?.filter((t) => (MISMATCH_TYPES as string[]).includes(t)),
      severities: queryList(req.query.severity),
      locationCode: code === 'ALL' ? undefined : code,
      deviceId: queryStr(req.query.deviceId),
      serialNumber: queryStr(req.query.serialNumber),
      floorId: queryStr(req.query.floorId),
      sectionId: queryStr(req.query.sectionId),
      departmentId: queryStr(req.query.departmentId),
      employeeQuery: queryStr(req.query.employeeQuery ?? req.query.search),
      biometricId: queryStr(req.query.biometricId),
      from: queryStr(req.query.from),
      to: queryStr(req.query.to),
      sort: (queryStr(req.query.sort) as any) ?? 'lastDetectedAt',
      direction: queryStr(req.query.direction) === 'asc' ? 'asc' : 'desc',
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });

    res.json({ success: true, mismatches: result.rows, total: result.total, page: result.page, pageSize: result.pageSize, types: MISMATCH_TYPES });
  } catch (error: any) {
    res.status(500).json({ error: 'Mismatch queue unavailable: ' + error.message });
  }
});

/**
 * POST /api/devices/mismatches/scan — run the full sweep now (duplicate ids,
 * device user lists, not-synced mappings, recent punches). Admin/HR only.
 */
router.post('/mismatches/scan', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    if (!canResolveMismatches(req)) {
      return res.status(403).json({ error: 'Forbidden: only Admin and HR can run the mismatch scan' });
    }
    const scope = scopedLocation(req, (req.body?.locationCode as string) ?? (req.query.locationCode as string));
    if (!scope) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const code = await scopeToCode(scope);

    const result = await runFullMismatchScan({
      detectedBy: 'MANUAL',
      locationCode: code === 'ALL' ? null : code,
      sinceDays: Number(req.body?.sinceDays) || 7,
    });

    await AuditService.log({
      userId: req.user!.id,
      // auditlog.locationId has an FK to location.id; the scope variable holds
      // a code (or an id), so resolve it to the authoritative id.
      locationId: code === 'ALL' ? undefined : resolveLocationCodeToId(code),
      action: 'BIOMETRIC_MISMATCH_SCAN',
      entityType: 'BiometricMismatch',
      entityId: `scan-${Date.now()}`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'HRM UI',
      tags: ['biometric', 'mismatch', 'scan'],
      after: result,
    }).catch(() => undefined);

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Mismatch scan failed: ' + error.message });
  }
});

/** GET /api/devices/mismatches/:id — one record with expected/received. */
router.get('/mismatches/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const scope = scopedLocation(req, req.query.locationCode as string);
    if (!scope) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const record = await getMismatchRecord(req.params.id);
    if (!record) return res.status(404).json({ error: 'Mismatch record not found' });
    if (scope !== 'ALL') {
      const code = await scopeToCode(scope);
      if (record.locationCode && record.locationCode !== code) {
        return res.status(403).json({ error: 'Forbidden: record belongs to another showroom' });
      }
    }
    res.json({ success: true, mismatch: record });
  } catch (error: any) {
    res.status(500).json({ error: 'Mismatch record unavailable: ' + error.message });
  }
});

/**
 * POST /api/devices/mismatches/:id/resolve — edit / re-link / re-sync /
 * resolve / ignore. `dryRun: true` returns the before/after preview without
 * touching anything. Enforced to Admin/HR on the server.
 */
router.post('/mismatches/:id/resolve', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    if (!canResolveMismatches(req)) {
      return res.status(403).json({ error: 'Forbidden: only Admin and HR can edit mismatch records' });
    }
    const action = String(req.body?.action ?? '').toUpperCase();
    if (!(MISMATCH_RESOLVE_ACTIONS as string[]).includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${MISMATCH_RESOLVE_ACTIONS.join(', ')}` });
    }

    const scope = scopedLocation(req, (req.body?.locationCode as string) ?? (req.query.locationCode as string));
    if (!scope) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const record = await getMismatchRecord(req.params.id);
    if (!record) return res.status(404).json({ error: 'Mismatch record not found' });
    if (scope !== 'ALL') {
      const code = await scopeToCode(scope);
      if (record.locationCode && record.locationCode !== code) {
        return res.status(403).json({ error: 'Forbidden: record belongs to another showroom' });
      }
    }

    const result = await resolveMismatch({
      mismatchId: req.params.id,
      action: action as any,
      actorId: req.user!.id,
      remark: req.body?.remark ?? null,
      dryRun: req.body?.dryRun === true,
      employeeId: req.body?.employeeId ?? null,
      enrollmentNumber: req.body?.enrollmentNumber ?? null,
      deviceName: req.body?.deviceName ?? null,
      serialNumber: req.body?.serialNumber ?? null,
      employeeFloorId: req.body?.employeeFloorId ?? undefined,
      employeeSectionId: req.body?.employeeSectionId ?? undefined,
      deviceFloorId: req.body?.deviceFloorId ?? undefined,
      deviceSectionId: req.body?.deviceSectionId ?? undefined,
      retirePreviousMapping: req.body?.retirePreviousMapping === true,
      remapPastPunches: req.body?.remapPastPunches !== false,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'HRM UI',
    });

    res.status(result.ok ? 200 : (result.message.includes('not found') ? 404 : 400)).json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Mismatch resolution failed: ' + error.message });
  }
});

/**
 * GET /api/devices/attendance-log — punch ledger with device, floor, section,
 * department, employee details; filters, search, sorting, pagination.
 */
router.get('/attendance-log', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const scope = scopedLocation(req, req.query.locationCode as string);
    if (!scope) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const code = await scopeToCode(scope);

    const log = await listDeviceAttendanceLog({
      locationCode: code,
      deviceId: queryStr(req.query.deviceId),
      serialNumber: queryStr(req.query.serialNumber),
      floorId: queryStr(req.query.floorId),
      sectionId: queryStr(req.query.sectionId),
      departmentId: queryStr(req.query.departmentId),
      employeeQuery: queryStr(req.query.employeeQuery ?? req.query.search),
      punchType: queryStr(req.query.punchType) ?? queryStr(req.query.direction),
      verifyMethod: queryStr(req.query.verifyMethod),
      status: queryStr(req.query.status),
      startDate: queryStr(req.query.from ?? req.query.startDate),
      endDate: queryStr(req.query.to ?? req.query.endDate),
      sort: queryStr(req.query.sort) === 'asc' ? 'asc' : 'desc',
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });

    res.json({ success: true, ...log });
  } catch (error: any) {
    res.status(500).json({ error: 'Attendance log unavailable: ' + error.message });
  }
});

/**
 * GET /api/devices/export/:kind?format=xlsx|csv — complete / floor-wise /
 * section-wise / device-wise / mismatch exports honouring every active filter.
 * Streamed server-side, so a 10k-row file is generated without buffering.
 */
router.get('/export/:kind', authorize('VIEW'), async (req: AuthRequest, res) => {
  const kind = req.params.kind as ExportKind;
  const format: ExportFormat = queryStr(req.query.format) === 'csv' ? 'csv' : 'xlsx';
  const allowedKinds: ExportKind[] = ['complete', 'floor-wise', 'section-wise', 'device-wise', 'mismatch'];
  if (!allowedKinds.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${allowedKinds.join(', ')}` });
  }
  try {
    const scope = scopedLocation(req, req.query.locationCode as string);
    if (!scope) return res.status(403).json({ error: 'Forbidden: devices in another showroom' });
    const code = await scopeToCode(scope);
    const statusRaw = queryStr(req.query.status);
    // The mismatch tab sends its status filter as `status`; the mismatch query
    // reads `mismatchStatus` and otherwise defaults to OPEN, so choosing
    // RESOLVED or ALL exported OPEN rows and nobody noticed. `status` means the
    // punch reconciliation state when it is one of those three values, and the
    // mismatch state otherwise.
    const PUNCH_STATUSES = ['matched', 'mismatched', 'unsynced'];
    const statusToken = String(statusRaw || '');
    const mismatchStatusFromQuery = PUNCH_STATUSES.includes(statusToken.toLowerCase())
      ? ''
      : statusToken.toUpperCase();

    const filters: OpsExportFilters = {
      from: queryStr(req.query.from),
      to: queryStr(req.query.to),
      locationCode: code,
      deviceId: queryStr(req.query.deviceId),
      serialNumber: queryStr(req.query.serialNumber),
      floorId: queryStr(req.query.floorId),
      sectionId: queryStr(req.query.sectionId),
      departmentId: queryStr(req.query.departmentId),
      employeeQuery: queryStr(req.query.employeeQuery ?? req.query.search),
      status: statusRaw === 'matched' || statusRaw === 'mismatched' || statusRaw === 'unsynced' ? statusRaw : 'all',
      mappingStatus: queryStr(req.query.mappingStatus),
      verifyMethod: queryStr(req.query.verifyMethod),
      mismatchStatus: queryStr(req.query.mismatchStatus) || mismatchStatusFromQuery,
      mismatchTypes: queryList(req.query.types),
      severity: queryStr(req.query.severity),
    };

    await runOpsExport({ res, kind, format, filters });
  } catch (error: any) {
    deviceLog.error('Ops export failed', { detail: error.message, code: 'DB_FAILURE' });
    if (res.headersSent) {
      res.destroy();
    } else {
      res.status(500).json({ error: 'Export failed: ' + error.message });
    }
  }
});

/**
 * POST /api/devices/:id/test-connection
 * A step-by-step diagnostic the operator can read: DNS/TCP, ZK handshake,
 * authentication, clock, log read. The first failing step is the answer.
 */
router.post('/:id/test-connection', authorize('VIEW'), async (req: AuthRequest, res) => {
  const steps: Array<{ step: string; ok: boolean; detail: string; latencyMs?: number }> = [];
  try {
    const { id } = req.params;
    const device = await getDeviceConfig(id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!checkDeviceLocationAccess(req.user, device.locationId, device.locationCode)) {
      return res.status(403).json({ error: 'Forbidden: device belongs to another showroom' });
    }

    const tcp = await probeDeviceSocket(device.ipAddress, device.port, 2500);
    steps.push({
      step: 'tcp-port',
      ok: tcp.online,
      latencyMs: tcp.latencyMs,
      detail: tcp.online
        ? `${device.ipAddress}:${device.port} accepted a connection`
        : tcp.error || 'no answer',
    });

    if (!tcp.online) {
      const failureCode = tcp.errorCode ?? 'UNREACHABLE';
      await pool.query(
        `UPDATE biometric_devices SET status = 'DISCONNECTED', lastError = ? WHERE id = ?`,
        [`${failureCode}: ${tcp.error || 'unreachable'}`.slice(0, 1000), device.id]
      ).catch(() => undefined);
      return res.json({
        success: false,
        connected: false,
        failedStep: 'tcp-port',
        steps,
        deviceId: device.id,
        serialNumber: device.serialNumber,
        deviceName: device.name,
        ipAddress: device.ipAddress,
        port: device.port,
        errorCode: tcp.transportCode || null,
        failureCode,
        environment: deviceEnvironmentOf(device).environment,
        environmentLabel: deviceEnvironmentOf(device).environmentLabel,
        usableAsProductionEvidence: deviceEnvironmentOf(device).usableAsProductionEvidence,
        requestId: req.metrics?.requestId ?? null,
        hint: failureCode === 'CONNECT_REFUSED'
          ? `Nothing is listening on ${device.ipAddress}:${device.port}. Check the terminal is powered and that this address is really its own.`
          : failureCode === 'NETWORK_UNREACHABLE'
            ? `This server has no route to ${device.ipAddress}. Run the edge connector on that showroom LAN, or point the terminal at this server with ADMS push instead.`
            : 'Check the terminal is powered and on this network, or point it at this server with ADMS push instead.',
      });
    }

    const live = await readLiveDeviceInfo(device.id);
    steps.push({
      step: 'zk-handshake',
      ok: Boolean(live.info),
      detail: live.info
        ? `session established, firmware=${live.info.firmwareVersion ?? 'not reported'}`
        : live.error || 'handshake failed',
    });

    if (!live.info) {
      return res.json({
        success: false,
        connected: false,
        failedStep: 'zk-handshake',
        steps,
        deviceId: device.id,
        serialNumber: device.serialNumber,
        deviceName: device.name,
        error: live.error,
        errorCode: live.errorCode,
        failureCode: live.failureCode,
        environment: live.environment,
        environmentLabel: live.environmentLabel,
        usableAsProductionEvidence: live.usableAsProductionEvidence,
        requestId: req.metrics?.requestId ?? null,
        hint: live.errorCode === 'COMM_KEY_REJECTED'
          ? 'Set the same Comm Key on the terminal (Menu → Comm → Communication Key) as here.'
          : 'Port is open but the ZK protocol did not respond — confirm the address belongs to the terminal.',
      });
    }

    steps.push({
      step: 'device-time',
      ok: true,
      detail: `device ${live.deviceTimeLocal ?? 'n/a'} (server ${new Date().toLocaleString('en-GB', { timeZone: device.timezone })})`,
    });
    steps.push({
      step: 'clock-drift',
      ok: !live.driftWarning,
      detail: live.driftSeconds === null
        ? 'drift not measured'
        : `${live.driftSeconds}s${live.driftWarning ? ' — over the warning threshold, use Sync device time' : ''}`,
    });
    steps.push({
      step: 'log-read',
      ok: true,
      detail: `user count ${live.info.userCount ?? 'n/a'}, log count ${live.info.logCount ?? 'n/a'}`,
    });

    res.json({
      success: true,
      connected: true,
      failedStep: null,
      steps,
      deviceId: device.id,
      deviceName: device.name,
      serialNumber: device.serialNumber,
      ipAddress: device.ipAddress,
      port: device.port,
      protocol: 'TCP_SDK',
      info: live.info,
      deviceTimeUtc: live.deviceTimeUtc,
      deviceTimeLocal: live.deviceTimeLocal,
      serverTimeUtc: live.serverTimeUtc,
      driftSeconds: live.driftSeconds,
      driftWarning: live.driftWarning,
      photoPushEnabled: device.photoPushEnabled,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    const classified = classifyDeviceError(error);
    deviceLog.error('Connection test failed', { detail: error.message, code: classified.code });
    res.status(500).json({
      success: false,
      connected: false,
      steps,
      failedStep: steps.length ? steps[steps.length - 1].step : 'unknown',
      error: classified.message,
      errorCode: classified.code,
    });
  }
});

router.post('/', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    // Registry writes are an Admin/HR responsibility, reusing the same role set as
    // mismatch resolution: both rewrite the data that decides WHOSE punch a record
    // is. authorize('EDIT') alone let any floor manager with EDIT on the devices
    // module register a terminal or move one to another floor, silently re-routing
    // every punch that device receives. The showroom check below still applies on top.
    if (!canResolveMismatches(req)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only Admin or HR may register, edit or deactivate biometric terminals.',
      });
    }
    const { serialNumber, name, model, firmwareVersion, ipAddress, port, commKey, timezone, locationCode, protocol, floorId, sectionId } = req.body;
    const DAVANGERE_EXCLUSIVE_SERIALS = new Set([
      'JNP2252300795',
      'JNP2252300802',
      'JNPJNP2252300802',
      'JNP2252300797',
      (process.env.BIOMETRIC_DEV1_SERIAL || '').trim(),
      (process.env.BIOMETRIC_DEV2_SERIAL || '').trim(),
      (process.env.BIOMETRIC_DEV3_SERIAL || '').trim(),
    ].filter(Boolean));

    if (DAVANGERE_EXCLUSIVE_SERIALS.has(String(serialNumber).trim()) && locationCode.toUpperCase() !== 'DAV') {
      return res.status(400).json({
        error: `Hardware terminal ${serialNumber} belongs exclusively to Davangere and cannot be registered under ${locationCode}.`,
      });
    }

    // registerBiometricDevice upserts by serial, so without this a "new" device
    // whose serial already exists silently rewrites the existing terminal's
    // name, floor and section instead of failing. Two devices on one serial is
    // how punches end up attributed to a machine that isn't there.
    const [clash]: any = await pool.query(
      'SELECT id, name, locationCode FROM biometric_devices WHERE serialNumber = ? LIMIT 1',
      [String(serialNumber).trim()]
    );
    if (clash?.length) {
      return res.status(409).json({
        error: 'SERIAL_TAKEN',
        message: `Serial ${serialNumber} is already registered as "${clash[0].name}" in ${clash[0].locationCode}. Edit that device instead of adding a duplicate.`,
      });
    }
    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      const regLocId = resolveLocationCodeToId(locationCode);
      if (userLocId !== regLocId) {
        return res.status(403).json({ error: 'Forbidden: cannot register devices for another showroom' });
      }
    }

    if (floorId && !(await floorExists(floorId))) return res.status(400).json({ error: 'Unknown floorId' });
    if (sectionId && !(await sectionExists(sectionId))) return res.status(400).json({ error: 'Unknown sectionId' });

    const device = await registerBiometricDevice({
      serialNumber,
      name,
      model,
      firmwareVersion,
      ipAddress,
      port: Number(port) || 4370,
      commKey: Number(commKey) || 0,
      timezone: timezone || (await loadGlobalSettings()).defaultTimezone,
      locationCode,
      protocol,
    });

    if (floorId !== undefined || sectionId !== undefined) {
      await pool.query(
        'UPDATE biometric_devices SET floorId = ?, sectionId = ?, updatedAt = NOW() WHERE id = ?',
        [floorId ?? null, sectionId ?? null, device.id]
      );
    }

    await AuditService.log({
      userId: req.user!.id,
      locationId: device.locationId ?? undefined,
      action: 'BIOMETRIC_DEVICE_REGISTERED',
      entityType: 'BiometricDevice',
      entityId: device.id,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'HRM UI',
      tags: ['biometric', 'device-registry'],
      after: { serialNumber, name, ipAddress, locationCode, floorId: floorId ?? null, sectionId: sectionId ?? null },
    }).catch(() => undefined);

    res.status(201).json({ success: true, message: 'Biometric device registered', device: await getDeviceConfig(device.id) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to register biometric device: ' + error.message });
  }
});

async function floorExists(floorId: string): Promise<boolean> {
  const [rows]: any = await pool.query('SELECT id FROM floor WHERE id = ? LIMIT 1', [floorId]);
  return rows.length > 0;
}

async function sectionExists(sectionId: string): Promise<boolean> {
  const [rows]: any = await pool.query('SELECT id FROM section WHERE id = ? LIMIT 1', [sectionId]);
  return rows.length > 0;
}

router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    // Same Admin/HR rule as registration. This is also the deactivate path, so
    // without it any EDIT holder could take a terminal offline for a whole
    // showroom.
    if (!canResolveMismatches(req)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only Admin or HR may edit or deactivate biometric terminals.',
      });
    }
    const { name, ipAddress, port, commKey, timezone, locationCode, isActive, realtimeEnabled, photoPushEnabled, pollIntervalMs, heartbeatTimeoutSeconds, protocol, model, firmwareVersion, floorId, sectionId, deactivate } = req.body;

    const existing: any = await getDeviceConfig(id);
    if (!existing) return res.status(404).json({ error: 'Device not found' });
    if (!checkDeviceLocationAccess(req.user, existing.locationId, existing.locationCode)) {
      return res.status(403).json({ error: 'Forbidden: device belongs to another showroom' });
    }

    const DAVANGERE_EXCLUSIVE_SERIALS = new Set([
      'JNP2252300795',
      'JNP2252300802',
      'JNPJNP2252300802',
      'JNP2252300797',
      (process.env.BIOMETRIC_DEV1_SERIAL || '').trim(),
      (process.env.BIOMETRIC_DEV2_SERIAL || '').trim(),
      (process.env.BIOMETRIC_DEV3_SERIAL || '').trim(),
    ].filter(Boolean));

    if (locationCode && locationCode.toUpperCase() !== 'DAV' && DAVANGERE_EXCLUSIVE_SERIALS.has(String(existing.serialNumber).trim())) {
      return res.status(400).json({
        error: `Terminal ${existing.serialNumber} is permanently bound to Davangere showroom and cannot be moved to ${locationCode}.`,
      });
    }

    if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
      return res.status(400).json({ error: 'port must be between 1 and 65535' });
    }
    if (commKey !== undefined && (!Number.isInteger(Number(commKey)) || Number(commKey) < 0 || Number(commKey) > 255)) {
      return res.status(400).json({ error: 'commKey must be an integer from 0 to 255' });
    }
    if (floorId && !(await floorExists(floorId))) return res.status(400).json({ error: 'Unknown floorId' });
    if (sectionId && !(await sectionExists(sectionId))) return res.status(400).json({ error: 'Unknown sectionId' });

    const nextActive = deactivate === true ? false : isActive;
    await updateBiometricDevice(id, {
      name, ipAddress, port, commKey, timezone, locationCode, isActive: nextActive,
      realtimeEnabled, photoPushEnabled, pollIntervalMs, heartbeatTimeoutSeconds, protocol, model, firmwareVersion,
    });

    const floorPatch: string[] = [];
    const floorParams: any[] = [];
    if (floorId !== undefined) { floorPatch.push('floorId = ?'); floorParams.push(floorId ?? null); }
    if (sectionId !== undefined) { floorPatch.push('sectionId = ?'); floorParams.push(sectionId ?? null); }
    if (floorPatch.length > 0) {
      floorParams.push(id);
      await pool.query(`UPDATE biometric_devices SET ${floorPatch.join(', ')}, updatedAt = NOW() WHERE id = ?`, floorParams);
    }

    const after: any = await getDeviceConfig(id);
    await AuditService.log({
      userId: req.user!.id,
      locationId: existing.locationId ?? undefined,
      action: nextActive === false && existing.isActive ? 'BIOMETRIC_DEVICE_DEACTIVATED' : 'BIOMETRIC_DEVICE_UPDATED',
      entityType: 'BiometricDevice',
      entityId: id,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'HRM UI',
      tags: ['biometric', 'device-registry'],
      before: { name: existing.name, ipAddress: existing.ipAddress, port: existing.port, locationCode: existing.locationCode, isActive: existing.isActive },
      after: { name: after?.name, ipAddress: after?.ipAddress, port: after?.port, locationCode: after?.locationCode, isActive: after?.isActive, floorId: floorId ?? undefined, sectionId: sectionId ?? undefined },
    }).catch(() => undefined);

    res.json({ success: true, message: deactivate === true ? 'Device deactivated' : 'Device configuration updated', device: after });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update device configuration: ' + error.message });
  }
});

/** Live read of serial, firmware, device clock, counts and drift. */
router.get('/:id/info', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const device = await getDeviceConfig(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!checkDeviceLocationAccess(req.user, device.locationId, device.locationCode)) {
      return res.status(403).json({ error: 'Forbidden: device belongs to another showroom' });
    }

    const live = await readLiveDeviceInfo(device.id);
    res.json({
      success: live.reachable,
      ...live,
      requestId: req.metrics?.requestId ?? null,
      transport: {
        ip: device.ipAddress,
        port: device.port,
        protocol: device.protocol,
        timezone: device.timezone,
        pollIntervalMs: device.pollIntervalMs,
        realtimeEnabled: device.realtimeEnabled,
      },
    });
  } catch (error: any) {
    const classified = classifyDeviceError(error);
    res.status(200).json({
      success: false,
      reachable: false,
      error: classified.message,
      errorCode: classified.code,
      failureCode: failureCodeForDeviceCode(classified.code) ?? 'UNREACHABLE',
      deviceId: req.params.id,
      requestId: req.metrics?.requestId ?? null,
    });
  }
});

/**
 * POST /api/devices/:id/sync-clock
 *
 * `200` is returned only when the terminal was contacted, its clock read back, and
 * the write acknowledged by the ZK protocol — the service itself refuses to claim
 * anything weaker. Any other outcome is an error status with the class that
 * happened, and the service writes no success-implying column on the way out
 * (no `timeSyncedAt`, no status change, no `lastSyncAt`, and `consecutiveFailures`
 * is raised rather than cleared).
 */
router.post('/:id/sync-clock', authorize('EDIT'), async (req: AuthRequest, res) => {
  const started = Date.now();
  const requestId = req.metrics?.requestId ?? (req.headers['x-request-id'] as string) ?? null;
  try {
    const device = await getDeviceConfig(req.params.id);
    if (!device) {
      deviceLog.warn('Clock sync target is not in the registry', { deviceId: req.params.id, requestId });
      return sendDeviceFailure(res, req, {
        deviceId: req.params.id,
        serialNumber: null,
        message: `No biometric terminal is registered as "${req.params.id}" — nothing was synchronised.`,
        durationMs: Date.now() - started,
        explicitStatus: 404,
        explicitCode: 'DEVICE_NOT_FOUND',
      });
    }
    if (!checkDeviceLocationAccess(req.user, device.locationId, device.locationCode)) {
      return res.status(403).json({ error: 'Forbidden: device belongs to another showroom' });
    }

    const result = await syncDeviceClock(device.id, { requestId: requestId ?? undefined });
    const durationMs = Date.now() - started;

    if (result.ok) {
      deviceLog.info('Clock sync answered HTTP 200', {
        deviceId: result.deviceId,
        serialNumber: result.serialNumber,
        requestId,
        latencyMs: durationMs,
        detail: `drift ${result.driftSecondsBefore ?? 'unknown'}s -> ${result.driftSecondsAfter}s; ${result.confirmedBy}`,
      });
      return res.status(200).json({
        success: true,
        ok: true,
        code: null,
        failureCode: null,
        message: result.message,
        deviceId: result.deviceId,
        serialNumber: result.serialNumber,
        deviceName: result.deviceName,
        ipAddress: result.ipAddress,
        port: result.port,
        driftSecondsBefore: result.driftSecondsBefore,
        driftSecondsAfter: result.driftSecondsAfter,
        confirmedBy: result.confirmedBy,
        durationMs,
        requestId,
        environment: result.environment,
        environmentLabel: result.environmentLabel,
        usableAsProductionEvidence: result.usableAsProductionEvidence,
      });
    }

    const mapped = deviceHttpFailure(result.failureCode);
    deviceLog.warn('Clock sync answered a failure', {
      deviceId: result.deviceId,
      serialNumber: result.serialNumber,
      code: result.errorCode ?? undefined,
      requestId,
      latencyMs: durationMs,
      detail: `HTTP ${mapped.status} [${mapped.code}] — ${result.message}`,
    });

    return sendDeviceFailure(res, req, {
      failureCode: result.failureCode,
      deviceId: result.deviceId,
      serialNumber: result.serialNumber,
      message: result.message,
      durationMs,
      extra: {
        deviceName: result.deviceName,
        ipAddress: result.ipAddress,
        port: result.port,
        errorCode: result.errorCode,
        driftSecondsBefore: result.driftSecondsBefore,
        driftSecondsAfter: result.driftSecondsAfter,
        environment: result.environment,
        environmentLabel: result.environmentLabel,
        usableAsProductionEvidence: result.usableAsProductionEvidence,
        // Stated explicitly so no reader has to infer it: the failed attempt left
        // the registry's sync evidence exactly where it was.
        timeSyncedAtUpdated: false,
        clockSynchronised: false,
      },
    });
  } catch (error: any) {
    // Only an unknown device id reaches here (the service throws when the
    // registry has no such row); everything else returns a classified result.
    const classified = classifyDeviceError(error);
    deviceLog.error('Clock sync request threw', {
      deviceId: req.params.id, code: classified.code, requestId, detail: error?.message,
    });
    return sendDeviceFailure(res, req, {
      deviceId: req.params.id,
      serialNumber: null,
      message: `Clock sync failed: ${error?.message || classified.message}`,
      durationMs: Date.now() - started,
      explicitStatus: 500,
      explicitCode: 'UNREACHABLE',
    });
  }
});

/**
 * POST /api/devices/:id/sync
 *
 * Pulling logs is a device operation, so it follows the same rule as the clock:
 * a terminal that was never reached cannot answer with a success shape.
 */
router.post('/:id/sync', authorize('EDIT'), async (req: AuthRequest, res) => {
  const started = Date.now();
  const requestId = req.metrics?.requestId ?? (req.headers['x-request-id'] as string) ?? null;
  try {
    const device = await getDeviceConfig(req.params.id);
    if (!device) {
      return sendDeviceFailure(res, req, {
        deviceId: req.params.id,
        serialNumber: null,
        message: `No biometric terminal is registered as "${req.params.id}" — nothing was synchronised.`,
        durationMs: Date.now() - started,
        explicitStatus: 404,
        explicitCode: 'DEVICE_NOT_FOUND',
      });
    }
    if (!checkDeviceLocationAccess(req.user, device.locationId, device.locationCode)) {
      return res.status(403).json({ error: 'Forbidden: device belongs to another showroom' });
    }

    const result = await syncSingleDevice(device.id, 'MANUAL_USER');

    // SUCCESS here means the ZK session was established and the log was read;
    // PARTIAL means it was read but some records were rejected. Neither claims
    // records were stored unless the counts say so.
    if (result.status === 'SUCCESS' || result.status === 'PARTIAL') {
      return res.status(200).json({
        success: true,
        status: result.status,
        message: result.recordsInserted > 0
          ? `Synchronised ${result.deviceName}: ${result.recordsInserted} record(s) stored, ${result.recordsSkipped} already present, ${result.recordsRejected} rejected.`
          : `Reached ${result.deviceName}: the terminal reported ${result.recordsPulled} record(s), all already stored — nothing new to import.`,
        requestId,
        result,
      });
    }

    return sendDeviceFailure(res, req, {
      failureCode: result.failureCode ?? null,
      deviceId: result.deviceId,
      serialNumber: result.serialNumber,
      message: result.errorMessage || 'The terminal did not answer, so no attendance was pulled.',
      durationMs: Date.now() - started,
      extra: {
        status: result.status,
        deviceName: result.deviceName,
        recordsPulled: result.recordsPulled,
        recordsInserted: result.recordsInserted,
        environment: result.environment,
        usableAsProductionEvidence: result.usableAsProductionEvidence,
        attendanceSynchronised: false,
      },
    });
  } catch (error: any) {
    const classified = classifyDeviceError(error);
    deviceLog.error('Device sync request threw', {
      deviceId: req.params.id, code: classified.code, requestId, detail: error?.message,
    });
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
});

router.post('/sync-all', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const results = await syncAllDevices('MANUAL_USER');
    const scoped = isElevatedRole(req.user?.role)
      ? results
      : results.filter((r: any) => checkDeviceLocationAccess(req.user, null, r.locationCode));
    res.json({
      success: true,
      message: `Synced ${scoped.length} device(s), ${scoped.filter((r: any) => r.status === 'SUCCESS').length} without error`,
      results: scoped,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Mass sync failed: ' + error.message });
  }
});

router.get('/sync-logs', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const deviceId = req.query.deviceId as string;
    const logs = await getDeviceSyncLogs(deviceId, Number(req.query.limit) || 50);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve sync logs: ' + error.message });
  }
});

// ─── Settings & verify-mode mapping ─────────────────────────────────────────

router.get('/settings', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const settings = await loadGlobalSettings(true);
    res.json({
      success: true,
      settings,
      standardCodes: STANDARD_ZK_VERIFY_MODES,
      devices: await listDeviceConfigs(false),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read biometric settings: ' + error.message });
  }
});

router.put('/settings', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const allowed = [
      'defaultTimezone', 'heartbeatTimeoutSeconds', 'pollIntervalMs', 'clockDriftWarnSeconds',
      'minValidPunchYear', 'futureSkewSeconds', 'uploadRoot', 'maxPhotoBytes', 'reportTimeFormat',
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.pollIntervalMs !== undefined && Number(patch.pollIntervalMs) < 500) {
      return res.status(400).json({ error: 'pollIntervalMs must be at least 500ms' });
    }
    if (patch.heartbeatTimeoutSeconds !== undefined && Number(patch.heartbeatTimeoutSeconds) < 5) {
      return res.status(400).json({ error: 'heartbeatTimeoutSeconds must be at least 5' });
    }
    if (patch.defaultTimezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: String(patch.defaultTimezone) });
      } catch {
        return res.status(400).json({ error: `Unknown timezone "${patch.defaultTimezone}"` });
      }
    }

    const saved = await saveGlobalSettings(patch as any);
    deviceLog.info('Biometric settings updated', { detail: `by ${req.user?.id}, keys=${Object.keys(patch).join(',')}` });
    res.json({ success: true, settings: saved });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save biometric settings: ' + error.message });
  }
});

router.get('/verify-mapping', authorize('VIEW'), async (_req: AuthRequest, res) => {
  try {
    res.json({ success: true, mapping: await listVerifyModeMapping() });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read verify mapping: ' + error.message });
  }
});

router.post('/verify-mapping', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { rawCode, label, methodFamily, notes } = req.body;
    await upsertVerifyModeMapping({
      rawCode: Number(rawCode),
      label: String(label),
      methodFamily: String(methodFamily || 'UNKNOWN') as MethodFamily,
      notes: notes ? String(notes) : undefined,
    });
    res.json({ success: true, mapping: await listVerifyModeMapping() });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/verify-mapping/:rawCode', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    await deleteVerifyModeMapping(Number(req.params.rawCode));
    res.json({ success: true, mapping: await listVerifyModeMapping() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Calibration ────────────────────────────────────────────────────────────

router.post('/calibration', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const session = await startCalibration({
      actorId: req.user!.id,
      deviceId: req.body.deviceId,
      durationSeconds: Number(req.body.durationSeconds) || 120,
    });
    res.status(201).json({ success: true, ...session });
  } catch (error: any) {
    res.status(500).json({ error: 'Could not open calibration session: ' + error.message });
  }
});

router.get('/calibration/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const session = await getCalibrationSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Calibration session not found' });
    res.json({ success: true, session });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/calibration/:id/close', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const session = await closeCalibrationSession(req.params.id, req.user!.id);
    res.json({ success: true, session });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/calibration/:id/confirm', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { rawVerifyType, confirmedLabel, methodFamily } = req.body;
    await applyCalibrationMapping({
      sessionId: req.params.id,
      rawVerifyType: Number(rawVerifyType),
      confirmedLabel: String(confirmedLabel),
      methodFamily: String(methodFamily || 'UNKNOWN') as MethodFamily,
      actorId: req.user!.id,
    });
    res.json({
      success: true,
      message: `Code ${rawVerifyType} is now reported as ${confirmedLabel}`,
      session: await getCalibrationSession(req.params.id),
      mapping: await listVerifyModeMapping(),
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ─── Mappings, ledger, unmapped, rejected ───────────────────────────────────

router.get('/mappings', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const showroom = scopedLocation(req, req.query.showroom as string);
    if (!showroom) return res.status(403).json({ error: 'Forbidden: mappings for another showroom' });
    const mappings = await getEmployeeBiometricMappings(showroom === 'ALL' ? undefined : showroom, req.query.search as string);
    res.json({ success: true, mappings, total: mappings.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve biometric mappings: ' + error.message });
  }
});

router.post('/mappings', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, enrollmentNumber, showroomCode, serialNumber, status, notes } = req.body;
    if (!employeeId || !enrollmentNumber || !showroomCode) {
      return res.status(400).json({ error: 'employeeId, enrollmentNumber and showroomCode are required' });
    }
    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      if (resolveLocationCodeToId(showroomCode) !== userLocId) {
        return res.status(403).json({ error: 'Forbidden: mapping for another showroom' });
      }
    }

    const outcome = await saveEmployeeBiometricMapping({ employeeId, enrollmentNumber, showroomCode, serialNumber, status, notes });
    res.json({
      success: true,
      ...outcome,
      message: outcome.conflictCount > 1
        ? `Saved, but ${outcome.conflictCount} employees claim this id's last six digits — punches will be held as AMBIGUOUS until one mapping is revoked`
        : 'Employee biometric mapping saved',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save biometric mapping: ' + error.message });
  }
});

router.delete('/mappings/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    await pool.query('DELETE FROM biometric_employee_mappings WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Mapping removed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/raw-punches', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const showroomCode = scopedLocation(req, (req.query.showroomCode || req.query.locationCode) as string);
    if (!showroomCode) return res.status(403).json({ error: 'Forbidden: punches from another showroom' });
    const punches = await getRawPunchesLedger({
      serialNumber: req.query.serialNumber as string,
      enrollmentNumber: req.query.enrollmentNumber as string,
      showroomCode,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      mappingStatus: req.query.mappingStatus as string,
      verifyMethod: req.query.verifyMethod as string,
      limit: Number(req.query.limit) || 100,
    });
    res.json({ success: true, punches, total: punches.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve raw punches: ' + error.message });
  }
});

/** A single punch with its photo resolved (or the reason there is none). */
router.get('/punches/:id/photo', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, photoPath, employeeId FROM biometric_raw_punches WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Punch not found' });
    const photo = await resolvePunchPhoto(rows[0].photoPath, rows[0].employeeId);
    res.json({ success: true, ...photo });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/unmapped', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationCode = scopedLocation(req, req.query.locationCode as string);
    if (!locationCode) return res.status(403).json({ error: 'Forbidden: punches from another showroom' });
    const unmapped = await listUnmappedPunches({
      locationCode,
      serialNumber: req.query.serialNumber as string,
      limit: Number(req.query.limit) || 100,
    });
    res.json({ success: true, unmapped, total: unmapped.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve unmapped punches: ' + error.message });
  }
});

router.post('/unmapped/:id/assign', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, createMapping, showroomCode } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    const result = await assignUnmappedPunch({
      rawPunchId: req.params.id,
      employeeId,
      actorId: req.user!.id,
      createMapping: Boolean(createMapping),
      showroomCode,
    });
    res.status(result.ok ? 200 : 400).json({ success: result.ok, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Assignment failed: ' + error.message });
  }
});

router.post('/retry-held', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const outcome = await retryHeldPunches(Number(req.body.limit) || 200);
    res.json({ success: true, ...outcome, message: `${outcome.considered} held punch(es) re-evaluated` });
  } catch (error: any) {
    res.status(500).json({ error: `Reprocessing failed: ${error.message}` });
  }
});

/** Kept as an alias because the connector and older UI call it. */
router.post('/retry-failed', authorize('EDIT'), async (req: AuthRequest, res) => {
  const outcome = await retryHeldPunches(200).catch((error) => {
    res.status(500).json({ error: `Reprocessing failed: ${error.message}` });
    return null;
  });
  if (outcome) res.json({ success: true, ...outcome });
});

router.get('/rejected', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    res.json({ success: true, rejected: await listRejectedPunches(Number(req.query.limit) || 100) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Report & export ────────────────────────────────────────────────────────

function reportFiltersFrom(req: AuthRequest): ReportFilters {
  const verifyMethod = req.query.verifyMethod
    ? String(req.query.verifyMethod).split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    from: req.query.from as string,
    to: req.query.to as string,
    employeeId: req.query.employeeId as string,
    employeeCode: req.query.employeeCode as string,
    employeeQuery: req.query.employeeQuery as string,
    employeeRange: req.query.employeeRange as any,
    verifyMethod,
    serialNumber: req.query.serialNumber as string,
    deviceId: req.query.deviceId as string,
    locationCode: scopedLocation(req, (req.query.locationCode as string) || 'ALL') || 'ALL',
    mappingStatus: req.query.mappingStatus
      ? String(req.query.mappingStatus).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    limit: Number(req.query.limit) || 1000,
    offset: Number(req.query.offset) || 0,
    timeZone: (req.query.timeZone as string) || undefined,
  };
}

router.get('/report', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const report = await buildAttendanceReport(reportFiltersFrom(req));
    res.json({ success: true, ...report });
  } catch (error: any) {
    res.status(500).json({ error: 'Report failed: ' + error.message });
  }
});

router.get('/report/export', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const filters = reportFiltersFrom(req);
    const format = String(req.query.format || 'csv').toLowerCase();
    // Exports are not paginated by the UI, so widen the window deliberately.
    const report = await buildAttendanceReport({ ...filters, limit: Math.min(Number(filters.limit) || 5000, 10000) });
    const stamp = new Date().toISOString().slice(0, 10);
    const summary = describeFilters(filters, report.timeZone);

    if (format === 'xlsx' || format === 'excel') {
      await sendXlsx(res, report.rows, `BSC_Attendance_${stamp}.xlsx`, { filterSummary: summary });
      return;
    }
    sendCsv(res, toCsv(report.rows), `BSC_Attendance_${stamp}.csv`);
  } catch (error: any) {
    res.status(500).json({ error: 'Export failed: ' + error.message });
  }
});

router.get('/report/export-1601-1610', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const baseFilters = reportFiltersFrom(req);
    // Backend-enforced filter: strictly range 1601 to 1610 only
    const filters: ReportFilters = {
      ...baseFilters,
      employeeRange: '1601-1610',
      limit: 10000,
    };
    if (baseFilters.employeeCode) {
      const code = baseFilters.employeeCode.trim();
      if (ALLOWED_DAV_RANGE_CODES.includes(code)) {
        filters.employeeCode = code;
      } else {
        return res.status(400).json({ error: 'Selected employee code must be within 1601-1610' });
      }
    }

    const report = await buildAttendanceReport(filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `BSC_DAV_MB160_Attendance_1601-1610_${stamp}.csv`;

    const csvData = toCsv(report.rows, MB160_DAV_1601_1610_COLUMNS);
    sendCsv(res, csvData, filename);
  } catch (error: any) {
    res.status(500).json({ error: 'Export 1601-1610 failed: ' + error.message });
  }
});

// ─── Ingest endpoints ───────────────────────────────────────────────────────

router.post('/ingest-raw', async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const punches: any[] = Array.isArray(body) ? body : body.punches;
    if (!Array.isArray(punches) || punches.length === 0) {
      return res.status(400).json({ error: 'A non-empty array of punches is required' });
    }

    const result = await ingestRawPunches(
      punches.map((p) => ({
        ...p,
        // The connector sends ISO strings; ADMS sends naive wall strings. Both
        // are accepted and the engine decides by type.
        source: p.source || 'CONNECTOR',
      }))
    );

    res.json({
      success: true,
      message: `Ingested ${result.inserted} new, ${result.duplicates} already stored, ${result.unmapped + result.ambiguous} held for review, ${result.rejected} rejected.`,
      result,
    });
  } catch (error: any) {
    deviceLog.error('Ingest endpoint failed', { detail: error.message });
    res.status(500).json({ error: 'Ingestion failed: ' + error.message });
  }
});

router.post('/ingest-users', async (req: AuthRequest, res) => {
  try {
    const { serialNumber, users } = req.body || {};
    if (!serialNumber || !Array.isArray(users)) {
      return res.status(400).json({ error: 'serialNumber and a users array are required' });
    }
    const result = await ingestDeviceUsers(serialNumber, users);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: 'User ingestion failed: ' + error.message });
  }
});

router.get('/employee-status/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    res.json({ success: true, ...(await getEmployeeBiometricSyncDetails(req.params.employeeId)) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve employee biometric status: ' + error.message });
  }
});

router.post('/sync-employee/:employeeId', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    res.json(await syncEmployeeBiometric(req.params.employeeId));
  } catch (error: any) {
    res.status(500).json({ error: `Employee biometric sync failed: ${error.message}` });
  }
});

/**
 * What a terminal would hit if it were pointed at this path. Returns the same
 * handshake /cdata gives, so the "Test Connection" page can show the device
 * exactly what it will receive.
 */
router.get('/adms-handshake', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const serial = req.query.serialNumber as string;
    const device = serial ? await getDeviceConfig(serial) : null;
    const settings = await loadGlobalSettings();
    res.json({
      success: true,
      serialNumber: serial || null,
      timezoneOffsetMinutes: device?.timezone ? undefined : 330,
      deviceTimezone: device?.timezone || settings.defaultTimezone,
      advertised: {
        Realtime: 1,
        TransInterval: 1,
        Delay: 5,
        ErrorDelay: 30,
        ServerVersion: '3.1.1',
      },
      paths: {
        handshake: '/iclock/cdata',
        punchPush: '/iclock/cdata?table=ATTLOG&SN=<serial>',
        photoPush: '/iclock/cdata?table=ATTPHOTO&SN=<serial>',
        userPush: '/iclock/cdata?table=USERINFO&SN=<serial>',
        heartbeat: '/iclock/getrequest?SN=<serial>',
      },
      deviceMenu: 'Menu → Comm → Cloud Server Setting → Enable=On, Host=this server, Port=4000, Path=/iclock, Connection=HTTP',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/heartbeat', async (req: AuthRequest, res) => {
  const sn = String(req.body?.serialNumber || req.query.SN || '').trim();
  if (!sn) return res.status(400).json({ error: 'serialNumber is required' });
  const result = await recordDeviceHeartbeat(sn, req.ip);
  res.json({ success: Boolean(result.deviceId), ...result });
});

export default router;
