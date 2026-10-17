/**
 * BSC Textiles HRMS — biometric device registry and synchronization.
 *
 * Responsibilities kept here: the device table, heartbeat/connectivity truth,
 * the ZK pull synchronization path, and the ledger/mapping read models.
 * Punch *ingestion* lives in `biometric/ingest.ts`; transport details live in
 * `zkProtocolAdapter.ts`. `ingestRawPunches` is re-exported for existing callers.
 *
 * Connectivity rule that drives the UI badge: a terminal is Connected only while
 * it has been *heard from* inside `heartbeatTimeoutSeconds` (default 15s) — by an
 * ADMS heartbeat, an ingested punch, or a successful poll. Nothing is marked
 * CONNECTED just because a TCP socket opened.
 */

import net from 'net';
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { socketIO } from '../socket.js';
import { shardRouter } from '../core/sharding/ShardRouter.js';
import { ZkProtocolClient, probeZkTerminal } from './zkProtocolAdapter.js';
import { deviceLog, classifyDeviceError } from './biometric/logger.js';
import {
  loadGlobalSettings,
  readJsonSetting,
  getDeviceConfig,
  listDeviceConfigs,
  updateDeviceConfig,
  registerDeviceConfig,
  ensureSyncState,
  loadSyncState,
  markPollAttempt,
  markBackfillPending,
  DeviceConfig,
} from './biometric/settings.js';
import {
  ingestPunches,
  IngestPunchInput,
  IngestResult,
  findExactCandidates,
  findSuffixCandidates,
} from './biometric/ingest.js';
import {
  wallTimeToInstant,
  formatWallString,
  deviceCalendarDate,
  clockDriftSeconds,
  fromUtcMysqlString,
} from './biometric/timeCodec.js';
import { deriveMappingKeys } from './biometric/employeeIdentity.js';
import { detectUserListMismatches } from './biometric/mismatch.js';

export { ingestPunches };
export type { IngestResult };

/**
 * Legacy entry point kept for the existing routes and tests. It accepts the
 * loose shape those callers already send and forwards everything to the single
 * ingestion engine, so there is only one set of rules about time, identity and
 * deduplication in the product.
 */
export async function ingestRawPunches(
  punches: Array<{
    serialNumber: string;
    enrollmentNumber: string;
    punchTime: string | number | Date | null | undefined;
    verifyMode?: number | string | null;
    punchState?: number | string | null;
    punchType?: string | null;
    workCode?: string | number | null;
    matchValue?: number | string | null;
    photoBase64?: string | null;
    photoPath?: string | null;
    rawDeviceTimeString?: string | null;
    source?: IngestPunchInput['source'];
  }>
): Promise<IngestResult> {
  return ingestPunches(
    punches.map((p) => ({
      serialNumber: p.serialNumber,
      enrollmentNumber: p.enrollmentNumber,
      punchTime: p.punchTime,
      verifyMode: p.verifyMode ?? null,
      punchState: p.punchState ?? null,
      punchType: p.punchType ?? null,
      workCode: p.workCode ?? null,
      matchValue: p.matchValue ?? null,
      photoBase64: p.photoBase64 ?? null,
      photoPath: p.photoPath ?? null,
      rawDeviceTimeString: p.rawDeviceTimeString ?? null,
      source: p.source || 'ADMS_PUSH',
    }))
  );
}

export interface DeviceProbeResult {
  online: boolean;
  latency: number;
  latencyMs: number;
  protocol?: 'TCP' | 'UDP';
  error?: string;
}

/** Raw TCP reachability only. Not proof a ZK terminal is answering. */
export async function probeDeviceSocket(ip: string, port = 4370, timeoutMs = 1200): Promise<DeviceProbeResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    if (!ip) {
      resolve({ online: false, latency: 999, latencyMs: 0, error: 'No IP address configured for this device' });
      return;
    }
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const finish = (result: DeviceProbeResult) => {
      socket.destroy();
      resolve(result);
    };

    socket.on('connect', () => {
      const latencyMs = Math.max(1, Date.now() - started);
      finish({ online: true, latency: latencyMs, latencyMs });
    });
    socket.on('timeout', () => finish({
      online: false,
      latency: 999,
      latencyMs: Date.now() - started,
      error: `No TCP answer from ${ip}:${port} within ${timeoutMs}ms`,
    }));
    socket.on('error', (err: any) => finish({
      online: false,
      latency: 999,
      latencyMs: Date.now() - started,
      error: err?.code === 'ECONNREFUSED'
        ? `Connection refused by ${ip}:${port}`
        : `${err?.code || 'SOCKET_ERROR'}: ${err?.message}`,
    }));

    socket.connect(port, ip);
  });
}

export interface DeviceStatusSnapshot {
  deviceId: string;
  serialNumber: string;
  name: string;
  locationCode: string;
  /** Connected when a heartbeat/punch/poll happened within the timeout. */
  connected: boolean;
  status: 'CONNECTED' | 'DISCONNECTED';
  lastSeenAt: string | null;
  secondsSinceLastSeen: number | null;
  heartbeatTimeoutSeconds: number;
  protocol: string;
  ipAddress: string;
  port: number;
  clockDriftSeconds: number | null;
  clockDriftWarning: boolean;
  deviceTimeLocal: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  photoPushEnabled: boolean;
  userCount: number;
  attLogCount: number;
}

function msSince(value: Date | string | null): number | null {
  if (!value) return null;
  const at = value instanceof Date ? value : new Date(String(value));
  if (isNaN(at.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000));
}

/**
 * Authoritative connectivity view, computed from stored heartbeats. Cheap enough
 * for the UI to poll every few seconds, and it does not open a socket per
 * request the way the old list endpoint did.
 */
export async function getDeviceStatusSnapshot(deviceIdOrSerial?: string): Promise<DeviceStatusSnapshot[]> {
  const settings = await loadGlobalSettings();
  const devices = deviceIdOrSerial
    ? [(await getDeviceConfig(deviceIdOrSerial))].filter(Boolean) as DeviceConfig[]
    : await listDeviceConfigs(true);

  return devices.map((device) => {
    const timeoutSeconds = device.heartbeatTimeoutSeconds || settings.heartbeatTimeoutSeconds;
    // Whichever of the three proofs is most recent wins.
    const candidates = [device.lastHeartbeatAt, device.lastSeenAt, device.lastSyncAt, device.lastConnectionAt]
      .filter(Boolean) as Date[];
    const mostRecent = candidates.length
      ? new Date(Math.max(...candidates.map((d) => new Date(d).getTime())))
      : null;
    const since = msSince(mostRecent);
    const connected = since !== null && since <= timeoutSeconds;

    const drift = device.clockDriftSeconds;
    return {
      deviceId: device.id,
      serialNumber: device.serialNumber,
      name: device.name,
      locationCode: device.locationCode,
      connected,
      status: connected ? 'CONNECTED' as const : 'DISCONNECTED' as const,
      lastSeenAt: mostRecent ? mostRecent.toISOString() : null,
      secondsSinceLastSeen: since,
      heartbeatTimeoutSeconds: timeoutSeconds,
      protocol: device.protocol,
      ipAddress: device.ipAddress,
      port: device.port,
      clockDriftSeconds: drift,
      clockDriftWarning: drift !== null && Math.abs(drift) > settings.clockDriftWarnSeconds,
      deviceTimeLocal: device.deviceClockAt ? formatWallString(new Date(device.deviceClockAt), device.timezone, false) : null,
      lastError: device.lastError,
      consecutiveFailures: device.consecutiveFailures,
      photoPushEnabled: device.photoPushEnabled,
      userCount: device.userCount,
      attLogCount: device.attLogCount,
    };
  });
}

/**
 * Called by the ADMS endpoints and by the poll worker. Also flips the registry to
 * CONNECTED and emits the heartbeat event so the badge updates immediately.
 */
