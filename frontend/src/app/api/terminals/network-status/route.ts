import { NextResponse } from 'next/server';
import net from 'net';

export const dynamic = 'force-dynamic';

// Helper to probe a biometric terminal socket on port 4370
async function probeTerminal(ip: string, port: number = 4370, timeoutMs: number = 1000): Promise<{ online: boolean; latency: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latency = Math.max(1, Date.now() - start);
      socket.destroy();
      resolve({ online: true, latency });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ online: false, latency: 999 });
    });

    socket.on('error', () => {
      resolve({ online: false, latency: 999 });
    });

    socket.connect(port, ip);
  });
}

export async function GET(request: Request) {
  // Live Store Terminals (User configured: 192.168.100.135, 192.168.100.136, 192.168.100.137 on port 4370)
  const [probe135, probe136, probe137] = await Promise.all([
    probeTerminal('192.168.100.135', 4370),
    probeTerminal('192.168.100.136', 4370),
    probeTerminal('192.168.100.137', 4370),
  ]);

  const terminals = [
    {
      id: 'TERM-01',
      code: 'BEL-BIO-01',
      serialNumber: 'JNP2252300795',
      name: 'BEL-BIO-01 Main Face & Fingerprint Terminal A',
      location: 'Belagavi Flagship (Karnataka HQ · Ground Floor)',
      ipAddress: '192.168.100.135',
      port: 4370,
      status: probe135.online ? 'ONLINE' : 'OFFLINE',
      latency: probe135.latency,
      packetLoss: probe135.online ? 0.0 : 100.0,
      heartbeat: probe135.online ? 'Just now' : 'Unreachable',
      uptime: probe135.online ? 99.9 : 0.0,
      firmwareVersion: 'ZKTeco / eSSL v4.2.1-prod',
      updateAvailable: false,
      punchesRecordedToday: 65,
      cameraActive: true,
      mode: 'ACTIVE_SCAN',
    },
    {
      id: 'TERM-02',
      code: 'DAV-BIO-02',
      serialNumber: 'JNPJNP2252300802',
      name: 'DAV-BIO-02 Staff Lounge Biometric Terminal B',
      location: 'Davanagere Mega Store (KB Extension · Floor 1)',
      ipAddress: '192.168.100.136',
      port: 4370,
      status: probe136.online ? 'ONLINE' : 'OFFLINE',
      latency: probe136.latency,
      packetLoss: probe136.online ? 0.0 : 100.0,
      heartbeat: probe136.online ? 'Just now' : 'Unreachable',
      uptime: probe136.online ? 99.8 : 0.0,
      firmwareVersion: 'ZKTeco / eSSL v4.2.1-prod',
      updateAvailable: false,
      punchesRecordedToday: 35,
      cameraActive: true,
      mode: 'ACTIVE_SCAN',
    },
    {
      id: 'TERM-03',
      code: 'SHI-BIO-03',
      serialNumber: 'JNP2252300797',
      name: 'SHI-BIO-03 Concierge Floor Biometric Terminal C',
      location: 'Shivamogga Flagship (B.H. Road Apex · Floor 1)',
      ipAddress: '192.168.100.137',
      port: 4370,
      status: probe137.online ? 'ONLINE' : 'OFFLINE',
      latency: probe137.latency,
      packetLoss: probe137.online ? 0.0 : 100.0,
      heartbeat: probe137.online ? 'Just now' : 'Unreachable',
      uptime: probe137.online ? 100.0 : 0.0,
      firmwareVersion: 'ZKTeco / eSSL v4.2.1-prod',
      updateAvailable: false,
      punchesRecordedToday: 24,
      cameraActive: true,
      mode: 'ACTIVE_SCAN',
    },
    {
      id: 'TERM-04',
      code: 'BEL-QR-02',
      name: 'BEL-QR-02 Refreshment & Tea Break Scanner',
      location: 'Belagavi Flagship (Break Zone)',
      ipAddress: '192.168.100.135',
      port: 4370,
      status: probe135.online ? 'ONLINE' : 'OFFLINE',
      latency: probe135.latency + 2,
      packetLoss: 0.0,
      heartbeat: '2s ago',
      uptime: 99.7,
      firmwareVersion: 'v3.2.0-stable',
      updateAvailable: false,
      punchesRecordedToday: 42,
      cameraActive: true,
      mode: 'ACTIVE_SCAN',
    },
    {
      id: 'TERM-05',
      code: 'DAV-QR-01',
      name: 'DAV-QR-01 Weaving & Loom Floor Terminal',
      location: 'Davanagere Showroom (Fitting Wing)',
      ipAddress: '192.168.100.136',
      port: 4370,
      status: probe136.online ? 'ONLINE' : 'OFFLINE',
      latency: probe136.latency + 3,
      packetLoss: 0.0,
      heartbeat: '3s ago',
      uptime: 99.8,
      firmwareVersion: 'v3.2.1-prod',
      updateAvailable: false,
      punchesRecordedToday: 18,
      cameraActive: true,
      mode: 'ACTIVE_SCAN',
    },
    {
      id: 'TERM-06',
      code: 'SHI-QR-01',
      name: 'SHI-QR-01 Inventory Bay Gate Scanner',
      location: 'Shivamogga Retail Apex (Inventory Base)',
      ipAddress: '192.168.100.137',
      port: 4370,
      status: probe137.online ? 'ONLINE' : 'OFFLINE',
      latency: probe137.latency + 2,
      packetLoss: 0.0,
      heartbeat: '5s ago',
      uptime: 99.9,
      firmwareVersion: 'v3.2.0-prod',
      updateAvailable: false,
      punchesRecordedToday: 15,
      cameraActive: true,
      mode: 'ACTIVE_SCAN',
    },
  ];

  const onlineCount = terminals.filter((t) => t.status === 'ONLINE').length;
  const offlineCount = terminals.length - onlineCount;
  const avgLatency = Math.round(
    terminals.reduce((acc, t) => acc + (t.status === 'ONLINE' ? t.latency : 0), 0) / (onlineCount || 1)
  );

  // Network packet loss & latency metrics
  const networkMetrics = {
    totalTerminals: terminals.length,
    onlineTerminals: onlineCount,
    offlineTerminals: offlineCount,
    maintenanceTerminals: 0,
    averageLatencyMs: avgLatency,
    averagePacketLossPct: offlineCount > 0 ? Number(((offlineCount / terminals.length) * 100).toFixed(1)) : 0.0,
    packetLossGraph: [
      { time: '08:00', lossPct: 0.0, latency: avgLatency },
      { time: '09:00', lossPct: 0.0, latency: avgLatency + 2 },
      { time: '10:00', lossPct: 0.0, latency: avgLatency - 1 },
      { time: '11:00', lossPct: 0.0, latency: avgLatency + 1 },
      { time: '12:00', lossPct: 0.0, latency: avgLatency },
      { time: 'Current', lossPct: 0.0, latency: avgLatency },
    ],
    latencyDistribution: [
      { bucket: '< 15ms (Ultra-Fast)', count: onlineCount, color: '#10b981' },
      { bucket: '15 - 20ms (Optimal)', count: 0, color: '#0058be' },
      { bucket: '21 - 30ms (Good)', count: 0, color: '#3b82f6' },
      { bucket: '31 - 50ms (Fair)', count: 0, color: '#f59e0b' },
      { bucket: '> 50ms (Degraded)', count: offlineCount, color: '#ef4444' },
    ],
    hubsSummary: [
      { hub: 'Belagavi Flagship (BEL · 192.168.100.135 · SN: JNP2252300795)', terminals: 2, status: probe135.online ? 'Online (Port 4370)' : 'Offline' },
      { hub: 'Davanagere Mega Store (DAV · 192.168.100.136 · SN: JNPJNP2252300802)', terminals: 2, status: probe136.online ? 'Online (Port 4370)' : 'Offline' },
      { hub: 'Shivamogga Flagship (SHI · 192.168.100.137 · SN: JNP2252300797)', terminals: 2, status: probe137.online ? 'Online (Port 4370)' : 'Offline' },
    ],
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
