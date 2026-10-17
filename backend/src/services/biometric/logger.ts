/**
 * Structured logging for the biometric subsystem.
 *
 * Device failures are the kind that only show up at 6am on a shop-floor LAN, so
 * every log line is both human-readable on the console and JSON on disk
 * (`logs/biometric-YYYY-MM-DD.log`) for grep/jq. The `code` field is the stable
 * contract: connection refused, timeout, wrong comm key and parse failure are
 * distinguishable without reading free text.
 */

import fs from 'node:fs';
import path from 'node:path';

export type DeviceErrorCode =
  | 'CONNECT_REFUSED'
  | 'CONNECT_TIMEOUT'
  | 'HOST_UNREACHABLE'
  | 'DNS_FAILURE'
  | 'HANDSHAKE_UNAUTHORIZED'
  | 'COMM_KEY_REJECTED'
  | 'PROTOCOL_PARSE_FAILURE'
  | 'ATTLOG_EMPTY'
  | 'DEVICE_TIME_DRIFT'
  | 'PHOTO_UNSUPPORTED'
  | 'DB_FAILURE'
  | 'CONFIG_MISSING'
  | 'HEARTBEAT_LOST'
  | 'UNKNOWN';

export interface LogFields {
  deviceId?: string;
  serialNumber?: string;
  ip?: string;
  port?: number;
  code?: DeviceErrorCode;
  latencyMs?: number;
  enrollmentNumber?: string;
  rawCode?: number | null;
  detail?: string;
  errorName?: string;
  stack?: string;
  [key: string]: unknown;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

let minLevel: number = LEVELS[(String(process.env.BIOMETRIC_LOG_LEVEL || 'info').toLowerCase()) as Level] ?? LEVELS.info;
let logDir: string = process.env.BIOMETRIC_LOG_DIR
  ? path.resolve(process.env.BIOMETRIC_LOG_DIR)
  : path.resolve(process.cwd(), 'logs');
let directoryReady = false;
let stream: fs.WriteStream | null = null;
let streamDay = '';

function ensureStream(): fs.WriteStream | null {
  const today = new Date().toISOString().slice(0, 10);
  if (stream && streamDay === today) return stream;
  try {
    if (!directoryReady) {
      fs.mkdirSync(logDir, { recursive: true });
      directoryReady = true;
    }
    stream?.end();
    stream = fs.createWriteStream(path.join(logDir, `biometric-${today}.log`), { flags: 'a' });
    stream.on('error', () => { stream = null; });
    streamDay = today;
    return stream;
  } catch {
    // Logging must never take the punch pipeline down with it.
    return null;
  }
}

const COLOURS: Record<Level, string> = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

function emit(level: Level, message: string, fields: LogFields): void {
  if (LEVELS[level] < minLevel) return;
  const at = new Date().toISOString();
  const out = { at, level, scope: 'biometric', msg: message, ...fields };

  const extras = Object.entries(out)
    .filter(([k]) => !['at', 'level', 'scope', 'msg'].includes(k))
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v).replace(/\s+/g, ' ')}`)
    .join(' ');

  const line = `${COLOURS[level]}${at} [${level.toUpperCase().padEnd(5)}]${RESET} biometric: ${message}${extras ? ` ${extras}` : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);

  const file = ensureStream();
  if (file) file.write(`${JSON.stringify(out)}\n`);
}

export const deviceLog = {
  debug: (message: string, fields: LogFields = {}) => emit('debug', message, fields),
  info: (message: string, fields: LogFields = {}) => emit('info', message, fields),
  warn: (message: string, fields: LogFields = {}) => emit('warn', message, fields),
  error: (message: string, fields: LogFields = {}) => emit('error', message, fields),
  /** Raised for tests/ops so noise can be dialled down without restarting. */
  setLevel: (level: Level) => { minLevel = LEVELS[level] ?? minLevel; },
  setDirectory: (dir: string) => { logDir = path.resolve(dir); directoryReady = false; stream?.end(); stream = null; },
  filePath: () => path.join(logDir, `biometric-${new Date().toISOString().slice(0, 10)}.log`),
};

/**
 * Turn a socket/protocol exception into a stable code plus an operator-facing
 * message. The MB160 fails in a handful of distinct ways and each one needs a
 * different fix, so this is the difference between a usable log and noise.
 */
export function classifyDeviceError(err: unknown): { code: DeviceErrorCode; message: string; retryable: boolean } {
  const anyErr = err as any;
  const code = String(anyErr?.code || '');
  const message = String(anyErr?.message || anyErr || 'Unknown error');
  const lower = message.toLowerCase();

  if (code === 'ECONNREFUSED' || lower.includes('connection refused')) {
    return {
      code: 'CONNECT_REFUSED',
      message: 'Connection refused — nothing is listening on that IP:port. Check the terminal is powered, on the same VLAN, and that the address is correct.',
      retryable: true,
    };
  }
  if (code === 'ETIMEDOUT' || code === 'ERR_STREAM_PREMATURE_CLOSE' || lower.includes('timed out') || lower.includes('timeout')) {
    return {
      code: 'CONNECT_TIMEOUT',
      message: 'Timed out waiting for the terminal. Typical causes: the device is behind an isolated showroom LAN, a firewall is dropping port 4370, or the IP belongs to another host.',
      retryable: true,
    };
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || lower.includes('unreachable')) {
    return {
      code: 'HOST_UNREACHABLE',
      message: 'Host unreachable — no route to that IP from this machine. Verify the terminal and the server share a network, or run the edge connector on the showroom LAN.',
      retryable: true,
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || lower.includes('getaddrinfo')) {
    return { code: 'DNS_FAILURE', message: `Could not resolve the configured device address (${message})`, retryable: true };
  }
  if (code === 'EPERM' || code === 'EACCES') {
    return { code: 'CONNECT_REFUSED', message: `Socket permission denied for ${code === 'EACCES' ? 'a privileged port' : 'this operation'}`, retryable: false };
  }

  // Protocol-level rejections come back as tagged Error subclasses.
  if (anyErr?.name === 'ZkUnauthorizedError' || lower.includes('comm key')) {
    return {
      code: 'COMM_KEY_REJECTED',
      message: 'The terminal rejected our communication key. Set the same Comm Key on the device (Menu → Comm → Communication Key) and on the Device Settings page.',
      retryable: false,
    };
  }
  if (anyErr?.name === 'ZkHandshakeError') {
    return {
      code: 'HANDSHAKE_UNAUTHORIZED',
      message: 'ZK handshake did not complete — the port answered but is not speaking the ZK protocol (a different service may own 4370).',
      retryable: true,
    };
  }
  if (anyErr?.name === 'ZkParseError' || lower.includes('parse')) {
    return { code: 'PROTOCOL_PARSE_FAILURE', message: `Could not parse the terminal's reply: ${message}`, retryable: true };
  }
  if (anyErr?.name === 'ImpossibleDateError') {
    return { code: 'DEVICE_TIME_DRIFT', message, retryable: false };
  }

  return { code: 'UNKNOWN', message, retryable: true };
}
