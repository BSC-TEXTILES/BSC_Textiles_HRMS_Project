/**
 * BSC Textiles HRMS — Biometric Device Integration Configuration
 * 
 * Provides verified dual-mode configuration for eSSL MB160 terminals:
 * 1. `local_lan`: HRMS runs on a local/store network computer and communicates
 *    with terminals via TCP/UDP port 4370.
 * 2. `cloud_push`: HRMS runs on a public cloud server (e.g. Hostinger). Terminals
 *    send attendance directly to the server via ADMS cloud push (HTTP/HTTPS /iclock).
 *    Worker skips unreachable private RFC 1918 IPs.
 * 3. `hybrid`: Supports both local LAN polling and cloud push simultaneously.
 */

import dotenv from 'dotenv';
dotenv.config();

export type DeviceSyncMode = 'local_lan' | 'cloud_push' | 'hybrid';

export function isPrivateIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();

  // Localhost / Loopback
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1') return true;

  // IPv4 RFC 1918 & link-local checks
  const ipv4Parts = clean.split('.').map(Number);
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [b0, b1] = ipv4Parts;
    // 10.0.0.0/8
    if (b0 === 10) return true;
    // 172.16.0.0/12
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16
    if (b0 === 192 && b1 === 168) return true;
    // 169.254.0.0/16 (Link-local)
    if (b0 === 169 && b1 === 254) return true;
    // 127.0.0.0/8
    if (b0 === 127) return true;
  }

  // IPv6 Unique local / Link-local
  if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80')) return true;

  return false;
}

function resolveDeviceSyncMode(): DeviceSyncMode {
  const envMode = (process.env.DEVICE_SYNC_MODE || '').trim().toLowerCase();
  if (envMode === 'local_lan' || envMode === 'cloud_push' || envMode === 'hybrid') {
    return envMode as DeviceSyncMode;
  }

  // Intelligent fallback: In production without explicit mode, default to cloud_push
  if (process.env.NODE_ENV === 'production') {
    return 'cloud_push';
  }

  // In local development, default to local_lan
  return 'local_lan';
}

export const deviceIntegrationConfig = {
  get syncMode(): DeviceSyncMode {
    return resolveDeviceSyncMode();
  },
  isLocalLanMode(): boolean {
    const mode = resolveDeviceSyncMode();
    return mode === 'local_lan' || mode === 'hybrid';
  },
  isCloudPushMode(): boolean {
    const mode = resolveDeviceSyncMode();
    return mode === 'cloud_push' || mode === 'hybrid';
  },
  shouldPollDevice(ipAddress: string): boolean {
    const mode = resolveDeviceSyncMode();
    if (mode === 'local_lan') return true;
    if (mode === 'hybrid') return true;

    // In cloud_push mode, only attempt polling if the IP is a publicly routable IP or domain
    // Private store IPs (192.168.x.x) are unreachable from cloud and must push via ADMS
    const isPrivate = isPrivateIp(ipAddress);
    return !isPrivate;
  },
  defaultPort: Number(process.env.BIOMETRIC_TERMINAL_PORT) || 4370,
  defaultTimezone: process.env.BIOMETRIC_DEFAULT_TIMEZONE || 'Asia/Kolkata',
  heartbeatTimeoutSeconds: Number(process.env.BIOMETRIC_HEARTBEAT_TIMEOUT_SECONDS) || 15,
  pollIntervalMs: Number(process.env.BIOMETRIC_POLL_INTERVAL_MS) || 2500,
  admsRateLimitPerMinute: Number(process.env.ADMS_RATE_LIMIT_PER_MINUTE) || 180,
  admsMaxRequestSizeBytes: 12 * 1024 * 1024, // 12MB for base64 face snapshot photos
};