export async function recordDeviceHeartbeat(sn: string, remoteIp?: string): Promise<{ deviceId?: string; locationCode?: string }> {
  if (!sn) return {};
  const device = await getDeviceConfig(sn);
  if (!device) {
    deviceLog.warn('Heartbeat from an unregistered terminal', {
      serialNumber: sn,
      detail: remoteIp ? `source ip ${remoteIp}` : undefined,
      code: 'CONFIG_MISSING',
    });
    return {};
  }

  await pool.query(
    `UPDATE biometric_devices
        SET status = 'CONNECTED', lastConnectionAt = NOW(), lastHeartbeatAt = NOW(),
            lastSeenAt = NOW(), lastError = NULL, consecutiveFailures = 0, nextRetryAt = NULL
      WHERE id = ?`,
    [device.id]
  );

  const nowIso = new Date().toISOString();
  socketIO.emit('device:heartbeat', {
    deviceId: device.id,
    serialNumber: device.serialNumber,
    name: device.name,
    locationCode: device.locationCode,
    status: 'CONNECTED',
    lastHeartbeatAt: nowIso,
    lastSeenAt: nowIso,
  });

  return { deviceId: device.id, locationCode: device.locationCode };
}

/**
 * Called when a poll or push attempt proves the terminal is gone. Emits the
 * disconnect event so the UI banner appears without waiting for a page refresh.
 */
export async function recordDeviceDisconnect(
  deviceIdOrSerial: string,
  reason: string,
  errorCode = 'CONNECT_TIMEOUT'
): Promise<void> {
  const device = await getDeviceConfig(deviceIdOrSerial);
  if (!device) return;

  await pool.query(
    `UPDATE biometric_devices SET status = 'DISCONNECTED', lastError = ? WHERE id = ?`,
    [`${errorCode}: ${reason}`.slice(0, 1000), device.id]
  );

  socketIO.emit('device:status', {
    deviceId: device.id,
    serialNumber: device.serialNumber,
    name: device.name,
    locationCode: device.locationCode,
    status: 'DISCONNECTED',
    reason,
    code: errorCode,
    changedAt: new Date().toISOString(),
  });
}

export async function updateDeviceSpecs(sn: string, specs: Record<string, any>): Promise<void> {
  const device = await getDeviceConfig(sn);
  if (!device) return;

  const numericFields: Array<[string, string]> = [
    ['userCount', 'userCount'],
    ['UserCount', 'userCount'],
    ['fpCount', 'fpCount'],
    ['FPCount', 'fpCount'],
    ['faceCount', 'faceCount'],
    ['FaceCount', 'faceCount'],
    ['attLogCount', 'attLogCount'],
    ['ATTLOGCount', 'attLogCount'],
    ['LogCount', 'attLogCount'],
  ];

  const sets: string[] = ['status = "CONNECTED"', 'lastConnectionAt = NOW()', 'lastHeartbeatAt = NOW()', 'lastSeenAt = NOW()', 'lastError = NULL'];
  const params: any[] = [];

  const firmware = specs.firmware || specs.Firmware || specs['~FirmwareVersion'];
  if (firmware) { sets.push('firmwareVersion = ?'); params.push(String(firmware)); }
  const pushVersion = specs.pushVersion || specs.PushVersion;
  if (pushVersion) { sets.push('pushVersion = ?'); params.push(String(pushVersion)); }

  for (const [specKey, column] of numericFields) {
    if (specs[specKey] === undefined || specs[specKey] === null) continue;
    const value = Number(specs[specKey]);
    if (!Number.isFinite(value)) continue;
    // The field list can name a column twice (userCount and UserCount); keep the
    // assignment unique so MySQL does not reject the UPDATE.
    const clause = `${column} = ?`;
    if (!sets.includes(clause)) { sets.push(clause); params.push(value); }
  }

  // A firmware that pushes photos proves it by pushing one; record the flag only
  // when the device declares support.
  const photoFlag = specs.photoSupport ?? specs.PhotoSupport ?? specs.supportPhoto;
  if (photoFlag !== undefined) {
    sets.push('photoPushEnabled = ?');
    params.push(['1', 'true', 'yes', 'Y'].includes(String(photoFlag)) ? 1 : 0);
  }

  params.push(device.id);
  await pool.query(`UPDATE biometric_devices SET ${sets.join(', ')}, updatedAt = NOW() WHERE id = ?`, params)
    .catch((err) => deviceLog.warn('Could not store device specs', { serialNumber: sn, code: 'DB_FAILURE', detail: err.message }));

  socketIO.emit('device:specs', { serialNumber: device.serialNumber, specs, updatedAt: new Date().toISOString() });
}

export interface LiveDeviceInfo {
  device: DeviceConfig;
  reachable: boolean;
  latencyMs: number;
  info: {
    serialNumber: string | null;
    firmwareVersion: string | null;
    deviceName: string | null;
    platform: string | null;
    userCount: number | null;
    logCount: number | null;
  } | null;
  deviceTimeUtc: string | null;
  deviceTimeLocal: string | null;
  serverTimeUtc: string;
  driftSeconds: number | null;
  driftWarning: boolean;
  error: string | null;
  errorCode: string | null;
}

/**
 * Read the live terminal: info, counts, clock and clock drift. Everything shown
 * on the dashboard device card comes from here, so nothing is invented.
 */
export async function readLiveDeviceInfo(deviceIdOrSerial: string): Promise<LiveDeviceInfo> {
  const settings = await loadGlobalSettings();
  const device = await getDeviceConfig(deviceIdOrSerial);
  if (!device) throw new Error('Device not found in registry');

  const base: LiveDeviceInfo = {
    device,
    reachable: false,
    latencyMs: 0,
    info: null,
    deviceTimeUtc: null,
    deviceTimeLocal: null,
    serverTimeUtc: new Date().toISOString(),
    driftSeconds: device.clockDriftSeconds,
    driftWarning: device.clockDriftSeconds !== null && Math.abs(device.clockDriftSeconds) > settings.clockDriftWarnSeconds,
    error: null as string | null,
    errorCode: null as string | null,
  };

  const client = new ZkProtocolClient(device.ipAddress, device.port, 3000, device.commKey);
  try {
    const connection = await client.connect();
    if (!connection.connected) {
      const probe = await probeZkTerminal(device.ipAddress, device.port, 1500, device.commKey);
      if (!probe.online) throw new Error(connection.error || probe.error || 'Terminal did not answer');
      base.latencyMs = probe.latencyMs;
    }

    base.reachable = true;
    const info = await client.getDeviceInfo();
    base.info = info;

    const wall = await client.getDeviceTime();
    const deviceInstant = wallTimeToInstant(wall, device.timezone);
    base.deviceTimeUtc = deviceInstant.toISOString();
    base.deviceTimeLocal = formatWallString(deviceInstant, device.timezone, false);
    base.driftSeconds = clockDriftSeconds(wall, device.timezone, new Date());
    base.driftWarning = Math.abs(base.driftSeconds) > settings.clockDriftWarnSeconds;

    await pool.query(
      `UPDATE biometric_devices
          SET status = 'CONNECTED', protocol = 'TCP_SDK', lastConnectionAt = NOW(), lastHeartbeatAt = NOW(),
              lastSeenAt = NOW(), deviceClockAt = ?, clockDriftSeconds = ?, clockDriftCheckedAt = NOW(),
              firmwareVersion = COALESCE(?, firmwareVersion), userCount = COALESCE(?, userCount),
              attLogCount = COALESCE(?, attLogCount), lastError = NULL, consecutiveFailures = 0
        WHERE id = ?`,
      [
        deviceInstant,
        base.driftSeconds,
        info.firmwareVersion,
        info.userCount,
        info.logCount,
        device.id,
      ]
    );
    await recordDeviceHeartbeat(device.serialNumber);
    return base;
  } catch (err: any) {
    const classified = classifyDeviceError(err);
    base.error = classified.message;
    base.errorCode = classified.code;
    await pool.query(
      `UPDATE biometric_devices SET status = 'DISCONNECTED', lastError = ?, consecutiveFailures = consecutiveFailures + 1 WHERE id = ?`,
      [`${classified.code}: ${classified.message}`.slice(0, 1000), device.id]
    ).catch(() => undefined);
    await recordDeviceDisconnect(device.id, classified.message, classified.code).catch(() => undefined);
    return base;
  } finally {
    try { await client.disconnect(); } catch { /* socket already closed */ }
  }
}

