/**
 * Device and global configuration for the biometric subsystem.
 *
 * Every transport value — IP, port, comm key, timezone, polling cadence,
 * heartbeat budget — is read from the database, with an environment fallback for
 * the default port and timezone only. No terminal address exists as a literal in
 * application code any more, because three showrooms with hardcoded IPs and
 * serials is how a device ends up reported "CONNECTED" while unplugged.
 */

import { pool } from '../../nativeDb.js';
import { deviceLog } from './logger.js';
import { STANDARD_ZK_VERIFY_MODES, VerifyModeRow } from './verifyMode.js';

export interface GlobalBiometricSettings {
  defaultTimezone: string;
  heartbeatTimeoutSeconds: number;
  pollIntervalMs: number;
  clockDriftWarnSeconds: number;
  minValidPunchYear: number;
  futureSkewSeconds: number;
  uploadRoot: string;
  maxPhotoBytes: number;
  reportTimeFormat: string;
}

export interface DeviceConfig {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  firmwareVersion: string;
  ipAddress: string;
  port: number;
  commKey: number;
  timezone: string;
  pollIntervalMs: number;
  heartbeatTimeoutSeconds: number;
  realtimeEnabled: boolean;
  photoPushEnabled: boolean;
  locationId: string | null;
  locationCode: string;
  protocol: string;
  status: string;
  isActive: boolean;
  lastConnectionAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  lastWatermarkAt: Date | null;
  deviceClockAt: Date | null;
  clockDriftSeconds: number | null;
  consecutiveFailures: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  userCount: number;
  attLogCount: number;
  fpCount: number;
  faceCount: number;
  pushVersion: string | null;
}

export const SETTINGS_DEFAULTS: GlobalBiometricSettings = {
  defaultTimezone: 'Asia/Kolkata',
  heartbeatTimeoutSeconds: 15,
  pollIntervalMs: 2500,
  clockDriftWarnSeconds: 60,
  minValidPunchYear: 2020,
  futureSkewSeconds: 300,
  uploadRoot: 'uploads/attendance',
  maxPhotoBytes: 2 * 1024 * 1024,
  reportTimeFormat: 'DD/MM/YYYY HH:mm',
};

let cachedSettings: GlobalBiometricSettings | null = null;
let cachedAt = 0;
const SETTINGS_TTL_MS = 5_000;

function coerceNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === 'object' && raw !== null ? (raw as any).value ?? raw : raw;
  const value = Number(n);
  return Number.isFinite(value) ? value : fallback;
}

function coerceString(raw: unknown, fallback: string): string {
  const n = typeof raw === 'object' && raw !== null ? (raw as any).value ?? raw : raw;
  if (typeof n === 'string' && n.trim()) return n.trim();
  const asNumber = Number(n);
  return Number.isFinite(asNumber) ? String(asNumber) : fallback;
}

/**
 * Read a JSON column value defensively.
 *
 * mysql2 hands JSON columns back already parsed when it can and as text when it
 * cannot, so `JSON.parse(value)` throws on the already-parsed shape — which
 * looked like "the worker is not reporting" while the heartbeat row was fresh.
 */
export function readJsonSetting(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function loadGlobalSettings(force = false): Promise<GlobalBiometricSettings> {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedAt < SETTINGS_TTL_MS) return cachedSettings;

  const merged: GlobalBiometricSettings = {
    ...SETTINGS_DEFAULTS,
    // Environment may seed the defaults for a deployment; the database wins.
    defaultTimezone: process.env.BIOMETRIC_DEFAULT_TIMEZONE?.trim() || SETTINGS_DEFAULTS.defaultTimezone,
    pollIntervalMs: coerceNumber(process.env.BIOMETRIC_POLL_INTERVAL_MS, SETTINGS_DEFAULTS.pollIntervalMs),
    heartbeatTimeoutSeconds: coerceNumber(process.env.BIOMETRIC_HEARTBEAT_TIMEOUT_SECONDS, SETTINGS_DEFAULTS.heartbeatTimeoutSeconds),
  };

  try {
    const [rows]: any = await pool.query('SELECT `key`, `value` FROM `biometric_settings`');
    const target = merged as unknown as Record<string, string | number>;
    for (const row of rows) {
      const key = String(row.key) as keyof GlobalBiometricSettings;
      if (!(key in merged)) continue;
      const fallback = merged[key];
      target[key] = typeof fallback === 'number' ? coerceNumber(row.value, fallback) : coerceString(row.value, fallback);
    }
  } catch (err: any) {
    // A database without migration 028 applied must still run on defaults.
    deviceLog.warn('biometric_settings unreadable, using defaults', { code: 'DB_FAILURE', detail: err.sqlMessage || err.message });
  }

  cachedSettings = merged;
  cachedAt = now;
  return merged;
}

