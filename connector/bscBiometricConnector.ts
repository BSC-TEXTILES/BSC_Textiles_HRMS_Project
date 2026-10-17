/**
 * BSC Textiles HRMS — showroom edge connector
 *
 * For a terminal on a LAN the server cannot route to. It polls the local
 * eSSL/ZKTeco terminals over the ZK protocol and forwards punches to the HRMS
 * ingest endpoint, buffering to disk when the link is down.
 *
 * The device list is **read from the HRMS API** (`GET /api/devices`), not from
 * environment constants: hardcoding three showroom IPs is what let a device
 * appear "connected" while nothing was plugged in, and it made every deployment
 * identical. Per-device IP, port, comm key, timezone and poll cadence all come
 * from the registry now; `CONNECTOR_LOCATION_CODE` scopes which site this
 * instance serves.
 *
 *   npm run connector            (from connector/)
 *   CONNECTOR_LOCATION_CODE=DAV CLOUD_API_URL=https://hrms.example/api npm run connector
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZkProtocolClient } from '../backend/src/services/zkProtocolAdapter.js';
import { wallTimeToInstant, formatWallString } from '../backend/src/services/biometric/timeCodec.js';

const CLOUD_API_URL = (process.env.CLOUD_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const CONNECTOR_KEY = process.env.BIOMETRIC_CONNECTOR_KEY || '';
const HEALTH_PORT = Number(process.env.CONNECTOR_HEALTH_PORT) || 4371;
const LOCATION_CODE = (process.env.CONNECTOR_LOCATION_CODE || '').toUpperCase();
/** How often the registry is re-read, so adding a terminal needs no restart. */
const REGISTRY_REFRESH_MS = Number(process.env.CONNECTOR_REFRESH_MS) || 30_000;
const DEFAULT_POLL_MS = Number(process.env.CONNECTOR_POLL_INTERVAL) || 2500;
const QUEUE_FILE = path.resolve(process.cwd(), 'offline-punch-queue.json');
const MAX_QUEUE_ENTRIES = 20_000;

interface RemoteDevice {
  deviceId: string;
  serialNumber: string;
  name: string;
  ipAddress: string;
  port: number;
  commKey: number;
  timezone: string;
  pollIntervalMs: number;
  locationCode: string;
}

interface QueuedPunch {
  serialNumber: string;
  enrollmentNumber: string;
  /** Naive device wall time; the server interprets it in the device's zone. */
  punchTime: string;
  punchState: number | null;
  verifyMode: number | null;
  workCode: number | null;
  matchValue: number | null;
  queuedAt: string;
}

let devices: RemoteDevice[] = [];
let lastRegistryError: string | null = null;
const nextAllowedPollAt = new Map<string, number>();
const lastWatermark = new Map<string, number>();

let totalForwarded = 0;
let totalPulled = 0;
let consecutiveUploadFailures = 0;
let lastPollAt: string | null = null;
let lastUploadAt: string | null = null;

function log(message: string, extra: Record<string, unknown> = {}): void {
  const parts = Object.entries(extra).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`[${new Date().toISOString()}] [connector] ${message}${parts.length ? ` ${parts.join(' ')}` : ''}`);
}

function loadQueue(): QueuedPunch[] {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err: any) {
    log('queue file unreadable, starting empty', { error: err.message });
  }
  return [];
}

function saveQueue(queue: QueuedPunch[]): void {
  try {
    const trimmed = queue.length > MAX_QUEUE_ENTRIES ? queue.slice(-MAX_QUEUE_ENTRIES) : queue;
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(trimmed), 'utf-8');
  } catch (err: any) {
    log('could not persist queue', { error: err.message });
  }
}

async function apiFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CLOUD_API_URL}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-connector-key': CONNECTOR_KEY,
      ...(CONNECTOR_KEY ? { Authorization: `Bearer ${CONNECTOR_KEY}` } : {}),
      ...(init.headers || {}),
    },
  });
}

/** Pull the terminal registry from the HRMS so nothing is hardcoded here. */
async function refreshRegistry(): Promise<void> {
  try {
    const response = await apiFetch('/devices');
    if (!response.ok) {
      lastRegistryError = `HTTP ${response.status}`;
      log('registry fetch rejected', { status: response.status });
      return;
    }
    const payload: any = await response.json();
    const rows = Array.isArray(payload.devices) ? payload.devices : [];
    devices = rows
      .filter((row: any) => !LOCATION_CODE || String(row.locationCode || '').toUpperCase() === LOCATION_CODE)
      .map((row: any) => ({
        deviceId: row.id,
        serialNumber: String(row.serialNumber),
        name: String(row.name || row.serialNumber),
        ipAddress: String(row.ipAddress || ''),
        port: Number(row.port) || 4370,
        commKey: Number(row.commKey ?? 0),
        timezone: String(row.timezone || 'Asia/Kolkata'),
        pollIntervalMs: Number(row.pollIntervalMs) || DEFAULT_POLL_MS,
        locationCode: String(row.locationCode || LOCATION_CODE || 'ALL'),
      }))
      .filter((device: RemoteDevice) => Boolean(device.ipAddress));

    lastRegistryError = null;
  } catch (err: any) {
    lastRegistryError = err.message;
    log('registry fetch failed', { error: err.message, api: CLOUD_API_URL });
  }
}