/** Push the server's time to the terminal, then re-measure drift. */
export async function syncDeviceClock(deviceIdOrSerial: string): Promise<{ ok: boolean; driftSecondsBefore: number | null; driftSecondsAfter: number | null; message: string }> {
  const device = await getDeviceConfig(deviceIdOrSerial);
  if (!device) throw new Error('Device not found in registry');

  const before = device.clockDriftSeconds;
  const client = new ZkProtocolClient(device.ipAddress, device.port, 3000, device.commKey);
  try {
    const connection = await client.connect();
    if (!connection.connected) throw new Error(connection.error || 'Terminal did not answer the handshake');
    await client.setDeviceTime(new Date(), device.timezone);
    const wall = await client.getDeviceTime();
    const after = clockDriftSeconds(wall, device.timezone, new Date());

    await pool.query(
      `UPDATE biometric_devices
          SET clockDriftSeconds = ?, deviceClockAt = ?, timeSyncedAt = NOW(), clockDriftCheckedAt = NOW(),
              lastSeenAt = NOW(), status = 'CONNECTED', lastError = NULL
        WHERE id = ?`,
      [after, wallTimeToInstant(wall, device.timezone), device.id]
    );

    deviceLog.info('Device clock synchronised', {
      serialNumber: device.serialNumber,
      detail: `drift ${before ?? 'unknown'}s -> ${after}s`,
    });
    return {
      ok: true,
      driftSecondsBefore: before,
      driftSecondsAfter: after,
      message: after === 0
        ? 'Device clock now matches the server.'
        : `Device clock set; residual drift ${after}s (device clock granularity is 1 second).`,
    };
  } catch (err: any) {
    const classified = classifyDeviceError(err);
    deviceLog.error('Device clock sync failed', { serialNumber: device.serialNumber, code: classified.code, detail: err?.message });
    return { ok: false, driftSecondsBefore: before, driftSecondsAfter: null, message: classified.message };
  } finally {
    try { await client.disconnect(); } catch { /* ignore */ }
  }
}

/**
 * Pull path for one device: connect, read logs newer than the watermark, and
 * hand them to the ingestion engine. On reconnect after an outage the watermark
 * window is widened so nothing missed while down is left behind.
 */
export async function syncSingleDevice(
  deviceId: string,
  triggerType: 'MANUAL_USER' | 'POLL_DAEMON' | 'CONNECTOR_SERVICE' | 'SCHEDULED_CRON' = 'MANUAL_USER'
): Promise<{
  deviceId: string;
  serialNumber: string;
  deviceName: string;
  locationCode: string;
  recordsPulled: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsRejected: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'UNREACHABLE';
  errorMessage?: string;
  errorCode?: string;
  latencyMs: number;
  durationMs: number;
  backfilled: boolean;
}> {
  const started = Date.now();
  const device = await getDeviceConfig(deviceId);
  if (!device) throw new Error('Device not found in registry');

  await ensureSyncState(device.id, device.serialNumber);
  const state = await loadSyncState(device.id);
  const backfillWindowMs = state?.backfillPending ? 6 * 60 * 60 * 1000 : 0;

  const client = new ZkProtocolClient(device.ipAddress, device.port, 3500, device.commKey);
  let records: IngestPunchInput[] = [];
  let pulled = 0;

  try {
    const connection = await client.connect();
    if (!connection.connected) {
      const classified = classifyDeviceError(new Error(connection.error || 'Handshake failed'));
      const durationMs = Date.now() - started;
      await finishSync(device, triggerType, { status: 'UNREACHABLE', pulled: 0, inserted: 0, skipped: 0, rejected: 0, durationMs, latencyMs: connection.latencyMs, errorMessage: classified.message, errorCode: classified.code });
      await markPollAttempt(device.id, new Date(), {
        success: false,
        errorCode: classified.code,
        errorMessage: classified.message,
        nextRetryAt: new Date(Date.now() + backoffMs(device, classified.code)),
      });
      await recordDeviceDisconnect(device.id, classified.message, classified.code);
      return {
        deviceId: device.id, serialNumber: device.serialNumber, deviceName: device.name, locationCode: device.locationCode,
        recordsPulled: 0, recordsInserted: 0, recordsSkipped: 0, recordsRejected: 0,
        status: 'UNREACHABLE', errorMessage: classified.message, errorCode: classified.code,
        latencyMs: connection.latencyMs, durationMs, backfilled: backfillWindowMs > 0,
      };
    }

    const latencyMs = connection.latencyMs;

    // Refresh the registry from what the terminal actually reports.
    try {
      const info = await client.getDeviceInfo();
      const wall = await client.getDeviceTime().catch(() => null);
      await pool.query(
        `UPDATE biometric_devices
            SET firmwareVersion = COALESCE(?, firmwareVersion), userCount = COALESCE(?, userCount),
                attLogCount = COALESCE(?, attLogCount), deviceClockAt = ?, clockDriftSeconds = ?,
                clockDriftCheckedAt = NOW(), protocol = 'TCP_SDK'
          WHERE id = ?`,
        [
          info.firmwareVersion, info.userCount, info.logCount,
          wall ? wallTimeToInstant(wall, device.timezone) : null,
          wall ? clockDriftSeconds(wall, device.timezone, new Date()) : null,
          device.id,
        ]
      );
    } catch (err: any) {
      deviceLog.warn('Device metadata read failed; continuing with logs', {
        serialNumber: device.serialNumber, code: classifyDeviceError(err).code,
      });
    }

    const raw = await client.getAttendanceRecords();
    pulled = raw.length;

    // Watermark + device timezone turn naive device time into a real instant.
    const cutoff = state?.lastWatermarkUtc
      ? new Date(new Date(state.lastWatermarkUtc).getTime() - backfillWindowMs)
      : null;

    records = raw
      .map((record) => {
        const instant = wallTimeToInstant(record.wall, device.timezone);
        return {
          record,
          instant,
        };
      })
      .filter(({ instant }) => !cutoff || instant > cutoff)
      .map(({ record, instant }) => ({
        serialNumber: device.serialNumber,
        enrollmentNumber: record.enrollmentNumber,
        punchTime: instant,
        verifyMode: record.verifyMode,
        punchState: record.punchState,
        workCode: record.workCode,
        matchValue: record.matchValue,
        rawDeviceTimeString: formatWallString(instant, device.timezone, true),
        source: 'ZK_PULL' as const,
      }));

    try { await client.disconnect(); } catch { /* ignore */ }

    if (records.length === 0) {
      const durationMs = Date.now() - started;
      await finishSync(device, triggerType, { status: 'SUCCESS', pulled, inserted: 0, skipped: pulled, rejected: 0, durationMs, latencyMs });
      await markPollAttempt(device.id, new Date(), { success: true, pulled, ingested: 0 });
      if (state?.backfillPending) await markBackfillPending(device.id, null);
      return {
        deviceId: device.id, serialNumber: device.serialNumber, deviceName: device.name, locationCode: device.locationCode,
        recordsPulled: pulled, recordsInserted: 0, recordsSkipped: pulled, recordsRejected: 0,
        status: 'SUCCESS', latencyMs, durationMs, backfilled: backfillWindowMs > 0,
      };
    }

    const ingest: IngestResult = await ingestPunches(records);
    const durationMs = Date.now() - started;
    const status = ingest.rejected > 0 && ingest.processed === 0 ? 'PARTIAL' : 'SUCCESS';

    await finishSync(device, triggerType, {
      status,
      pulled,
      inserted: ingest.inserted,
      skipped: ingest.duplicates,
      rejected: ingest.rejected,
      durationMs,
      latencyMs,
    });
    await markPollAttempt(device.id, new Date(), {
      success: true,
      pulled,
      ingested: ingest.inserted,
      rejected: ingest.rejected,
    });

    return {
      deviceId: device.id,
      serialNumber: device.serialNumber,
      deviceName: device.name,
      locationCode: device.locationCode,
      recordsPulled: pulled,
      recordsInserted: ingest.inserted,
      recordsSkipped: ingest.duplicates,
      recordsRejected: ingest.rejected,
      status,
      latencyMs,
      durationMs,
      backfilled: backfillWindowMs > 0,
    };
  } catch (err: any) {
    try { await client.disconnect(); } catch { /* ignore */ }
    const classified = classifyDeviceError(err);
    const durationMs = Date.now() - started;
    await finishSync(device, triggerType, {
      status: 'FAILED', pulled, inserted: 0, skipped: 0, rejected: 0,
      durationMs, latencyMs: 0, errorMessage: classified.message, errorCode: classified.code,
    });
    await markPollAttempt(device.id, new Date(), {
      success: false,
      errorCode: classified.code,
      errorMessage: classified.message,
      nextRetryAt: new Date(Date.now() + backoffMs(device, classified.code)),
    });
    deviceLog.error('Device sync failed', { serialNumber: device.serialNumber, code: classified.code, detail: err?.message });

    return {
      deviceId: device.id, serialNumber: device.serialNumber, deviceName: device.name, locationCode: device.locationCode,
      recordsPulled: pulled, recordsInserted: 0, recordsSkipped: 0, recordsRejected: 0,
      status: 'FAILED', errorMessage: classified.message, errorCode: classified.code,
      latencyMs: 0, durationMs, backfilled: backfillWindowMs > 0,
    };
  }
}

