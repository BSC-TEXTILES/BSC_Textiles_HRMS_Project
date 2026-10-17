/**
 * Biometric terminal diagnostic.
 *
 * Answers "why isn't this device syncing?" by walking the exact chain a punch
 * travels and stopping at the first step that fails, with the operator-facing
 * meaning of that failure.
 *
 *   npm run diagnose                              # every active device
 *   npm run diagnose -- --device=bio-dev-demo-bel-001
 *   npm run diagnose -- --serial=SIMMB160DEMO01 --push-url=http://localhost:4000
 *
 * Exit code is the number of devices with a failing step (0 = all healthy), so
 * it can gate a deploy or a cron alert.
 */

import net from 'node:net';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { pool } from '../nativeDb.js';
import { getDeviceConfig, listDeviceConfigs, loadGlobalSettings, readJsonSetting } from '../services/biometric/settings.js';
import { ZkProtocolClient } from '../services/zkProtocolAdapter.js';
import { classifyDeviceError, DeviceErrorCode } from '../services/biometric/logger.js';
import { clockDriftSeconds, wallTimeToInstant, formatWallString, fromUtcMysqlString } from '../services/biometric/timeCodec.js';

const args = process.argv.slice(2);
const arg = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

interface Step {
  name: string;
  ok: boolean;
  detail: string;
  fatal: boolean;
  code?: DeviceErrorCode;
}

function line(text: string): void {
  console.log(text);
}

/**
 * Server root without the `/api` suffix. API_URL is normally
 * "http://host:4000/api", but /health, /api/health and /iclock/* all hang off
 * the root, so appending them to that base produces a 404.
 */
function serverRoot(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/api$/, '');
}

function tcpProbe(host: string, port: number, timeoutMs = 2500): Promise<{ ok: boolean; ms: number; error?: string; code?: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    const done = (result: { ok: boolean; ms: number; error?: string; code?: string }) => {
      socket.destroy();
      resolve(result);
    };
    socket.on('connect', () => done({ ok: true, ms: Date.now() - started }));
    socket.on('timeout', () => done({ ok: false, ms: Date.now() - started, error: `no TCP answer within ${timeoutMs}ms`, code: 'ETIMEDOUT' }));
    socket.on('error', (err: any) => done({ ok: false, ms: Date.now() - started, error: err.message, code: err.code }));
    socket.connect(port, host);
  });
}

function icmpPing(host: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const command = isWin ? 'ping' : 'ping';
    const flags = isWin ? ['-n', '2', '-w', '1500', host] : ['-c', '2', '-W', '2', host];
    execFile(command, flags, { timeout: 12_000 }, (error, stdout) => {
      if (error) resolve({ ok: false, detail: `ping failed: ${error.message}` });
      else resolve({ ok: /TTL=/i.test(stdout) || /bytes from/i.test(stdout), detail: stdout.split(/\r?\n/).filter(Boolean).slice(-2).join(' | ') });
    });
  });
}

async function resolveHost(host: string): Promise<{ ok: boolean; detail: string }> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return { ok: true, detail: `literal IPv4 address ${host}` };
  return new Promise((resolve) => {
    dns.lookup(host, (error, address) => {
      if (error) resolve({ ok: false, detail: `DNS lookup failed for "${host}": ${error.code || error.message}` });
      else resolve({ ok: true, detail: `${host} → ${address}` });
    });
  });
}

