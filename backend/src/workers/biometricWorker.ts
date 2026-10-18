/**
 * Biometric device worker — the process that keeps terminals live.
 *
 * Runs separately from the API (`npm run worker`, supervised by
 * `npm run worker:supervised`) so a blocked socket read can never take the web
 * server down with it.
 *
 * Per device, per tick:
 *   1. honour the exponential-backoff gate (`nextRetryAt`) — an unreachable
 *      terminal is retried slowly, not hammered every 2.5 seconds;
 *   2. pull ATTLOG through the ZK client and hand it to the ingestion engine,
 *      which deduplicates, so re-reading the same window is harmless;
 *   3. on the first success after a failure, widen the read window so punches
 *      that happened while the link was down are back-filled;
 *   4. refresh the heartbeat so the Connected/Disconnected badge has something
 *      to age out from.
 *
 * Real-time: a standalone MB160 cannot emit events to a pull client. Live punch
 * latency comes from ADMS push (`Realtime=1` in the /cdata handshake); this
 * worker is the every-2.5s fallback for terminals that are not pointed at a
 * push server, plus the clock/drift prober.
 */

import { pool } from '../nativeDb.js';
import { socketIO } from '../socket.js';
import { deviceLog, classifyDeviceError, DeviceErrorCode } from '../services/biometric/logger.js';
import {
  loadGlobalSettings,
  readJsonSetting,
  listDeviceConfigs,
  loadSyncState,
  ensureSyncState,
  markPollAttempt,
  markBackfillPending,
  DeviceConfig,
} from '../services/biometric/settings.js';
import {
  syncSingleDevice,
  backoffMs,
  recordDeviceDisconnect,
  getDeviceStatusSnapshot,
  readLiveDeviceInfo,
} from '../services/biometricService.js';
import { runFullMismatchScan } from '../services/biometric/mismatch.js';
import { deviceIntegrationConfig } from '../config/deviceConfig.js';

interface DeviceRuntime {
  deviceId: string;
  serialNumber: string;
  name: string;
  wasConnected: boolean;
  nextAllowedPollAt: number;
  lastClockCheckAt: number;
  consecutiveEmptyReads: number;
}

const TICK_MS = 1000;
const CLOCK_CHECK_INTERVAL_MS = 5 * 60 * 1000;
// The full mismatch sweep is cheap but not free (it joins mappings × user lists
// × a punch window), so it runs on its own cadence rather than every tick.
const MISMATCH_SCAN_INTERVAL_MS =
  Math.max(Number(process.env.MISMATCH_SCAN_INTERVAL_MINUTES) || 15, 1) * 60 * 1000;

const runtimes = new Map<string, DeviceRuntime>();
let stopping = false;
let ticks = 0;
let lastMismatchScanAt = 0;

function log(fields: Record<string, unknown>): void {
  const at = new Date().toISOString();
  console.log(`[${at}] [worker] ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

async function heartbeatWorker(): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO biometric_settings (\`key\`, \`value\`)
       VALUES ('workerHeartbeatAt', CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updatedAt = NOW()`,
      [JSON.stringify(new Date().toISOString())]
    );
  } catch (err: any) {
    deviceLog.warn('Worker heartbeat not persisted', { code: 'DB_FAILURE', detail: err?.sqlMessage || err.message });
  }
}