/** Retry budget: transport faults back off exponentially; auth faults do not hammer. */
export function backoffMs(device: Pick<DeviceConfig, 'consecutiveFailures'>, errorCode?: string): number {
  if (errorCode === 'COMM_KEY_REJECTED' || errorCode === 'CONFIG_MISSING') return 60_000;
  const attempt = Math.max(0, Number(device.consecutiveFailures) || 0);
  const base = 2_000;
  const ceiling = 60_000;
  return Math.min(ceiling, base * 2 ** Math.min(attempt, 5));
}

async function finishSync(
  device: DeviceConfig,
  triggerType: string,
  outcome: { status: string; pulled: number; inserted: number; skipped: number; rejected: number; durationMs: number; latencyMs: number; errorMessage?: string; errorCode?: string }
): Promise<void> {
  await pool.query(
    `INSERT INTO biometric_sync_logs
       (id, deviceId, serialNumber, triggerType, recordsPulled, recordsInserted, recordsSkipped, status, errorMessage, latencyMs, durationMs, syncedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      device.id,
      device.serialNumber,
      triggerType,
      outcome.pulled,
      outcome.inserted,
      outcome.skipped,
      outcome.status,
      outcome.errorMessage ?? null,
      outcome.latencyMs,
      outcome.durationMs,
    ]
  ).catch((err) => deviceLog.warn('Could not write sync log', { serialNumber: device.serialNumber, code: 'DB_FAILURE', detail: err.message }));

  socketIO.emit('device:sync', {
    deviceId: device.id,
    serialNumber: device.serialNumber,
    status: outcome.status,
    recordsPulled: outcome.pulled,
    recordsInserted: outcome.inserted,
    recordsSkipped: outcome.skipped,
    recordsRejected: outcome.rejected,
    error: outcome.errorMessage ?? null,
    syncedAt: new Date().toISOString(),
  });
}

export async function syncAllDevices(triggerType = 'MANUAL_USER'): Promise<any[]> {
  const devices = await listDeviceConfigs(true);
  const results: any[] = [];
  for (const device of devices) {
    try {
      results.push(await syncSingleDevice(device.id, triggerType as any));
    } catch (err: any) {
      results.push({
        deviceId: device.id, serialNumber: device.serialNumber, deviceName: device.name, locationCode: device.locationCode,
        recordsPulled: 0, recordsInserted: 0, recordsSkipped: 0, recordsRejected: 0,
        status: 'FAILED', errorMessage: err.message, latencyMs: 0, durationMs: 0,
      });
    }
  }
  return results;
}

// ─── Registry CRUD (kept as the stable service surface for routes) ───────────

export async function listBiometricDevices(locationFilter?: string): Promise<any[]> {
  const settings = await loadGlobalSettings();
  let query = `
    SELECT d.*, l.name as locationName, f.name as floorName, s.name as sectionName,
           (SELECT COUNT(*) FROM biometric_device_users u WHERE u.serialNumber = d.serialNumber) AS enrolledUsers
      FROM biometric_devices d
      LEFT JOIN location l ON d.locationId = l.id
      LEFT JOIN floor f ON f.id = d.floorId
      LEFT JOIN section s ON s.id = d.sectionId
     WHERE d.isActive = 1`;
  const params: any[] = [];
  if (locationFilter && locationFilter !== 'ALL') {
    query += ` AND (d.locationCode = ? OR d.locationId = ?)`;
    params.push(locationFilter, locationFilter);
  }
  query += ' ORDER BY d.locationCode ASC, d.name ASC';

  const [rows]: any = await pool.query(query, params);
  const statuses = await getDeviceStatusSnapshot();
  const byId = new Map(statuses.map((s) => [s.deviceId, s]));

  // "Today" is the shop-floor calendar day (IST), not the UTC day — a 23:40
  // IST punch must count towards today even though its UTC wall time is
  // yesterday.
  const [punchCounts]: any = await pool.query(
    `SELECT serialNumber, COUNT(*) AS count
       FROM biometric_raw_punches
      WHERE DATE(CONVERT_TZ(punchTimeUtc, '+00:00', '+05:30')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))
      GROUP BY serialNumber`
  );
  const punchesBySerial = new Map<string, number>(
    punchCounts.map((row: any) => [String(row.serialNumber), Number(row.count)])
  );

  return rows.map((row: any) => {
    const snapshot = byId.get(row.id);
    return {
      ...row,
      status: snapshot?.status || row.status,
      connected: snapshot?.connected ?? false,
      secondsSinceLastSeen: snapshot?.secondsSinceLastSeen ?? null,
      heartbeatTimeoutSeconds: row.heartbeatTimeoutSeconds || settings.heartbeatTimeoutSeconds,
      clockDriftSeconds: snapshot?.clockDriftSeconds ?? null,
      clockDriftWarning: snapshot?.clockDriftWarning ?? false,
      deviceTimeLocal: snapshot?.deviceTimeLocal ?? null,
      floorName: row.floorName ?? null,
      sectionName: row.sectionName ?? null,
      enrolledUsers: Number(row.enrolledUsers ?? 0),
      todaysPunches: punchesBySerial.get(String(row.serialNumber)) ?? 0,
      // Latency is only ever a measured number; no fabricated 12ms.
      latency: null,
    };
  });
}

export async function registerBiometricDevice(data: {
  serialNumber: string;
  name: string;
  model?: string;
  firmwareVersion?: string;
  ipAddress: string;
  port?: number;
  commKey?: number;
  timezone?: string;
  locationCode: string;
  protocol?: string;
}): Promise<any> {
  const device = await registerDeviceConfig(data);
  await ensureSyncState(device.id, device.serialNumber);
  return device;
}

export async function updateBiometricDevice(id: string, data: any): Promise<void> {
  await updateDeviceConfig(id, data);
}

export async function getDeviceSyncLogs(deviceId?: string, limit = 50): Promise<any[]> {
  let query = `
    SELECT l.*, d.name as deviceName, d.locationCode
      FROM biometric_sync_logs l
      LEFT JOIN biometric_devices d ON l.deviceId = d.id`;
  const params: any[] = [];
  if (deviceId) {
    query += ' WHERE l.deviceId = ? OR l.serialNumber = ?';
    params.push(deviceId, deviceId);
  }
  query += ' ORDER BY l.syncedAt DESC LIMIT ?';
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 500));

  const [rows]: any = await pool.query(query, params);
  return rows;
}

/**
 * Ledger read model. Timestamps are returned as UTC ISO plus a display string in
 * the device zone, so no client has to guess which one to render.
 */
export async function getRawPunchesLedger(options: {
  serialNumber?: string;
  enrollmentNumber?: string;
  showroomCode?: string;
  startDate?: string;
  endDate?: string;
  mappingStatus?: string;
  verifyMethod?: string;
  limit?: number;
  timeZone?: string;
}): Promise<any[]> {
  const settings = await loadGlobalSettings();
  const timeZone = options.timeZone || settings.defaultTimezone;

  let query = `
    SELECT r.id, r.deviceId, r.serialNumber, r.enrollmentNumber, r.normalizedId,
           r.punchTime, r.punchTimeUtc, r.rawDeviceTimeString, r.rawTimezone,
           r.punchType, r.verifyMode, r.rawVerifyType, r.rawPunchState, r.verifyModeLabel,
           r.workCode, r.matchValue, r.photoPath, r.mappingStatus, r.mappingCandidates,
           r.syncStatus, r.receivedAt, r.source, r.employeeId, r.errorMessage,
           d.name as deviceName, d.locationCode as deviceLocationCode,
           e.fullName as employeeName, e.employeeCode as employeeCode
      FROM biometric_raw_punches r
      LEFT JOIN biometric_devices d ON r.deviceId = d.id
      LEFT JOIN employee e ON e.id = r.employeeId
     WHERE 1=1`;
  const params: any[] = [];

  if (options.serialNumber) { query += ' AND r.serialNumber = ?'; params.push(options.serialNumber); }
  if (options.enrollmentNumber) { query += ' AND r.normalizedId = ?'; params.push(options.enrollmentNumber.replace(/^0+/, '') || options.enrollmentNumber); }
  if (options.showroomCode && options.showroomCode !== 'ALL') { query += ' AND (d.locationCode = ? OR r.serialNumber IN (SELECT serialNumber FROM biometric_devices WHERE locationCode = ?))'; params.push(options.showroomCode, options.showroomCode); }
  if (options.mappingStatus) { query += ' AND r.mappingStatus = ?'; params.push(options.mappingStatus); }
  if (options.verifyMethod) { query += ' AND r.verifyModeLabel = ?'; params.push(options.verifyMethod); }
  if (options.startDate) {
    query += ' AND r.punchTimeUtc >= ?';
    params.push(utcBoundFromDate(options.startDate, '00:00:00', timeZone));
  }
  if (options.endDate) {
    query += ' AND r.punchTimeUtc <= ?';
    params.push(utcBoundFromDate(options.endDate, '23:59:59', timeZone));
  }

  query += ' ORDER BY r.punchTimeUtc DESC LIMIT ?';
  params.push(Math.min(Math.max(Number(options.limit) || 100, 1), 2000));

  const [rows]: any = await pool.query(query, params);
  return rows.map((row: any) => decoratePunchRow(row, timeZone));
}

function utcBoundFromDate(dateYmd: string, hhmmss: string, timeZone: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const [h, mi, s] = hhmmss.split(':').map(Number);
  const instant = wallTimeToInstant({ year: y, month: m, day: d, hour: h, minute: mi, second: s, ms: 0 }, timeZone);
  return formatWallString(instant, 'UTC', true).replace(' ', 'T') + 'Z';
}

export interface AttendanceLogFilters {
  locationCode?: string;
  deviceId?: string;
  serialNumber?: string;
  floorId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeQuery?: string;
  punchType?: string;
  verifyMethod?: string;
  /** matched | mismatched | unsynced | all */
  status?: string;
  startDate?: string;
  endDate?: string;
  sort?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Device-aware attendance log: the punch ledger joined to device, floor,
 * section, department and employee, with pagination, sorting, free-text search
 * and a status view (matched / mismatched / unsynced). One query builder so the
 * on-screen table and its count never disagree.
 */
export async function listDeviceAttendanceLog(filters: AttendanceLogFilters): Promise<{
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
  timeZone: string;
}> {
  const settings = await loadGlobalSettings();
  const timeZone = settings.defaultTimezone;

  const where: string[] = ['1=1'];
  const params: any[] = [];
  if (filters.startDate) {
    where.push('r.punchTimeUtc >= ?');
    params.push(utcBoundFromDate(filters.startDate, '00:00:00', timeZone));
  }
  if (filters.endDate) {
    where.push('r.punchTimeUtc <= ?');
    params.push(utcBoundFromDate(filters.endDate, '23:59:59', timeZone));
  }
  if (filters.locationCode && filters.locationCode !== 'ALL') {
    where.push("(d.locationCode = ? OR r.serialNumber IN (SELECT serialNumber FROM biometric_devices WHERE locationCode = ?))");
    params.push(filters.locationCode, filters.locationCode);
  }
  if (filters.deviceId) { where.push('r.deviceId = ?'); params.push(filters.deviceId); }
  if (filters.serialNumber) { where.push('r.serialNumber = ?'); params.push(filters.serialNumber); }
  if (filters.floorId) { where.push('d.floorId = ?'); params.push(filters.floorId); }
  if (filters.sectionId) { where.push('d.sectionId = ?'); params.push(filters.sectionId); }
  if (filters.departmentId) { where.push('e.departmentId = ?'); params.push(filters.departmentId); }
  if (filters.punchType) { where.push('r.punchType = ?'); params.push(filters.punchType); }
  if (filters.verifyMethod) { where.push('r.verifyModeLabel = ?'); params.push(filters.verifyMethod); }
  if (filters.employeeQuery) {
    const like = `%${filters.employeeQuery.trim()}%`;
    where.push('(e.employeeCode LIKE ? OR e.fullName LIKE ? OR r.enrollmentNumber LIKE ? OR r.normalizedId LIKE ?)');
    params.push(like, like, like, like);
  }
  if (filters.status === 'matched') {
    where.push("r.mappingStatus = 'MAPPED' AND r.syncStatus = 'PROCESSED'");
  } else if (filters.status === 'mismatched') {
    where.push("(r.mappingStatus IN ('UNMAPPED','AMBIGUOUS') OR EXISTS (SELECT 1 FROM biometric_mismatch_records mm WHERE mm.punchId = r.id))");
  } else if (filters.status === 'unsynced') {
    where.push("r.syncStatus <> 'PROCESSED'");
  }

  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
  const direction = filters.sort === 'asc' ? 'ASC' : 'DESC';

  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON d.id = r.deviceId
       LEFT JOIN employee e ON e.id = r.employeeId
      WHERE ${where.join(' AND ')}`,
    params
  );

  const [rows]: any = await pool.query(
    `SELECT r.id, r.deviceId, r.serialNumber, r.enrollmentNumber, r.normalizedId,
            r.punchTimeUtc, r.rawTimezone, r.punchType, r.verifyModeLabel,
            r.mappingStatus, r.syncStatus, r.source, r.photoPath,
            e.employeeCode, e.fullName AS employeeName,
            dep.name AS departmentName,
            COALESCE(d.name, 'Unregistered terminal') AS deviceName,
            d.locationCode, f.name AS floorName, s.name AS sectionName,
            EXISTS (SELECT 1 FROM biometric_mismatch_records mm WHERE mm.punchId = r.id AND mm.status = 'OPEN') AS hasMismatch
       FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON d.id = r.deviceId
       LEFT JOIN floor f ON f.id = d.floorId
       LEFT JOIN section s ON s.id = d.sectionId
       LEFT JOIN employee e ON e.id = r.employeeId
       LEFT JOIN department dep ON dep.id = e.departmentId
      WHERE ${where.join(' AND ')}
      ORDER BY r.punchTimeUtc ${direction}, r.id ${direction}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params
  );

  const mapped = rows.map((row: any) => {
    const zone = row.rawTimezone || timeZone;
    const instant = fromUtcMysqlString(row.punchTimeUtc);
    const punchType = row.punchType || '';
    const hasMismatch = Boolean(Number(row.hasMismatch ?? 0));
    const directionLabel = punchType === 'CHECK_IN' ? 'IN' : punchType === 'CHECK_OUT' ? 'OUT' : punchType === 'MIDDLE' ? 'MIDDLE' : '—';
    let status = 'MATCHED';
    if (hasMismatch) status = 'MISMATCH';
    else if (row.mappingStatus === 'UNMAPPED') status = 'UNKNOWN_USER';
    else if (row.mappingStatus === 'AMBIGUOUS') status = 'ID_MISMATCH';
    else if (row.syncStatus !== 'PROCESSED') status = 'NOT_SYNCED';

    return {
      ...row,
      employeeName: row.employeeName ?? null,
      deviceId: row.deviceId ?? null,
      floorName: row.floorName ?? null,
      sectionName: row.sectionName ?? null,
      departmentName: row.departmentName ?? null,
      punchTimeUtc: instant ? instant.toISOString() : null,
      punchTimeLocal: instant ? formatWallString(instant, zone, false) : null,
      attendanceDate: instant ? deviceCalendarDate(instant, zone) : null,
      timezoneUsed: zone,
      direction: directionLabel,
      status,
      photoUrl: row.photoPath ? `/${String(row.photoPath).replace(/^\/+/, '')}` : null,
      hasMismatch,
    };
  });

  return { rows: mapped, total: Number(countRows[0]?.total ?? 0), page, pageSize, timeZone };
}

export function decoratePunchRow(row: any, defaultTimeZone: string): any {
  const zone = row.rawTimezone || row.deviceTimezone || defaultTimeZone;
  // punchTimeUtc is written as an explicit UTC wall string, so it must be read
  // back the same way; the pool would otherwise re-anchor those digits to its
  // +05:30 session timezone and shift the instant.
  const instant = fromUtcMysqlString(row.punchTimeUtc) ?? toInstantFromLegacy(row.punchTime);

  return {
    ...row,
    punchTimeUtc: instant ? instant.toISOString() : null,
    punchTimeLocal: instant ? formatWallString(instant, zone, false) : null,
    /** The calendar day the terminal was in — what HR groups a punch under. */
    attendanceDate: instant ? deviceCalendarDate(instant, zone) : null,
    timezoneUsed: zone,
    photoUrl: row.photoPath ? `/${String(row.photoPath).replace(/^\/+/, '')}` : null,
    photoMissingReason: row.photoPath ? null : 'No photo available from device',
  };
}

/** Rows written before migration 028 only have the pool-managed `punchTime`. */
function toInstantFromLegacy(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined) return null;
  const parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function getEmployeeBiometricMappings(showroomCode?: string, search?: string): Promise<any[]> {
  let query = `
    SELECT m.*, e.fullName, e.employeeCode, e.designation, d.name as departmentName, l.name as locationName,
           (SELECT COUNT(*) FROM biometric_raw_punches r WHERE r.employeeId = m.employeeId AND r.syncStatus = 'PROCESSED') AS punchCount
      FROM biometric_employee_mappings m
      INNER JOIN employee e ON m.employeeId = e.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN location l ON e.locationId = l.id
     WHERE 1=1`;
  const params: any[] = [];
  if (showroomCode && showroomCode !== 'ALL') { query += ' AND m.showroomCode = ?'; params.push(showroomCode); }
  if (search) {
    query += ' AND (e.fullName LIKE ? OR e.employeeCode LIKE ? OR m.enrollmentNumber LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY m.showroomCode ASC, e.fullName ASC';
  const [rows]: any = await pool.query(query, params);
  return rows;
}

export async function saveEmployeeBiometricMapping(data: {
  employeeId: string;
  enrollmentNumber: string;
  showroomCode: string;
  serialNumber?: string;
  status?: string;
  notes?: string;
  mappingSource?: string;
}): Promise<{ conflictCount: number; status: string }> {
  const enrollment = data.enrollmentNumber.trim();
  const { normalizedEnrollment, lastSixDigits } = deriveMappingKeys(enrollment);
  const status = data.status || 'ACTIVE';
  const id = `map-${data.showroomCode.toUpperCase()}-${normalizedEnrollment}`;

  await pool.query(
    `INSERT INTO biometric_employee_mappings
       (id, employeeId, enrollmentNumber, normalizedEnrollment, lastSixDigits, serialNumber, showroomCode, status, effectiveDate, notes, mappingSource)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?)
     ON DUPLICATE KEY UPDATE
       employeeId = VALUES(employeeId),
       normalizedEnrollment = VALUES(normalizedEnrollment),
       lastSixDigits = VALUES(lastSixDigits),
       serialNumber = VALUES(serialNumber),
       showroomCode = VALUES(showroomCode),
       status = VALUES(status),
       notes = VALUES(notes),
       mappingSource = VALUES(mappingSource),
       updatedAt = NOW()`,
    [
      id,
      data.employeeId,
      enrollment,
      normalizedEnrollment,
      lastSixDigits,
      data.serialNumber ? data.serialNumber.trim() : null,
      data.showroomCode.toUpperCase(),
      status,
      data.notes || null,
      data.mappingSource || 'MANUAL',
    ]
  );

  // Recompute how many employees now claim this suffix, and mark the registry
  // AMBIGUOUS when it is more than one, so the punch path refuses to guess.
  const [countRows]: any = await pool.query(
    `SELECT COUNT(DISTINCT employeeId) AS n FROM biometric_employee_mappings
      WHERE lastSixDigits = ? AND status IN ('ACTIVE','AMBIGUOUS')`,
    [lastSixDigits]
  );
  const conflictCount = Number(countRows[0]?.n || 0);
  const effectiveStatus = conflictCount > 1 ? 'AMBIGUOUS' : status;

  await pool.query(
    `UPDATE biometric_employee_mappings
        SET status = ?, conflictCount = ?
      WHERE lastSixDigits = ?`,
    [effectiveStatus, conflictCount, lastSixDigits]
  );

  return { conflictCount, status: effectiveStatus };
}

export async function getEmployeeBiometricSyncDetails(employeeIdOrCode: string): Promise<any> {
  const queryVal = (employeeIdOrCode || '').trim();
  const normalized = queryVal.replace(/^0+/, '') || queryVal;

  const [empRows]: any = await pool.query(
    `SELECT e.*, l.name as locationName, l.code as locationCode, d.name as departmentName, s.name as shiftName
       FROM employee e
       LEFT JOIN location l ON e.locationId = l.id
       LEFT JOIN department d ON e.departmentId = d.id
       LEFT JOIN shift s ON e.shiftId = s.id
      WHERE e.id = ? OR e.employeeCode = ? OR TRIM(LEADING '0' FROM e.employeeCode) = ?
         OR e.biometricDeviceEmployeeId = ? OR e.legacyEmployeeCode = ?
      LIMIT 1`,
    [queryVal, queryVal, normalized, queryVal, queryVal]
  );
  const employee = empRows[0] || null;

  const [mapRows]: any = await pool.query(
    `SELECT * FROM biometric_employee_mappings
      WHERE employeeId = ?
         OR normalizedEnrollment = ?
         OR TRIM(LEADING '0' FROM enrollmentNumber) = ?
      ORDER BY updatedAt DESC LIMIT 1`,
    [employee?.id || queryVal, normalized, normalized]
  );
  const mapping = mapRows[0] || null;

  const showroomCode = employee?.locationCode || mapping?.showroomCode || 'BEL';

  const [devRows]: any = await pool.query(
    `SELECT id, serialNumber, name, model, firmwareVersion, ipAddress, port, timezone, status, protocol,
            lastConnectionAt, lastHeartbeatAt, lastSeenAt, lastSyncAt, clockDriftSeconds, photoPushEnabled
       FROM biometric_devices
      WHERE locationCode = ? AND isActive = 1
      ORDER BY lastSeenAt DESC`,
    [showroomCode]
  );

  const [punchRows]: any = await pool.query(
    `SELECT id, serialNumber, enrollmentNumber, punchTime, punchTimeUtc, punchType, verifyMode,
            rawVerifyType, rawPunchState, verifyModeLabel, photoPath, syncStatus, mappingStatus, receivedAt
       FROM biometric_raw_punches
      WHERE employeeId = ? OR normalizedId = ?
      ORDER BY punchTimeUtc DESC LIMIT 10`,
    [employee?.id || queryVal, normalized]
  );

  const statuses = await getDeviceStatusSnapshot();
  const statusById = new Map(statuses.map((s) => [s.deviceId, s]));
  const devices = devRows.map((d: any) => ({
    ...d,
    connected: statusById.get(d.id)?.connected ?? false,
    secondsSinceLastSeen: statusById.get(d.id)?.secondsSinceLastSeen ?? null,
  }));
  const isDeviceOnline = devices.some((d: any) => d.connected);

  let syncStatus = 'UNMAPPED';
  let statusMessage = 'No biometric mapping configured';
  if (mapping && mapping.status === 'AMBIGUOUS') {
    syncStatus = 'AMBIGUOUS';
    statusMessage = `Device id ${mapping.enrollmentNumber} is claimed by ${mapping.conflictCount || 2} employees; punches are held for review`;
  } else if (mapping && isDeviceOnline) {
    syncStatus = 'CONNECTED';
    statusMessage = 'Biometric mapping active and terminal reporting live';
  } else if (mapping && !isDeviceOnline) {
    syncStatus = 'DISCONNECTED';
    statusMessage = 'Terminal offline or past its heartbeat window';
  } else if (!mapping && employee) {
    syncStatus = 'AWAITING_ENROLLMENT';
    statusMessage = `No mapping for device id ${normalized}`;
  } else if (!employee) {
    syncStatus = 'NOT_FOUND';
    statusMessage = `Employee identifier ${queryVal} is not in the HRMS`;
  }

  return {
    found: Boolean(employee),
    employee: employee ? {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      firstName: employee.firstName,
      lastName: employee.lastName,
      designation: employee.designation,
      role: employee.role,
      locationId: employee.locationId,
      locationCode: employee.locationCode,
      locationName: employee.locationName,
      departmentName: employee.departmentName,
      shiftName: employee.shiftName,
      status: employee.status,
      biometricDeviceEmployeeId: employee.biometricDeviceEmployeeId,
      photoReference: employee.photoReference ?? null,
    } : null,
    biometricSync: {
      enrollmentNumber: mapping?.enrollmentNumber || employee?.biometricDeviceEmployeeId || queryVal,
      showroomCode,
      mappingId: mapping?.id || null,
      mapped: Boolean(mapping),
      isDeviceOnline,
      status: syncStatus,
      statusMessage,
      devices,
      recentPunches: punchRows,
      lastSuccessfulSyncAt: mapping?.updatedAt || devices[0]?.lastSyncAt || null,
    },
  };
}

/**
 * Persist one row of the terminal's own user list — what the device *thinks*
 * it has enrolled. This is the reference that makes name, id, not-synced and
 * unknown-user mismatches detectable at all. Upsert by (serial, pin) so a
 * repeats of the same USERINFO push only refresh `lastSeenAt`.
 */
async function upsertDeviceUser(
  device: { id: string; serialNumber: string; locationCode: string } | null,
  serialNumber: string,
  user: { pin: string; normalized: string; name: string | null; card: string | null; privilege: number | null },
  resolved: { employeeId: string | null; mappingStatus: 'MAPPED' | 'AMBIGUOUS' | 'UNMAPPED' }
): Promise<void> {
  const id = `bdu-${crypto.createHash('sha1').update(`${serialNumber}|${user.normalized}`).digest('hex').slice(0, 24)}`;
  await pool.query(
    `INSERT INTO biometric_device_users
       (id, deviceId, serialNumber, locationCode, pin, normalizedPin, deviceName, cardNumber, privilege,
        employeeId, mappingStatus, firstSeenAt, lastSeenAt, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), ?)
     ON DUPLICATE KEY UPDATE
       deviceId = COALESCE(VALUES(deviceId), deviceId),
       locationCode = VALUES(locationCode),
       deviceName = VALUES(deviceName),
       cardNumber = COALESCE(VALUES(cardNumber), cardNumber),
       privilege = COALESCE(VALUES(privilege), privilege),
       employeeId = VALUES(employeeId),
       mappingStatus = VALUES(mappingStatus),
       lastSeenAt = NOW(3),
       raw = VALUES(raw)`,
    [
      id,
      device?.id ?? null,
      serialNumber,
      device?.locationCode || 'BEL',
      user.pin,
      user.normalized,
      user.name,
      user.card,
      user.privilege,
      resolved.employeeId,
      resolved.mappingStatus,
      JSON.stringify({ pin: user.pin, name: user.name, card: user.card, privilege: user.privilege }),
    ]
  ).catch((err: any) => deviceLog.warn('Could not persist device user row', { code: 'DB_FAILURE', detail: err?.sqlMessage || err.message }));
}

/**
 * USERINFO push from a terminal (ADMS `table=USERINFO`). Registers the device
 * enrollment number against an employee using the same normalisation the punch
 * path uses, and refuses to claim a mapping is unique when it is not.
 */
export async function ingestDeviceUsers(
  serialNumber: string,
  users: Array<{ pin: string; name?: string; privilege?: number; card?: string; password?: string }>
): Promise<{
  processed: number;
  updatedEmployees: number;
  mapped: number;
  ambiguous: number;
  unlinked: number;
  mismatches: { created: number; repeated: number } | null;
}> {
  const device = await getDeviceConfig(serialNumber);
  const showroom = device?.locationCode || 'BEL';

  let processed = 0;
  let updatedEmployees = 0;
  let mapped = 0;
  let ambiguous = 0;
  let unlinked = 0;

  for (const user of users) {
    const pin = String(user.pin ?? '').trim();
    if (!pin) continue;
    processed++;

    const normalized = pin.replace(/^0+/, '') || pin;
    const lastSix = normalized.length > 6 ? normalized.slice(-6) : normalized.padStart(6, '0');

    const exact = await findExactCandidates(normalized);
    const distinctExact = [...new Set(exact.map((c) => c.employeeId))];
    let employeeId: string | null = distinctExact.length === 1 ? distinctExact[0] : null;
    let status: 'ACTIVE' | 'AMBIGUOUS' = distinctExact.length > 1 ? 'AMBIGUOUS' : 'ACTIVE';

    if (!employeeId && distinctExact.length === 0) {
      const suffix = await findSuffixCandidates(lastSix);
      const distinctSuffix = [...new Set(suffix.map((c) => c.employeeId))];
      if (distinctSuffix.length === 1) employeeId = distinctSuffix[0];
      else if (distinctSuffix.length > 1) { status = 'AMBIGUOUS'; ambiguous++; }
    }

    if (employeeId) {
      mapped++;
      // Only fill in a device name when the HR record is missing one; a real HR
      // name must never be overwritten by whatever was typed on the terminal.
      const [empRows]: any = await pool.query(
        'SELECT fullName, biometricDeviceEmployeeId FROM employee WHERE id = ?',
        [employeeId]
      );
      const current = empRows[0];
      const updates: string[] = ['biometricDeviceEmployeeId = ?'];
      const params: any[] = [pin];
      const deviceName = String(user.name ?? '').trim();
      if (deviceName && (!current?.fullName || /pending|awaiting/i.test(current.fullName))) {
        updates.push('fullName = ?');
        params.push(deviceName);
      }
      params.push(employeeId);
      await pool.query(`UPDATE employee SET ${updates.join(', ')}, updatedAt = NOW() WHERE id = ?`, params);
      updatedEmployees++;
    } else if (status === 'ACTIVE') {
      unlinked++;
    }

    await saveEmployeeBiometricMapping({
      employeeId: employeeId || `unlinked-${normalized}`,
      enrollmentNumber: pin,
      showroomCode: showroom,
      serialNumber: device?.serialNumber || serialNumber,
      status,
      notes: user.name ? `Device name: ${user.name}` : 'Enrolled on terminal',
      mappingSource: 'ADMS_USERINFO',
    });

    // The terminal's own view of this user, kept verbatim for the mismatch
    // engine — the employee master is never silently overwritten by it.
    await upsertDeviceUser(device, device?.serialNumber || serialNumber, {
      pin,
      normalized,
      name: String(user.name ?? '').trim() || null,
      card: user.card ? String(user.card).trim() : null,
      privilege: user.privilege === null || user.privilege === undefined ? null : Number(user.privilege),
    }, {
      employeeId,
      mappingStatus: employeeId ? (status === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'MAPPED') : 'UNMAPPED',
    });

    socketIO.emit('biometric:user_synced', {
      serialNumber,
      pin,
      name: user.name || null,
      employeeId,
      showroomCode: showroom,
      status,
      syncedAt: new Date().toISOString(),
    });
  }

  if (device?.id) {
    await pool.query(
      'UPDATE biometric_devices SET userCount = ?, lastHeartbeatAt = NOW(), lastSeenAt = NOW(), status = ? WHERE id = ?',
      [processed, 'CONNECTED', device.id]
    ).catch(() => undefined);
  }

  // Now that the terminal's list is stored, re-evaluate it against the
  // mappings and employee masters so name/id/unknown-user issues surface
  // immediately instead of waiting for the next sweep.
  let mismatches: { created: number; repeated: number } | null = null;
  if (device?.serialNumber) {
    const detected = await detectUserListMismatches(device.serialNumber).catch(() => null);
    if (detected) mismatches = { created: detected.created, repeated: detected.repeated };
  }

  return { processed, updatedEmployees, mapped, ambiguous, unlinked, mismatches };
}

// ─── ADMS command queue ─────────────────────────────────────────────────────
const pendingDeviceCommands: Map<string, Array<{ id: string; command: string; queuedAt: Date }>> = new Map();

export function queueDeviceCommand(serialNumber: string, command: string): string {
  const cleanSn = (serialNumber || '').trim().toUpperCase();
  const cmdId = `CMD-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  if (!pendingDeviceCommands.has(cleanSn)) pendingDeviceCommands.set(cleanSn, []);
  pendingDeviceCommands.get(cleanSn)!.push({ id: cmdId, command, queuedAt: new Date() });
  return cmdId;
}