export async function saveGlobalSettings(patch: Partial<GlobalBiometricSettings>): Promise<GlobalBiometricSettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await pool.query(
      `INSERT INTO biometric_settings (\`key\`, \`value\`) VALUES (?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updatedAt = NOW()`,
      [key, JSON.stringify(value)]
    );
  }
  cachedSettings = null;
  return loadGlobalSettings(true);
}

/**
 * Verify codes accepted by the UI, newest first. Falls back to the standard ZK
 * set if the table is unavailable so a punch is never mislabelled because of a
 * missing row.
 */
export async function loadVerifyModeMap(force = false): Promise<VerifyModeRow[]> {
  const now = Date.now();
  if (!force && cachedModes && now - cachedModesAt < SETTINGS_TTL_MS) return cachedModes;
  try {
    const [rows]: any = await pool.query(
      'SELECT rawCode, label, methodFamily FROM verify_mode_mapping ORDER BY rawCode'
    );
    if (rows.length > 0) {
      cachedModes = rows.map((r: any) => ({
        rawCode: Number(r.rawCode),
        label: String(r.label),
        methodFamily: r.methodFamily,
      })) as VerifyModeRow[];
      cachedModesAt = now;
      return cachedModes;
    }
  } catch (err: any) {
    deviceLog.warn('verify_mode_mapping unreadable, using standard ZK codes', { code: 'DB_FAILURE', detail: err.sqlMessage || err.message });
  }
  cachedModes = STANDARD_ZK_VERIFY_MODES;
  cachedModesAt = now;
  return cachedModes;
}

let cachedModes: VerifyModeRow[] | null = null;
let cachedModesAt = 0;

export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cachedAt = 0;
  cachedModes = null;
  cachedModesAt = 0;
}

const DEVICE_SELECT = `
  SELECT id, serialNumber, name, model, firmwareVersion, ipAddress, port, commKey, timezone,
         pollIntervalMs, heartbeatTimeoutSeconds, realtimeEnabled, photoPushEnabled,
         locationId, locationCode, protocol, status, isActive,
         lastConnectionAt, lastHeartbeatAt, lastSeenAt, lastSyncAt, lastWatermarkAt,
         deviceClockAt, clockDriftSeconds, consecutiveFailures, nextRetryAt, lastError,
         userCount, attLogCount, fpCount, faceCount, pushVersion
    FROM biometric_devices`;

function mapDevice(row: any): DeviceConfig {
  return {
    id: row.id,
    serialNumber: row.serialNumber,
    name: row.name,
    model: row.model,
    firmwareVersion: row.firmwareVersion,
    ipAddress: row.ipAddress,
    port: Number(row.port) || Number(process.env.BIOMETRIC_TERMINAL_PORT) || 4370,
    commKey: Number(row.commKey ?? 0),
    timezone: row.timezone || 'Asia/Kolkata',
    pollIntervalMs: Number(row.pollIntervalMs) || SETTINGS_DEFAULTS.pollIntervalMs,
    heartbeatTimeoutSeconds: Number(row.heartbeatTimeoutSeconds) || SETTINGS_DEFAULTS.heartbeatTimeoutSeconds,
    realtimeEnabled: Boolean(Number(row.realtimeEnabled ?? 1)),
    photoPushEnabled: Boolean(Number(row.photoPushEnabled ?? 0)),
    locationId: row.locationId ?? null,
    locationCode: row.locationCode,
    protocol: row.protocol,
    status: row.status,
    isActive: Boolean(Number(row.isActive)),
    lastConnectionAt: row.lastConnectionAt ?? null,
    lastHeartbeatAt: row.lastHeartbeatAt ?? null,
    lastSeenAt: row.lastSeenAt ?? null,
    lastSyncAt: row.lastSyncAt ?? null,
    lastWatermarkAt: row.lastWatermarkAt ?? null,
    deviceClockAt: row.deviceClockAt ?? null,
    clockDriftSeconds: row.clockDriftSeconds === null || row.clockDriftSeconds === undefined ? null : Number(row.clockDriftSeconds),
    consecutiveFailures: Number(row.consecutiveFailures ?? 0),
    nextRetryAt: row.nextRetryAt ?? null,
    lastError: row.lastError ?? null,
    userCount: Number(row.userCount ?? 0),
    attLogCount: Number(row.attLogCount ?? 0),
    fpCount: Number(row.fpCount ?? 0),
    faceCount: Number(row.faceCount ?? 0),
    pushVersion: row.pushVersion ?? null,
  };
}

