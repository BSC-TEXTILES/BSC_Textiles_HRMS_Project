import { NextResponse } from 'next/server';
import net from 'net';

export const dynamic = 'force-dynamic';

/**
 * Terminal network status drill-down.
 *
 * Built only from data the stack actually holds:
 *   GET /api/devices            — the biometric terminal registry (serial, IP,
 *                                 port, protocol, firmware, heartbeat, counters)
 *   GET /api/locations/all      — showroom names for the hub summary
 *   GET /api/devices/attendance-log?from&to&serialNumber=<sn> — today's stored
 *                                 punch count per terminal (COUNT only, limit=1)
 *
 * Latency comes from a live TCP connect to each registry address:port. Anything
 * the terminals or registry do not report (packet-loss history, uptime windows,
 * firmware update availability, camera status) is null or an empty list so the
 * drawer renders an honest empty state instead of a demonstration fleet.
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

interface ProbeResult {
  online: boolean;
  latency: number | null;
}

function probeTerminal(ip: string | null, port: number, timeoutMs = 1500): Promise<ProbeResult> {
  if (!ip) return Promise.resolve({ online: false, latency: null });
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const settle = (result: ProbeResult) => {
      socket.destroy();
      resolve(result);
    };

    socket.on('connect', () => settle({ online: true, latency: Math.max(1, Date.now() - start) }));
    socket.on('timeout', () => settle({ online: false, latency: null }));
    socket.on('error', () => settle({ online: false, latency: null }));

    try {
      socket.connect(port, ip);
    } catch {
      settle({ online: false, latency: null });
    }
  });
}

function relativeHeartbeat(value: any): string {
  if (!value) return 'Never';
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return 'Never';
  const diffSec = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function textOr(value: any): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  const today = new Date().toISOString().slice(0, 10);

  const [devicesPayload, locationsPayload] = await Promise.all([
    backendGet(request, '/devices'),
    backendGet(request, '/locations/all'),
  ]);

  const devices: any[] = Array.isArray(devicesPayload?.devices) ? devicesPayload.devices : [];
  const locations: any[] = Array.isArray(locationsPayload?.locations)
    ? locationsPayload.locations
    : Array.isArray(locationsPayload)
      ? locationsPayload
      : [];

  const locationLabel = new Map<string, string>();
  for (const loc of locations) {
    const id = textOr(loc?.id);
    const name = textOr(loc?.name);
    const code = textOr(loc?.code);
    if (id && name) locationLabel.set(id, `${name}${code ? ` (${code})` : ''}`);
  }

  const [probes, punchCounts] = await Promise.all([
    Promise.all(
      devices.map((d) => probeTerminal(textOr(d.ipAddress), Number(d.port) || 4370))
    ),
    Promise.all(
      devices.map(async (d) => {
        const serial = textOr(d.serialNumber);
        const deviceId = textOr(d.id);
        const filter = serial
          ? `serialNumber=${encodeURIComponent(serial)}`
          : deviceId
            ? `deviceId=${encodeURIComponent(deviceId)}`
            : null;
        if (!filter) return 0;
        const payload = await backendGet(
          request,
          `/devices/attendance-log?from=${today}&to=${today}&${filter}&limit=1`
        );
        const total = Number(payload?.total);
        return Number.isFinite(total) ? total : 0;
      })
    ),
  ]);

  const terminals = devices.map((device, idx) => {
    const probe = probes[idx];
    const locationId = textOr(device.locationId);
    const locationCode = textOr(device.locationCode);
    return {
      id: textOr(device.id) ?? `device-${idx + 1}`,
      code: textOr(device.serialNumber) ?? textOr(device.id) ?? 'Unknown terminal',
      serialNumber: textOr(device.serialNumber) ?? undefined,
      name: textOr(device.name) ?? 'Unnamed terminal',
      location:
        (locationId ? locationLabel.get(locationId) : null) ??
        locationCode ??
        'Location not reported',
      ipAddress: textOr(device.ipAddress) ?? 'Not reported',
      port: Number(device.port) || undefined,
      status: probe.online ? 'ONLINE' : 'OFFLINE',
      latency: probe.latency,
      // A completed TCP connect is a real delivery observation; when the port is
      // unreachable there is no loss figure to quote.
      packetLoss: probe.online ? 0 : null,
      heartbeat: relativeHeartbeat(device.lastHeartbeatAt ?? device.lastConnectionAt),
      uptime: null,
      firmwareVersion: textOr(device.firmwareVersion) ?? 'Not reported',
      // Nothing in this stack tracks firmware releases, so no update is claimed.
      updateAvailable: false,
      punchesRecordedToday: punchCounts[idx] ?? 0,
      mode: textOr(device.protocol) ?? 'Not reported',
    };
  });

  const onlineTerminals = terminals.filter((t) => t.status === 'ONLINE');
  const onlineLatencies = onlineTerminals
    .map((t) => t.latency)
    .filter((l): l is number => typeof l === 'number');
  const averageLatencyMs =
    onlineLatencies.length > 0
      ? Math.round(onlineLatencies.reduce((acc, l) => acc + l, 0) / onlineLatencies.length)
      : null;

  // Current probe snapshot only — no historical loss/latency series is stored.
  const latencyDistribution = [
    {
      bucket: '< 50ms (Optimal)',
      count: onlineLatencies.filter((l) => l < 50).length,
      color: '#10b981',
    },
    {
      bucket: '50 - 100ms (Fair)',
      count: onlineLatencies.filter((l) => l >= 50 && l <= 100).length,
      color: '#f59e0b',
    },
    {
      bucket: '> 100ms (Degraded)',
      count: onlineLatencies.filter((l) => l > 100).length,
      color: '#ef4444',
    },
  ];

  const hubBuckets = new Map<string, { hub: string; terminals: number; online: number }>();
  for (const term of terminals) {
    const key = term.location;
    const bucket = hubBuckets.get(key) ?? { hub: key, terminals: 0, online: 0 };
    bucket.terminals += 1;
    if (term.status === 'ONLINE') bucket.online += 1;
    hubBuckets.set(key, bucket);
  }
  const hubsSummary = [...hubBuckets.values()].map((bucket) => ({
    hub: bucket.hub,
    terminals: bucket.terminals,
    status:
      bucket.online === bucket.terminals
        ? 'All terminals reachable'
        : bucket.online > 0
          ? `${bucket.online}/${bucket.terminals} reachable`
          : 'No terminal reachable',
  }));

  const networkMetrics = {
    totalTerminals: terminals.length,
    onlineTerminals: onlineTerminals.length,
    offlineTerminals: terminals.length - onlineTerminals.length,
    maintenanceTerminals: 0,
    averageLatencyMs,
    // Packet loss is not measured by the registry or the terminals.
    averagePacketLossPct: null,
    packetLossGraph: [],
    latencyDistribution,
    hubsSummary,
  };

  return NextResponse.json({
    success: true,
    data: {
      terminals,
      networkMetrics,
    },
    timestamp: new Date().toISOString(),
  });
}