export function popDeviceCommand(serialNumber: string): { id: string; command: string } | null {
  const queue = pendingDeviceCommands.get((serialNumber || '').trim().toUpperCase());
  const item = queue?.shift();
  return item ? { id: item.id, command: item.command } : null;
}

export function peekDeviceCommands(serialNumber: string): Array<{ id: string; command: string; queuedAt: Date }> {
  return [...(pendingDeviceCommands.get((serialNumber || '').trim().toUpperCase()) || [])];
}

/**
 * Ask registered terminals for a fresh USERINFO/ATTLOG push. With ADMS the
 * server cannot poll the device, so the command is queued and delivered on the
 * terminal's next getrequest heartbeat.
 */
export async function syncEmployeeBiometric(employeeIdOrCode: string): Promise<any> {
  const details = await getEmployeeBiometricSyncDetails(employeeIdOrCode);
  const showroom = details.biometricSync?.showroomCode;
  const [devices]: any = await pool.query(
    'SELECT serialNumber, name FROM biometric_devices WHERE locationCode = ? AND isActive = 1',
    [showroom || 'BEL']
  );

  for (const device of devices) {
    queueDeviceCommand(device.serialNumber, 'DATA QUERY USERINFO');
    queueDeviceCommand(device.serialNumber, 'DATA QUERY ATTLOG');
  }

  // Also try the direct pull path for terminals reachable from this server.
  const syncResults: any[] = [];
  for (const device of devices) {
    try {
      const [row]: any = await pool.query('SELECT id FROM biometric_devices WHERE serialNumber = ? LIMIT 1', [device.serialNumber]);
      if (row[0]) syncResults.push(await syncSingleDevice(row[0].id, 'MANUAL_USER'));
    } catch (err: any) {
      syncResults.push({ serialNumber: device.serialNumber, status: 'FAILED', errorMessage: err.message });
    }
  }

  return {
    success: true,
    message: `Requested a fresh USERINFO/ATTLOG from ${devices.length} terminal(s) for ${employeeIdOrCode}`,
    commandsQueued: devices.length * 2,
    pullResults: syncResults,
    employeeDetails: details,
  };
}