export async function listDeviceConfigs(activeOnly = true): Promise<DeviceConfig[]> {
  const sql = `${DEVICE_SELECT} ${activeOnly ? 'WHERE isActive = 1' : ''} ORDER BY locationCode, name`;
  const [rows]: any = await pool.query(sql);
  return rows.map(mapDevice);
}

/** Accepts the registry id or the serial number, with or without a JNP prefix. */
export async function getDeviceConfig(idOrSerial: string): Promise<DeviceConfig | null> {
  const key = String(idOrSerial || '').trim();
  if (!key) return null;
  const variants = [key];
  if (/^JNP/i.test(key)) variants.push(key.replace(/^JNP/i, ''));
  else variants.push(`JNP${key}`);

  const [rows]: any = await pool.query(`${DEVICE_SELECT} WHERE serialNumber IN (?) OR id = ? LIMIT 1`, [variants, key]);
  return rows.length ? mapDevice(rows[0]) : null;
}

export interface DeviceConfigPatch {
  name?: string;
  serialNumber?: string;
  model?: string;
  firmwareVersion?: string;
  ipAddress?: string;
  port?: number;
  commKey?: number;
  timezone?: string;
  pollIntervalMs?: number;
  heartbeatTimeoutSeconds?: number;
  realtimeEnabled?: boolean;
  photoPushEnabled?: boolean;
  locationCode?: string;
  isActive?: boolean;
  protocol?: string;
}

const COLUMN_FOR_KEY: Record<keyof DeviceConfigPatch, string> = {
  name: 'name',
  serialNumber: 'serialNumber',
  model: 'model',
  firmwareVersion: 'firmwareVersion',
  ipAddress: 'ipAddress',
  port: 'port',
  commKey: 'commKey',
  timezone: 'timezone',
  pollIntervalMs: 'pollIntervalMs',
  heartbeatTimeoutSeconds: 'heartbeatTimeoutSeconds',
  realtimeEnabled: 'realtimeEnabled',
  photoPushEnabled: 'photoPushEnabled',
  locationCode: 'locationCode',
  isActive: 'isActive',
  protocol: 'protocol',
};

export async function updateDeviceConfig(deviceId: string, patch: DeviceConfigPatch): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];

  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const column = COLUMN_FOR_KEY[key as keyof DeviceConfigPatch];
    if (!column) continue;
    sets.push(`\`${column}\` = ?`);
    if (typeof raw === 'boolean') params.push(raw ? 1 : 0);
    else if (key === 'locationCode') {
      const code = String(raw).toUpperCase();
      params.push(code);
      // Keep the FK in step with the code so shard routing cannot disagree.
      const [loc]: any = await pool.query('SELECT id FROM location WHERE code = ? LIMIT 1', [code]);
      sets.push('`locationId` = ?');
      params.push(loc[0]?.id ?? null);
    } else params.push(raw);
  }

  if (sets.length === 0) return;
  params.push(deviceId);
  await pool.query(`UPDATE biometric_devices SET ${sets.join(', ')}, updatedAt = NOW() WHERE id = ?`, params);
}

export async function registerDeviceConfig(input: {
  serialNumber: string;
  name: string;
  ipAddress: string;
  locationCode: string;
  port?: number;
  commKey?: number;
  timezone?: string;
  model?: string;
  firmwareVersion?: string;
  protocol?: string;
}): Promise<DeviceConfig> {
  const settings = await loadGlobalSettings();
  const [loc]: any = await pool.query('SELECT id FROM location WHERE code = ? LIMIT 1', [input.locationCode.toUpperCase()]);
  const id = `bio-dev-${input.locationCode.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36)}`;

  await pool.query(
    `INSERT INTO biometric_devices
       (id, serialNumber, name, model, firmwareVersion, ipAddress, port, commKey, timezone,
        locationId, locationCode, status, protocol, isActive, lastWatermarkAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISCONNECTED', ?, 1, NULL)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), model = VALUES(model), firmwareVersion = VALUES(firmwareVersion),
       ipAddress = VALUES(ipAddress), port = VALUES(port), commKey = VALUES(commKey),
       timezone = VALUES(timezone), locationId = VALUES(locationId), locationCode = VALUES(locationCode),
       protocol = VALUES(protocol), isActive = 1, updatedAt = NOW()`,
    [
      id,
      input.serialNumber.trim(),
      input.name.trim(),
      input.model || 'eSSL MB160',
      input.firmwareVersion || 'Unknown — read from device',
      input.ipAddress.trim(),
      input.port || Number(process.env.BIOMETRIC_TERMINAL_PORT) || 4370,
      input.commKey ?? 0,
      input.timezone || settings.defaultTimezone,
      loc[0]?.id ?? null,
      input.locationCode.toUpperCase(),
      input.protocol || 'ADMS_PUSH',
    ]
  );

  const saved = await getDeviceConfig(input.serialNumber.trim());
  if (!saved) throw new Error('Device was not persisted');
  return saved;
}