async function diagnoseDevice(serialOrId: string, pushUrl: string | null): Promise<Step[]> {
  const steps: Step[] = [];
  const device = await getDeviceConfig(serialOrId);
  if (!device) {
    steps.push({ name: 'config', ok: false, fatal: true, detail: `no biometric_devices row for "${serialOrId}" — register it on the Device console page` });
    return steps;
  }

  steps.push({
    name: 'config',
    ok: true,
    fatal: false,
    detail: `${device.name} @ ${device.ipAddress}:${device.port}, timezone ${device.timezone}, commKey ${device.commKey ? 'set' : '0'}, protocol ${device.protocol}`,
  });

  const resolved = await resolveHost(device.ipAddress);
  steps.push({ name: 'dns', ok: resolved.ok, fatal: !resolved.ok, detail: resolved.detail });
  if (!resolved.ok) return steps;

  const ping = await icmpPing(device.ipAddress);
  // A terminal may simply not answer ICMP behind a managed switch, so this is
  // informational and never fatal on its own.
  steps.push({ name: 'ping', ok: ping.ok, fatal: false, detail: ping.ok ? ping.detail : `no ICMP reply (${ping.detail}) — continuing, the device may just block ping` });

  const tcp = await tcpProbe(device.ipAddress, device.port);
  steps.push({
    name: `tcp-${device.port}`,
    ok: tcp.ok,
    fatal: !tcp.ok,
    code: tcp.ok ? undefined : classifyDeviceError({ code: tcp.code, message: tcp.error || '' }).code,
    detail: tcp.ok
      ? `port open in ${tcp.ms}ms`
      : `${tcp.error} (${tcp.code || 'unknown'}) — check the terminal is powered, on this VLAN, and that no firewall blocks ${device.port}`,
  });
  if (!tcp.ok) return steps;

  const client = new ZkProtocolClient(device.ipAddress, device.port, 3000, device.commKey);
  try {
    const connection = await client.connect();
    steps.push({
      name: 'zk-handshake',
      ok: connection.connected,
      fatal: !connection.connected,
      code: connection.connected ? undefined : classifyDeviceError({ message: connection.error || '' }).code,
      detail: connection.connected
        ? `session ${connection.sessionId} established in ${connection.latencyMs}ms`
        : connection.error || 'handshake failed',
    });
    if (!connection.connected) return steps;

    const info = await client.getDeviceInfo();
    steps.push({
      name: 'device-info',
      ok: Boolean(info.serialNumber || info.firmwareVersion),
      fatal: false,
      detail: `serial ${info.serialNumber ?? 'NOT REPORTED'}, firmware ${info.firmwareVersion ?? 'NOT REPORTED'}, platform ${info.platform ?? 'NOT REPORTED'}, users ${info.userCount ?? '?'}, logs ${info.logCount ?? '?'}`,
    });
    if (info.serialNumber && info.serialNumber !== device.serialNumber) {
      steps.push({
        name: 'serial-match',
        ok: false,
        fatal: false,
        detail: `registry says ${device.serialNumber} but the terminal says ${info.serialNumber} — fix the registry or this device's punches will be attributed to the wrong terminal`,
      });
    } else {
      steps.push({ name: 'serial-match', ok: true, fatal: false, detail: 'registry serial matches the terminal' });
    }

    const settings = await loadGlobalSettings();
    try {
      const wall = await client.getDeviceTime();
      const deviceInstant = wallTimeToInstant(wall, device.timezone);
      const drift = clockDriftSeconds(wall, device.timezone, new Date());
      steps.push({
        name: 'device-time',
        ok: Math.abs(drift) <= settings.clockDriftWarnSeconds,
        fatal: false,
        code: Math.abs(drift) <= settings.clockDriftWarnSeconds ? undefined : 'DEVICE_TIME_DRIFT',
        detail: `device ${formatWallString(deviceInstant, device.timezone, false)} (${device.timezone}) vs server ${formatWallString(new Date(), device.timezone, false)} → drift ${drift}s (warn above ${settings.clockDriftWarnSeconds}s). Use "Sync device time" to correct it.`,
      });
    } catch (err: any) {
      const classified = classifyDeviceError(err);
      steps.push({ name: 'device-time', ok: false, fatal: false, code: classified.code, detail: classified.message });
    }

    try {
      const records = await client.getAttendanceRecords(6000);
      const sample = records.slice(-5).map((record) => {
        const instant = wallTimeToInstant(record.wall, device.timezone);
        return `${record.enrollmentNumber}@${formatWallString(instant, device.timezone, false)}/verify=${record.verifyMode}`;
      });
      steps.push({
        name: 'read-last-logs',
        ok: records.length > 0,
        fatal: false,
        code: records.length === 0 ? 'ATTLOG_EMPTY' : undefined,
        detail: records.length === 0
          ? 'terminal returned 0 parseable attendance records — either the log is genuinely empty or this firmware packs records differently'
          : `${records.length} record(s); last 5: ${sample.join(', ')}`,
      });
    } catch (err: any) {
      const classified = classifyDeviceError(err);
      steps.push({ name: 'read-last-logs', ok: false, fatal: false, code: classified.code, detail: classified.message });
    }

    if (pushUrl) {
      try {
        const response = await fetch(`${serverRoot(pushUrl)}/iclock/cdata?SN=${device.serialNumber}&options=all&pushver=2.4.1`);
        const text = await response.text();
        const realtime = /Realtime=1/.test(text);
        steps.push({
          name: 'adms-push-endpoint',
          ok: response.ok && realtime,
          fatal: false,
          detail: `HTTP ${response.status}; handshake advertises ${text.split(/\r?\n/).filter((l) => /Realtime|TimeZone|TransInterval/.test(l)).join(', ') || 'no options'}${realtime ? '' : ' — Realtime=1 missing, the device will not push instantly'}`,
        });
      } catch (err: any) {
        steps.push({ name: 'adms-push-endpoint', ok: false, fatal: false, detail: `could not reach ${pushUrl}/iclock/cdata: ${err.message}` });
      }
    }

    if (records_photo_supported(device.photoPushEnabled)) {
      steps.push({ name: 'photos', ok: true, fatal: false, detail: 'the terminal has pushed ATTPHOTO snapshots, so punch photos are expected' });
    } else {
      steps.push({
        name: 'photos',
        ok: true,
        fatal: false,
        detail: 'no ATTPHOTO push received from this terminal yet — the UI shows "No photo available from device" until it does',
      });
    }
  } catch (err: any) {
    const classified = classifyDeviceError(err);
    steps.push({ name: 'protocol-error', ok: false, fatal: true, code: classified.code, detail: classified.message });
  } finally {
    try { await client.disconnect(); } catch { /* already closed */ }
  }

  return steps;
}