/** Shard replication stays best-effort: a shard being down must not lose a punch. */
export async function replicatePunchToShard(locationCode: string, payload: Record<string, any>): Promise<void> {
  try {
    const { databaseId, pool: shardPool } = await shardRouter.resolveLocationDatabase(locationCode);
    if (!databaseId || databaseId === 'BSC-SHARD-HQ-001') return;
    await shardPool.query(
      `INSERT INTO biometric_raw_punches
         (id, deviceId, employeeId, serialNumber, enrollmentNumber, normalizedId, punchTime, punchTimeUtc,
          punchType, verifyMode, rawVerifyType, rawPunchState, verifyModeLabel, photoPath,
          syncStatus, isProcessed, processedAt, attendanceId, dedupHash, mappingStatus, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSED', 1, NOW(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE syncStatus = 'PROCESSED', isProcessed = 1, attendanceId = VALUES(attendanceId)`,
      [
        payload.id, payload.deviceId, payload.employeeId, payload.serialNumber, payload.enrollmentNumber,
        payload.normalizedId, payload.punchTime, payload.punchTimeUtc, payload.punchType, payload.verifyMode,
        payload.rawVerifyType, payload.rawPunchState, payload.verifyModeLabel, payload.photoPath,
        payload.attendanceId, payload.dedupHash, payload.mappingStatus, payload.source,
      ]
    );
  } catch (err: any) {
    deviceLog.warn('Shard replication skipped', { code: 'DB_FAILURE', detail: err.message });
  }
}