// ─── Sync state (watermark, back-fill, backoff) ─────────────────────────────

export interface DeviceSyncState {
  deviceId: string;
  serialNumber: string;
  lastPollAt: Date | null;
  lastSuccessAt: Date | null;
  lastWatermarkUtc: Date | null;
  lastBackfillFromUtc: Date | null;
  backfillPending: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  nextRetryAt: Date | null;
}

export async function loadSyncState(deviceId: string): Promise<DeviceSyncState | null> {
  const [rows]: any = await pool.query('SELECT * FROM biometric_device_sync_state WHERE deviceId = ?', [deviceId]);
  const r = rows[0];
  if (!r) return null;
  return {
    deviceId: r.deviceId,
    serialNumber: r.serialNumber,
    lastPollAt: r.lastPollAt ?? null,
    lastSuccessAt: r.lastSuccessAt ?? null,
    lastWatermarkUtc: r.lastWatermarkUtc ?? null,
    lastBackfillFromUtc: r.lastBackfillFromUtc ?? null,
    backfillPending: Boolean(Number(r.backfillPending)),
    lastErrorCode: r.lastErrorCode ?? null,
    lastErrorMessage: r.lastErrorMessage ?? null,
    consecutiveFailures: Number(r.consecutiveFailures ?? 0),
    nextRetryAt: r.nextRetryAt ?? null,
  };
}

export async function ensureSyncState(deviceId: string, serialNumber: string): Promise<void> {
  await pool.query(
    `INSERT INTO biometric_device_sync_state (deviceId, serialNumber) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE serialNumber = VALUES(serialNumber)`,
    [deviceId, serialNumber]
  );
}

/**
 * Advance the watermark only forward. A late-arriving back-filled punch is
 * legitimate, but the marker must never walk backwards or the next poll window
 * re-reads records already stored and the "nothing missed after downtime"
 * guarantee silently stops holding.
 */
export async function advanceWatermark(
  deviceId: string,
  serialNumber: string,
  newestUtcInstant: Date
): Promise<void> {
  await pool.query(
    `UPDATE biometric_device_sync_state
        SET lastWatermarkUtc = GREATEST(COALESCE(lastWatermarkUtc, ?), ?),
            backfillPending = 0,
            updatedAt = NOW()
      WHERE deviceId = ?`,
    [newestUtcInstant, newestUtcInstant, deviceId]
  );
  await pool.query(
    `UPDATE biometric_devices SET lastWatermarkAt = ? WHERE id = ?`,
    [newestUtcInstant, deviceId]
  );
}

export async function markPollAttempt(
  deviceId: string,
  at: Date,
  outcome: { success: boolean; errorCode?: string; errorMessage?: string; nextRetryAt?: Date | null; pulled?: number; ingested?: number; rejected?: number }
): Promise<void> {
  await pool.query(
    `UPDATE biometric_device_sync_state
        SET lastPollAt = ?,
            lastSuccessAt = IF(? , ?, lastSuccessAt),
            consecutiveFailures = IF(?, 0, consecutiveFailures + 1),
            lastErrorCode = ?,
            lastErrorMessage = ?,
            nextRetryAt = ?,
            recordsPulledTotal = recordsPulledTotal + ?,
            recordsIngestedTotal = recordsIngestedTotal + ?,
            recordsRejectedTotal = recordsRejectedTotal + ?,
            updatedAt = NOW()
      WHERE deviceId = ?`,
    [
      at,
      outcome.success ? 1 : 0,
      at,
      outcome.success ? 1 : 0,
      outcome.success ? null : outcome.errorCode ?? 'UNKNOWN',
      outcome.success ? null : (outcome.errorMessage ?? null),
      outcome.success ? null : outcome.nextRetryAt ?? null,
      outcome.pulled ?? 0,
      outcome.ingested ?? 0,
      outcome.rejected ?? 0,
      deviceId,
    ]
  );
}

export async function markBackfillPending(deviceId: string, fromUtc: Date | null): Promise<void> {
  await pool.query(
    `UPDATE biometric_device_sync_state
        SET backfillPending = 1, lastBackfillFromUtc = COALESCE(?, lastWatermarkUtc, lastBackfillFromUtc), updatedAt = NOW()
      WHERE deviceId = ?`,
    [fromUtc, deviceId]
  );
}