export async function readWorkerHeartbeat(): Promise<string | null> {
  try {
    const [rows]: any = await pool.query(`SELECT \`value\` FROM biometric_settings WHERE \`key\` = 'workerHeartbeatAt'`);
    if (rows.length === 0) return null;
    const parsed = readJsonSetting(rows[0].value);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Flip devices whose heartbeat has aged past their own timeout, and emit the
 * transition once — that is what makes the badge turn red within seconds of a
 * terminal going quiet without the browser having to probe anything.
 */
async function enforceHeartbeatTimeouts(): Promise<void> {
  const snapshots = await getDeviceStatusSnapshot();
  for (const snapshot of snapshots) {
    const runtime = runtimes.get(snapshot.deviceId);
    if (!runtime) continue;

    if (runtime.wasConnected && !snapshot.connected) {
      runtime.wasConnected = false;
      deviceLog.warn('Heartbeat window expired', {
        deviceId: snapshot.deviceId,
        serialNumber: snapshot.serialNumber,
        code: 'HEARTBEAT_LOST',
        detail: `no contact for ${snapshot.secondsSinceLastSeen}s (limit ${snapshot.heartbeatTimeoutSeconds}s)`,
      });
      await recordDeviceDisconnect(
        snapshot.deviceId,
        `No heartbeat for ${snapshot.secondsSinceLastSeen}s (limit ${snapshot.heartbeatTimeoutSeconds}s)`,
        'HEARTBEAT_LOST'
      ).catch(() => undefined);
    } else if (!runtime.wasConnected && snapshot.connected) {
      runtime.wasConnected = true;
      deviceLog.info('Terminal reachable again', { deviceId: snapshot.deviceId, serialNumber: snapshot.serialNumber });
      socketIO.emit('device:status', {
        deviceId: snapshot.deviceId,
        serialNumber: snapshot.serialNumber,
        name: snapshot.name,
        locationCode: snapshot.locationCode,
        status: 'CONNECTED',
        changedAt: new Date().toISOString(),
      });
    }
  }
}

async function pollDevice(device: DeviceConfig): Promise<void> {
  const runtime = runtimes.get(device.id);
  if (!runtime) return;
  if (Date.now() < runtime.nextAllowedPollAt) return;

  // In cloud_push mode, direct TCP socket polling to private LAN IPs is bypassed
  if (!deviceIntegrationConfig.shouldPollDevice(device.ipAddress)) {
    runtime.nextAllowedPollAt = Date.now() + 60_000;
    return;
  }

  const outcome = await syncSingleDevice(device.id, 'POLL_DAEMON');

  if (outcome.status === 'SUCCESS' || outcome.status === 'PARTIAL') {
    const state = await loadSyncState(device.id);
    if (state?.backfillPending) {
      await markBackfillPending(device.id, null);
      deviceLog.info('Back-fill window consumed', { serialNumber: device.serialNumber });
    }
    runtime.nextAllowedPollAt = Date.now() + (device.pollIntervalMs || 2500);
    runtime.wasConnected = true;
    if (outcome.recordsInserted > 0 || outcome.recordsRejected > 0) {
      log({
        device: device.serialNumber,
        pulled: outcome.recordsPulled,
        new: outcome.recordsInserted,
        dup: outcome.recordsSkipped,
        rejected: outcome.recordsRejected,
        ms: outcome.durationMs,
      });
    }
  } else {
    const wait = backoffMs({ ...device, consecutiveFailures: device.consecutiveFailures + 1 } as DeviceConfig, outcome.errorCode);
    runtime.nextAllowedPollAt = Date.now() + wait;
    deviceLog.warn('Device poll failed', {
      deviceId: device.id,
      serialNumber: device.serialNumber,
      code: (outcome.errorCode as DeviceErrorCode) || 'CONNECT_TIMEOUT',
      detail: outcome.errorMessage,
    });
  }
}

async function checkDeviceClock(device: DeviceConfig): Promise<void> {
  const settings = await loadGlobalSettings();
  try {
    const info = await readLiveDeviceInfo(device.id);
    if (info.driftSeconds !== null && Math.abs(info.driftSeconds) > settings.clockDriftWarnSeconds) {
      deviceLog.warn('Device clock drifting', {
        deviceId: device.id,
        serialNumber: device.serialNumber,
        code: 'DEVICE_TIME_DRIFT',
        detail: `${info.driftSeconds}s against server (warn threshold ${settings.clockDriftWarnSeconds}s). Use "Sync device time".`,
      });
      socketIO.emit('device:clockDrift', {
        deviceId: device.id,
        serialNumber: device.serialNumber,
        name: device.name,
        driftSeconds: info.driftSeconds,
        deviceTimeLocal: info.deviceTimeLocal,
        threshold: settings.clockDriftWarnSeconds,
        checkedAt: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    const classified = classifyDeviceError(err);
    deviceLog.debug('Clock check skipped', { serialNumber: device.serialNumber, code: classified.code, detail: classified.message });
  }
}

/**
 * Periodic mismatch sweep. Runs in the worker (not the API) so it already has
 * the cross-showroom view and cannot be starved by request traffic. The inline
 * per-punch detection in ingest is near-real-time; this sweep catches the
 * slow-moving problems — duplicate ids, terminals whose user list no longer
 * matches the mapping table, employees missing from their showroom terminals.
 */
async function maybeRunMismatchScan(): Promise<void> {
  if (Date.now() - lastMismatchScanAt < MISMATCH_SCAN_INTERVAL_MS) return;
  lastMismatchScanAt = Date.now();

  const result = await runFullMismatchScan({ detectedBy: 'SCAN' });
  if (result.created > 0) {
    log({
      msg: 'biometric mismatch scan complete',
      scanned: result.scanned,
      created: result.created,
      repeated: result.repeated,
      byType: result.byType,
      ms: result.durationMs,
    });
  }
}

async function tick(): Promise<void> {
  ticks++;
  const settings = await loadGlobalSettings();
  const devices = await listDeviceConfigs(true);

  // Register/deregister runtimes as the registry changes.
  const seen = new Set(devices.map((d) => d.id));
  for (const id of [...runtimes.keys()]) if (!seen.has(id)) runtimes.delete(id);
  for (const device of devices) {
    if (!runtimes.has(device.id)) {
      runtimes.set(device.id, {
        deviceId: device.id,
        serialNumber: device.serialNumber,
        name: device.name,
        wasConnected: false,
        nextAllowedPollAt: 0,
        lastClockCheckAt: 0,
        consecutiveEmptyReads: 0,
      });
      await ensureSyncState(device.id, device.serialNumber);
      // A device that was already talking should not wait a full interval.
      const state = await loadSyncState(device.id);
      if (state?.lastPollAt) {
        await markBackfillPending(device.id, state.lastWatermarkUtc);
      }
    }
  }

  for (const device of devices) {
    if (stopping) return;
    if (device.isActive === false) continue;
    await pollDevice(device).catch(async (err) => {
      const classified = classifyDeviceError(err);
      deviceLog.error('Unhandled poll error for device', {
        serialNumber: device.serialNumber,
        code: classified.code,
        detail: classified.message,
        stack: err?.stack,
      });
    });

    if (ticks % 15 === 0 && Date.now() - (runtimes.get(device.id)?.lastClockCheckAt ?? 0) > CLOCK_CHECK_INTERVAL_MS) {
      const runtime = runtimes.get(device.id);
      if (runtime) runtime.lastClockCheckAt = Date.now();
      await checkDeviceClock(device);
    }
  }

  await enforceHeartbeatTimeouts();
  // Every tick: a cycle that polls three dead terminals can take ten seconds,
  // and the health check reads this as "the worker is alive".
  await heartbeatWorker();

  // Scheduled sweep — gated internally to every MISMATCH_SCAN_INTERVAL_MS. A
  // scan failure must never kill the poll cycle, so it is swallowed and logged.
  await maybeRunMismatchScan().catch((err) => {
    deviceLog.error('Mismatch scan failed', { detail: err?.message, code: 'DB_FAILURE' });
  });
}

export async function startWorker(options: { once?: boolean } = {}): Promise<void> {
  const settings = await loadGlobalSettings();
  log({
    msg: 'biometric worker starting',
    syncMode: deviceIntegrationConfig.syncMode,
    pollIntervalMs: settings.pollIntervalMs,
    heartbeatTimeoutSeconds: settings.heartbeatTimeoutSeconds,
    defaultTimezone: settings.defaultTimezone,
    pid: process.pid,
  });

  if (options.once) {
    await tick();
    return;
  }

  const loop = async () => {
    while (!stopping) {
      try {
        await tick();
      } catch (err: any) {
        // A failure in one tick must not end the process; the supervisor would
        // restart us, but the point of the worker is that it does not stop.
        deviceLog.error('Worker tick failed', { detail: err?.message, stack: err?.stack });
      }
      await new Promise((resolve) => setTimeout(resolve, TICK_MS));
    }
  };

  await loop();
}

function shutdown(signal: string): void {
  log({ msg: `worker stopping (${signal})` });
  stopping = true;
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason: any) => {
  deviceLog.error('Unhandled rejection in worker', { detail: reason?.message || String(reason), stack: reason?.stack });
});
process.on('uncaughtException', (err) => {
  deviceLog.error('Uncaught exception in worker — exiting for supervisor', { detail: err.message, stack: err.stack });
  process.exit(1);
});

// Direct execution: `npx tsx src/workers/biometricWorker.ts`
if (process.argv[1] && /biometricWorker(\.ts|\.js)$/.test(process.argv[1])) {
  startWorker().catch((err) => {
    console.error('Fatal worker startup error:', err);
    process.exit(1);
  });
}