/**
 * Health of the biometric subsystem, for /api/health and the diagnose script.
 * Answers "is anything actually flowing?" rather than "is the process up?".
 */
export async function readBiometricHealth(): Promise<{
  ok: boolean;
  workerHeartbeatAgeSeconds: number | null;
  devices: { total: number; connected: number; disconnected: number; drifting: number };
  heldForReview: { unmapped: number; ambiguous: number };
  rejectedLast24h: number;
  lastPunchUtc: string | null;
  reasons: string[];
}> {
  const reasons: string[] = [];
  const snapshots = await getDeviceStatusSnapshot();
  const connected = snapshots.filter((s) => s.connected).length;
  const drifting = snapshots.filter((s) => s.clockDriftWarning).length;

  let held = { unmapped: 0, ambiguous: 0 };
  let rejectedLast24h = 0;
  let lastPunchUtc: string | null = null;
  try {
    const [rows]: any = await pool.query(
      `SELECT SUM(mappingStatus = 'UNMAPPED') AS unmapped,
              SUM(mappingStatus = 'AMBIGUOUS') AS ambiguous
         FROM biometric_raw_punches`
    );
    held = { unmapped: Number(rows[0]?.unmapped || 0), ambiguous: Number(rows[0]?.ambiguous || 0) };

    const [rejectedRows]: any = await pool.query(
      'SELECT COUNT(*) AS n FROM biometric_rejected_punches WHERE receivedAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    );
    rejectedLast24h = Number(rejectedRows[0]?.n || 0);

    const [punchRow]: any = await pool.query('SELECT MAX(punchTimeUtc) AS newest FROM biometric_raw_punches');
    const newest = fromUtcMysqlString(punchRow[0]?.newest);
    lastPunchUtc = newest ? newest.toISOString() : null;
  } catch (err: any) {
    reasons.push(`ledger unreadable: ${err?.sqlMessage || err.message}`);
  }

  let workerAge: number | null = null;
  try {
    const [hb]: any = await pool.query(`SELECT \`value\` FROM biometric_settings WHERE \`key\` = 'workerHeartbeatAt'`);
    if (hb.length) {
      const parsed = readJsonSetting(hb[0].value);
      if (parsed) workerAge = Math.floor((Date.now() - new Date(String(parsed)).getTime()) / 1000);
    }
  } catch { /* worker simply has not written yet */ }

  const settings = await loadGlobalSettings();
  // A tick that has to time out against several dead terminals takes tens of
  // seconds, so the liveness budget is wider than the tick interval itself.
  if (workerAge === null || workerAge > 90) reasons.push('biometric worker heartbeat is missing or older than 90s');
  if (snapshots.length > 0 && connected === 0) reasons.push('no terminal has been heard from inside its heartbeat window');
  if (drifting > 0) reasons.push(`${drifting} terminal(s) clock drift over ${settings.clockDriftWarnSeconds}s`);
  if (held.unmapped + held.ambiguous > 0) reasons.push(`${held.unmapped + held.ambiguous} punch(es) awaiting employee mapping`);

  return {
    ok: reasons.length === 0,
    workerHeartbeatAgeSeconds: workerAge,
    devices: { total: snapshots.length, connected, disconnected: snapshots.length - connected, drifting },
    heldForReview: held,
    rejectedLast24h,
    lastPunchUtc,
    reasons,
  };
}

export type { DeviceConfig };