async function uploadQueue(): Promise<void> {
  const queue = loadQueue();
  if (queue.length === 0) return;

  try {
    const response = await apiFetch('/devices/ingest-raw', {
      method: 'POST',
      body: JSON.stringify({ punches: queue.map(({ queuedAt, ...punch }) => ({ ...punch, source: 'CONNECTOR' })) }),
    });

    if (!response.ok) {
      consecutiveUploadFailures++;
      log('cloud rejected batch', { status: response.status, body: (await response.text()).slice(0, 200) });
      return;
    }

    const result: any = await response.json();
    const accepted = result?.result?.inserted ?? queue.length;
    totalForwarded += queue.length;
    lastUploadAt = new Date().toISOString();
    consecutiveUploadFailures = 0;
    saveQueue([]);
    log('uploaded', { batch: queue.length, stored: accepted, detail: result?.message || '' });
  } catch (err: any) {
    // Offline is normal here: the queue is on disk and will be retried.
    consecutiveUploadFailures++;
    log('cloud unreachable, buffering locally', { error: err.message, queued: queue.length });
  }
}

async function pollDevice(device: RemoteDevice): Promise<void> {
  if (Date.now() < (nextAllowedPollAt.get(device.deviceId) ?? 0)) return;

  const client = new ZkProtocolClient(device.ipAddress, device.port, 3000, device.commKey);
  try {
    const connection = await client.connect();
    if (!connection.connected) {
      scheduleRetry(device, 1);
      log('terminal unreachable', { device: device.serialNumber, error: connection.error });
      return;
    }

    const records = await client.getAttendanceRecords();
    await client.disconnect();

    const watermark = lastWatermark.get(device.serialNumber) ?? 0;
    const fresh = records.filter((record) => {
      const instant = wallTimeToInstant(record.wall, device.timezone);
      return instant.getTime() > watermark;
    });

    if (fresh.length > 0) {
      const newest = Math.max(...fresh.map((record) => wallTimeToInstant(record.wall, device.timezone).getTime()));
      lastWatermark.set(device.serialNumber, newest - 1000);

      const queue = loadQueue();
      for (const record of fresh) {
        const instant = wallTimeToInstant(record.wall, device.timezone);
        queue.push({
          serialNumber: device.serialNumber,
          enrollmentNumber: record.enrollmentNumber,
          punchTime: formatWallString(instant, device.timezone, false),
          punchState: record.punchState,
          verifyMode: record.verifyMode,
          workCode: record.workCode,
          matchValue: record.matchValue,
          queuedAt: new Date().toISOString(),
        });
      }
      saveQueue(queue);
      totalPulled += fresh.length;
      log('pulled', { device: device.serialNumber, records: fresh.length, queued: queue.length });
    }

    nextAllowedPollAt.set(device.deviceId, Date.now() + device.pollIntervalMs);
  } catch (err: any) {
    scheduleRetry(device, 1);
    log('poll failed', { device: device.serialNumber, error: err.message });
    try { await client.disconnect(); } catch { /* already gone */ }
  }
}

function scheduleRetry(device: RemoteDevice, failures: number): void {
  const wait = Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5));
  nextAllowedPollAt.set(device.deviceId, Date.now() + wait);
}

function startHealthServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/' || req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: consecutiveUploadFailures > 3 ? 'DEGRADED' : 'HEALTHY',
        api: CLOUD_API_URL,
        locationScope: LOCATION_CODE || 'ALL',
        registryDevices: devices.length,
        registryError: lastRegistryError,
        lastPollAt,
        lastUploadAt,
        totalPulled,
        totalForwarded,
        queuedPunches: loadQueue().length,
        consecutiveUploadFailures,
        pid: process.pid,
      }, null, 2));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
  server.listen(HEALTH_PORT, () => log('health server listening', { port: HEALTH_PORT }));
  return server;
}

async function main(): Promise<void> {
  log('starting', { api: CLOUD_API_URL, scope: LOCATION_CODE || 'ALL', defaultPollMs: DEFAULT_POLL_MS, queueFile: QUEUE_FILE });
  if (!CONNECTOR_KEY) log('BIOMETRIC_CONNECTOR_KEY is not set — the API will reject ingest');

  startHealthServer();
  await refreshRegistry();
  setInterval(() => void refreshRegistry(), REGISTRY_REFRESH_MS);

  for (;;) {
    lastPollAt = new Date().toISOString();
    for (const device of devices) {
      await pollDevice(device);
    }
    await uploadQueue();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

process.on('SIGINT', () => { log('stopping'); process.exit(0); });
process.on('SIGTERM', () => { log('stopping'); process.exit(0); });
process.on('unhandledRejection', (reason: any) => log('unhandled rejection', { error: reason?.message || String(reason) }));

main().catch((err) => {
  console.error('Fatal connector error:', err);
  process.exit(1);
});