function records_photo_supported(enabled: boolean): boolean {
  return Boolean(enabled);
}

async function checkPlatform(pushUrl: string | null): Promise<void> {
  line('─ platform ─');
  try {
    await pool.query('SELECT 1');
    const [counts]: any = await pool.query(
      `SELECT (SELECT COUNT(*) FROM biometric_devices WHERE isActive = 1) AS devices,
              (SELECT COUNT(*) FROM biometric_raw_punches) AS punches,
              (SELECT COUNT(*) FROM biometric_raw_punches WHERE mappingStatus <> 'MAPPED') AS held,
              (SELECT COUNT(*) FROM biometric_rejected_punches) AS rejected`
    );
    line(`  ✓ database          ${JSON.stringify(counts[0])}`);

    const [newest]: any = await pool.query('SELECT MAX(punchTimeUtc) AS newest FROM biometric_raw_punches');
    const instant = fromUtcMysqlString(newest[0]?.newest);
    line(`  ✓ newest punch      ${instant ? instant.toISOString() : 'none stored yet'}`);

    const [rows]: any = await pool.query(`SELECT \`value\` FROM biometric_settings WHERE \`key\` = 'workerHeartbeatAt'`);
    const heartbeat = readJsonSetting(rows[0]?.value);
    if (typeof heartbeat === 'string') {
      const age = Math.floor((Date.now() - new Date(heartbeat).getTime()) / 1000);
      line(`  ${age <= 90 ? '✓' : '✗'} worker           last beat ${age}s ago${age <= 90 ? '' : ' — restart it: npm run worker:supervised'}`);
    } else {
      line('  ✗ worker           has never written a heartbeat — start it with: npm run worker:supervised');
    }
  } catch (err: any) {
    line(`  ✗ database          ${err.sqlMessage || err.message}`);
  }

  if (pushUrl) {
    try {
      const health: any = await fetch(`${serverRoot(pushUrl)}/api/health`).then((r) => r.json());
      line(`  ✓ api health       ${health.status} — ${(health.biometric?.reasons || []).join('; ') || 'no warnings'}`);
    } catch (err: any) {
      line(`  ✗ api health       ${err.message} — is the API running on ${pushUrl}?`);
    }
  }
}

async function main(): Promise<void> {
  const deviceSelector = arg('device') || arg('serial');
  const pushUrl = arg('push-url') || process.env.API_URL || 'http://localhost:4000';

  line('================================================================');
  line('🔍 BSC Textiles HRMS — biometric terminal diagnostic');
  line(`   ${new Date().toISOString()}`);
  line('================================================================');

  let targets: string[] = [];
  if (deviceSelector) {
    targets = [deviceSelector];
  } else {
    const devices = await listDeviceConfigs(true);
    targets = devices.map((d) => d.serialNumber);
    if (targets.length === 0) {
      line('No active terminals are registered. Add one on the device console page first.');
      process.exit(2);
    }
  }

  await checkPlatform(pushUrl);
  line('');

  let failing = 0;
  for (const target of targets) {
    line(`─ ${target} ─`);
    const steps = await diagnoseDevice(target, pushUrl);
    let stopped = false;
    for (const step of steps) {
      if (stopped) break;
      const mark = step.ok ? '✓' : step.fatal ? '✗' : '!';
      line(`  ${mark} ${step.name.padEnd(20)} ${step.detail}${step.code ? ` [${step.code}]` : ''}`);
      if (step.fatal) {
        line(`  → stopping at "${step.name}": later steps cannot be evaluated until this one passes.`);
        stopped = true;
      }
    }
    // `ping` is informational: managed switches routinely drop ICMP, and a
    // terminal that answers ZK but not ping is healthy.
    const realFailures = steps.filter((s) => !s.ok && s.name !== 'ping');
    if (realFailures.length > 0) failing++;
    line('');
  }

  await pool.end().catch(() => undefined);

  line('================================================================');
  if (failing === 0) {
    line(`🎉 ${targets.length} terminal(s) diagnosed, no failures.`);
  } else {
    line(`⚠ ${failing} of ${targets.length} terminal(s) reported a problem — see the first ✗ or ! per device above.`);
  }
  line('================================================================');
  process.exit(failing);
}

main().catch((err) => {
  console.error('Diagnostic crashed:', err);
  process.exit(125);
});
