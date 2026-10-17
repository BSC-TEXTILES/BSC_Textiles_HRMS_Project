/**
 * Native eSSL / ZKTeco standalone protocol client (TCP + UDP, port 4370).
 *
 * Scope of this file, and what it deliberately does not claim:
 *   - it speaks the documented ZK standalone command set on the wire;
 *   - it never returns an invented serial number, firmware string, or record.
 *     If the terminal did not answer, the call throws and the caller records a
 *     failure. The previous version returned `JNP2252300795` on every parse
 *     error, which is how a dead device kept showing up as three connected
 *     showrooms;
 *   - real-time events do not exist on the standalone pull protocol. A terminal
 *     only pushes when it is pointed at an ADMS/PUSH server, so "real time" in
 *     this product means ADMS push (routes/adms.ts) and everything else is a
 *     2-3 second poll.
 *
 * Record layouts implemented here are the documented ZK ones:
 *   ATTLOG  (40 bytes) size:2 pin:24 verify:1 time:4 status:1 workcode:4 pad:4
 *   USER    (~292 bytes) size:2 pin:9 privilege:1 password:8 name:32 ...
 */

import * as net from 'node:net';
import * as dgram from 'node:dgram';
import { decodeZkPackedTime, encodeZkPackedTimeForInstant, NaiveParts } from './biometric/timeCodec.js';

export const ZK_COMMANDS = {
  CMD_CANCEL: 9900,
  CMD_ENABLEDEVICE: 8,
  CMD_DISABLEDEVICE: 7,
  CMD_EXIT: 1,
  CMD_REBOOT: 2,
  CMD_GET_TIME: 201,
  CMD_SET_TIME: 202,
  CMD_FREE_DATA: 1000,
  CMD_CONNECT: 1000,
  CMD_ACCEPT_ADD: 15,
  CMD_SEND_IRCODE: 16,
  CMD_DATA: 1000,
  CMD_PREPARE_DATA: 1500,
  CMD_ACK: 2000,
  CMD_ERROR: 2001,
  CMD_RETRY: 2003,
  CMD_REPEAT: 2004,
  CMD_UNAUTH: 2005,
  CMD_CLEAR_DATA: 14,
  CMD_USER_RRQ: 8,
  CMD_ATTLOG_RRQ: 13,
  CMD_ATTEVENT_RRQ: 13,
  CMD_GET_USER_COUNT: 50,
  CMD_DEVICE_NAME: 7,
  CMD_REFRESH_DATA: 19,
  CMD_LOGSIZE: 6,
  CMD_ATTLOG_ACK: 13,
  CMD_IMAGE_NEW_RRQ: 1109,
} as const;

/** Numeric opcodes actually used on the wire (the names above are for logging). */
export const ZK = {
  CONNECT: 1000,
  EXIT: 1001,
  ENABLE: 1002,
  DISABLE: 1003,
  RESTART: 1004,
  VERSION: 1100,
  GET_TIME: 201,
  SET_TIME: 202,
  GET_USER_COUNT: 50,
  GET_ATTLOG_COUNT: 51,
  ATTLOG_RRQ: 13,
  CLEAR_ATTLOG: 14,
  USER_RRQ: 8,
  USER_TEMP_RRQ: 9,
  DEVICE_INFO: 11,
  AUTH: 1102,
  ACK_OK: 2000,
  ACK_ERROR: 2001,
  ACK_DATA: 2002,
  ACK_RETRY: 2003,
  ACK_REPEAT: 2004,
  ACK_UNAUTH: 2005,
  PREPARE_DATA: 1500,
  DATA: 1501,
} as const;

export class ZkError extends Error {
  constructor(message: string, readonly zkCode?: string) {
    super(message);
    this.name = 'ZkError';
  }
}
export class ZkHandshakeError extends ZkError {
  constructor(message: string) { super(message); this.name = 'ZkHandshakeError'; }
}
export class ZkUnauthorizedError extends ZkError {
  constructor(message: string) { super(message); this.name = 'ZkUnauthorizedError'; }
}
export class ZkParseError extends ZkError {
  constructor(message: string) { super(message); this.name = 'ZkParseError'; }
}

export interface ZkDeviceInfo {
  serialNumber: string | null;
  firmwareVersion: string | null;
  deviceName: string | null;
  platform: string | null;
  userCount: number | null;
  logCount: number | null;
}

export interface ZkAttendanceRecord {
  enrollmentNumber: string;
  /** Packed device wall clock, decoded to naive parts. */
  wall: NaiveParts;
  verifyMode: number | null;
  punchState: number | null;
  workCode: number | null;
  matchValue: number | null;
}

export interface ZkUserRecord {
  enrollmentNumber: string;
  name: string;
  privilege: number;
  card: string;
  password: string;
}

export interface ZkConnectionResult {
  connected: boolean;
  latencyMs: number;
  sessionId: number;
  protocol: 'TCP' | 'UDP';
  error?: string;
}

const TCP_MAGIC = 0x5050;

/** 16-bit one's complement checksum over the whole ZK packet. */
export function calculateZkChecksum(buffer: Buffer): number {
  let sum = 0;
  for (let i = 0; i + 1 < buffer.length; i += 2) sum += buffer.readUInt16LE(i);
  if (buffer.length % 2 === 1) sum += buffer[buffer.length - 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

/** commpro.c MakeKey(): scramble the numeric comm key with the session id. */
export function makeCommKey(key = 0, sessionId = 0, ticks = 50): Buffer {
  const k0 = Number(key) >>> 0;
  let k = 0n;
  for (let i = 0n; i < 32n; i++) {
    k = ((BigInt(k0) & (1n << i)) > 0n ? (k << 1n) | 1n : k << 1n);
  }
  k = (k + BigInt(sessionId >>> 0)) & 0xffffffffn;

  const b = Buffer.alloc(4);
  b.writeUInt32LE(Number(k), 0);
  // XOR with 'ZKSO' then swap the two words, per the reference implementation.
  const zkso = [0x5a, 0x4b, 0x53, 0x4f];
  for (let i = 0; i < 4; i++) b[i] ^= zkso[i];
  const w0 = b.readUInt16LE(0);
  const w1 = b.readUInt16LE(2);
  b.writeUInt16LE(w1, 0);
  b.writeUInt16LE(w0, 2);

  const byte = 0xff & ticks;
  b[0] ^= byte;
  b[1] ^= byte;
  b[2] = byte;
  b[3] ^= byte;
  return b;
}

export function createZkPacket(command: number, sessionId: number, replyId: number, data: Buffer = Buffer.alloc(0)): Buffer {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt16LE(command, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt16LE(sessionId, 4);
  buf.writeUInt16LE(replyId, 6);
  if (data.length) data.copy(buf, 8);
  buf.writeUInt16LE(calculateZkChecksum(buf), 2);
  return buf;
}

export function wrapTcpZkPacket(packet: Buffer): Buffer {
  const out = Buffer.alloc(8 + packet.length);
  out.writeUInt16BE(TCP_MAGIC, 0);
  out.writeUInt16BE(0x827d, 2);
  out.writeUInt32LE(packet.length, 4);
  packet.copy(out, 8);
  return out;
}

/** Naive ZK timestamp decode; exposed for the tests and the worker. */
export { decodeZkPackedTime };

/**
 * Parse a streamed ATTLOG block. Records are self-describing via the leading
 * WORD length, so the parser walks by length rather than assuming 40 bytes —
 * firmware that pads records differently still decodes.
 */
export function parseZkAttLogBuffer(buf: Buffer): ZkAttendanceRecord[] {
  const records: ZkAttendanceRecord[] = [];
  let pos = 0;

  while (pos + 40 <= buf.length) {
    const size = buf.readUInt16LE(pos);
    // A sane ATLOG record is 40 bytes; accept the documented 40/44/48 variants.
    if (size !== 40 && size !== 44 && size !== 48) {
      pos += 1;
      continue;
    }
    if (pos + size > buf.length) break;

    const pinEnd = (() => {
      let i = pos + 2;
      const limit = pos + 26;
      while (i < limit && buf[i] !== 0) i++;
      return i;
    })();
    const pin = buf.subarray(pos + 2, pinEnd).toString('utf8').trim();

    if (!pin || !/^[\x20-\x7e]+$/.test(pin)) {
      pos += 1;
      continue;
    }

    const verifyMode = buf.readUInt8(pos + 26);
    const packedTime = buf.readUInt32LE(pos + 27);
    const punchState = buf.readUInt8(pos + 31);
    const workCode = buf.readUInt32LE(pos + 32);

    // The trailing byte of the packed time block carries the match score on
    // multi-biometric firmware; 0 means the device did not report one.
    const matchByte = size >= 44 ? buf.readUInt8(pos + 40) : 0;

    const wall = decodeZkPackedTime(packedTime);
    const probe = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    const valid =
      !isNaN(probe) &&
      wall.year >= 2020 && wall.year <= 2035 &&
      wall.month >= 1 && wall.month <= 12 &&
      wall.day >= 1 && wall.day <= 31 &&
      wall.hour <= 23 && wall.minute <= 59 && wall.second <= 59;

    if (valid) {
      records.push({
        enrollmentNumber: pin,
        wall,
        verifyMode,
        punchState,
        workCode: workCode === 0 ? null : workCode,
        matchValue: matchByte > 0 ? matchByte : null,
      });
    }

    pos += size;
  }

  return records;
}

/** Parse a streamed USERINFO block (292-byte documented layout). */
export function parseZkUserBuffer(buf: Buffer): ZkUserRecord[] {
  const users: ZkUserRecord[] = [];
  let pos = 0;
  const RECORD = 292;

  while (pos + RECORD <= buf.length) {
    const readString = (offset: number, length: number) =>
      buf.subarray(pos + offset, pos + offset + length)
        .toString('utf8')
        .replace(/\0.*$/s, '')
        .trim();

    const enrollmentNumber = readString(2, 9);
    if (!enrollmentNumber || !/^[0-9A-Za-z]+$/.test(enrollmentNumber)) {
      pos += 1;
      continue;
    }

    users.push({
      enrollmentNumber,
      privilege: buf.readUInt8(pos + 11),
      password: readString(12, 8),
      name: readString(20, 32),
      card: readString(52, 10),
    });
    pos += RECORD;
  }

  return users;
}

interface PendingReply {
  resolve: (value: { code: number; payload: Buffer }) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Long-lived TCP session. Bytes are accumulated and framed by the 8-byte TCP
 * header, and replies are matched to the waiting command instead of the old
 * "read one data event and hope" approach.
 */
export class ZkProtocolClient {
  private socket: net.Socket | null = null;
  private buffer = Buffer.alloc(0);
  private sessionId = 0;
  private replyId = 0;
  private authenticated = false;
  private pending: PendingReply | null = null;
  /** Active streaming reader; receives every frame while a bulk read runs. */
  private stream: { handle: (frame: Buffer, code: number) => void } | null = null;

  constructor(
    private readonly ip: string,
    private readonly port = 4370,
    private readonly connectTimeoutMs = 3000,
    private readonly commKey = 0
  ) {}

  get isConnected(): boolean {
    return this.authenticated && Boolean(this.socket && !this.socket.destroyed);
  }

  async connect(): Promise<ZkConnectionResult> {
    const started = Date.now();
    return new Promise<ZkConnectionResult>((resolve) => {
      let settled = false;
      const sock = new net.Socket();
      this.socket = sock;
      sock.setTimeout(this.connectTimeoutMs);
      sock.setNoDelay(true);

      const finish = (result: ZkConnectionResult) => {
        if (settled) return;
        settled = true;
        sock.setTimeout(0);
        if (!result.connected) {
          try { sock.destroy(); } catch { /* already gone */ }
          this.authenticated = false;
        }
        resolve(result);
      };

      sock.on('timeout', () => finish({
        connected: false,
        latencyMs: Date.now() - started,
        sessionId: this.sessionId,
        protocol: 'TCP',
        error: `Timed out after ${this.connectTimeoutMs}ms waiting for the terminal at ${this.ip}:${this.port}`,
      }));

      sock.on('error', (err: any) => finish({
        connected: false,
        latencyMs: Date.now() - started,
        sessionId: this.sessionId,
        protocol: 'TCP',
        error: err?.code === 'ECONNREFUSED'
          ? `Connection refused by ${this.ip}:${this.port} — nothing is listening there`
          : `Socket error (${err?.code || 'ERR'}): ${err?.message}`,
      }));

      sock.on('close', () => {
        if (!this.authenticated) {
          finish({ connected: false, latencyMs: Date.now() - started, sessionId: this.sessionId, protocol: 'TCP', error: 'Terminal closed the connection during handshake' });
        }
      });

      sock.on('data', (chunk) => this.onSocketData(chunk, (frame) => {
        const code = frame.readUInt16LE(0);
        const sessionId = frame.readUInt16LE(4);

        if (!this.authenticated) {
          if (code === ZK.ACK_UNAUTH) {
            this.sessionId = sessionId;
            const auth = createZkPacket(ZK.AUTH, this.sessionId, ++this.replyId & 0xffff, makeCommKey(this.commKey, this.sessionId));
            sock.write(wrapTcpZkPacket(auth));
            return;
          }
          if (code === ZK.ACK_OK) {
            this.sessionId = sessionId;
            this.authenticated = true;
            finish({ connected: true, latencyMs: Math.max(1, Date.now() - started), sessionId: this.sessionId, protocol: 'TCP' });
            return;
          }
          finish({
            connected: false,
            latencyMs: Date.now() - started,
            sessionId,
            protocol: 'TCP',
            error: `Unexpected handshake reply code ${code} from ${this.ip}:${this.port}`,
          });
          return;
        }

        this.dispatchFrame(frame);
      }));

      sock.connect(this.port, this.ip, () => {
        sock.write(wrapTcpZkPacket(createZkPacket(ZK.CONNECT, 0, 0)));
      });
    });
  }

  /** Strip the 8-byte TCP header and hand the ZK frame to the waiter. */
  private onSocketData(chunk: Buffer, handler: (frame: Buffer) => void): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    for (;;) {
      if (this.buffer.length < 8) return;
      const magic = this.buffer.readUInt16BE(0);
      if (magic !== TCP_MAGIC) {
        // Some firmwares reply without the TCP header on the first packet.
        handler(this.buffer.subarray(0, Math.min(this.buffer.length, 8 + 2)));
        this.buffer = Buffer.alloc(0);
        return;
      }
      const length = this.buffer.readUInt32LE(4);
      if (this.buffer.length < 8 + length) return;
      const frame = this.buffer.subarray(8, 8 + length);
      this.buffer = this.buffer.subarray(8 + length);
      handler(frame);
      if (this.buffer.length === 0) return;
    }
  }

  private dispatchFrame(frame: Buffer): void {
    const command = frame.length >= 2 ? frame.readUInt16LE(0) : -1;

    // A streaming read owns everything after the command's first reply.
    if (this.stream) {
      this.stream.handle(frame, command);
      return;
    }

    const waiting = this.pending;
    if (!waiting) return;
    this.pending = null;
    clearTimeout(waiting.timer);
    waiting.resolve({ code: command, payload: frame });
  }

  /**
   * Issue a command whose answer arrives as PREPARE_DATA + DATA frames.
   *
   * The reply sequence is not a single packet, so it cannot go through
   * sendCommand: the first frame (PREPARE_DATA) would resolve the promise and
   * the log bytes would be dropped. Frames are collected until the declared
   * size is met, the terminal's final ACK arrives, or the deadline passes.
   */
  private runStreamingCommand(command: number, timeoutMs: number): Promise<Buffer> {
    const sock = this.socket;
    if (!sock || sock.destroyed) return Promise.reject(new ZkHandshakeError('Terminal session is not open'));

    return new Promise((resolve, reject) => {
      const dataParts: Buffer[] = [];
      let expectedBytes: number | null = null;
      let receivedBytes = 0;
      let settled = false;
      let idleTimer: NodeJS.Timeout | null = null;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (idleTimer) clearTimeout(idleTimer);
        this.stream = null;
        sock.removeListener('error', onSocketError);
        if (err) reject(err); else resolve(Buffer.concat(dataParts));
      };

      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        // The terminal sends DATA frames back-to-back; a short quiet period
        // after the declared size is reached means the transfer is done.
        idleTimer = setTimeout(() => finish(), expectedBytes === null ? 400 : 250);
      };

      const handle = (frame: Buffer, code: number) => {
        if (settled) return;
        if (code === ZK.PREPARE_DATA) {
          expectedBytes = frame.length >= 12 ? frame.readUInt32LE(8) & 0x7fffffff : 0;
          armIdle();
          return;
        }
        if (code === ZK.DATA) {
          const body = frame.subarray(8);
          dataParts.push(body);
          receivedBytes += body.length;
          if (expectedBytes !== null && receivedBytes >= expectedBytes) {
            finish();
            return;
          }
          armIdle();
          return;
        }
        if (code === ZK.ACK_OK || code === ZK.ACK_ERROR) {
          if (receivedBytes > 0 || code === ZK.ACK_ERROR) finish();
          else armIdle();
          return;
        }
        armIdle();
      };

      this.stream = { handle };

      const deadline = setTimeout(() => {
        if (receivedBytes > 0) finish();
        else finish(new ZkError(`Command ${command} produced no data within ${timeoutMs}ms`, 'ETIMEDOUT'));
      }, timeoutMs);

      const onSocketError = (err: Error) => finish(new ZkHandshakeError(`Stream aborted: ${err.message}`));
      sock.once('error', onSocketError);

      this.replyId = (this.replyId + 1) & 0xffff;
      try {
        sock.write(wrapTcpZkPacket(createZkPacket(command, this.sessionId, this.replyId)));
      } catch (err: any) {
        finish(new ZkHandshakeError(`Could not send command ${command}: ${err?.message}`));
      }
    });
  }

  /** Simple request/reply, used for metadata and control commands.
   *
   * A ZK session has no request id to correlate replies with — the terminal
   * answers commands in the order they arrived. Sending two commands at once
   * therefore hands the first reply to whoever reads last, which is how a
   * log count of 541935955 (ASCII, not a number) ends up in the database.
   * Every command goes through this chain so the socket carries one
   * outstanding request at a time.
   */
  private commandChain: Promise<unknown> = Promise.resolve();

  private sendCommand(command: number, data: Buffer = Buffer.alloc(0), timeoutMs = 2500): Promise<{ code: number; payload: Buffer }> {
    const queued = this.commandChain.then(
      () => this.sendCommandNow(command, data, timeoutMs),
      () => this.sendCommandNow(command, data, timeoutMs)
    );
    // Keep the chain alive even when a command fails, or one timeout would
    // dead-lock every later command on this session.
    this.commandChain = queued.catch(() => undefined);
    return queued;
  }

  private sendCommandNow(command: number, data: Buffer = Buffer.alloc(0), timeoutMs = 2500): Promise<{ code: number; payload: Buffer }> {
    const sock = this.socket;
    if (!sock || sock.destroyed) return Promise.reject(new ZkHandshakeError('Terminal session is not open'));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new ZkError(`Command ${command} timed out after ${timeoutMs}ms`, 'ETIMEDOUT'));
      }, timeoutMs);

      this.pending = { resolve, reject, timer };
      this.replyId = (this.replyId + 1) & 0xffff;
      const packet = createZkPacket(command, this.sessionId, this.replyId, data);
      try {
        sock.write(wrapTcpZkPacket(packet));
      } catch (err: any) {
        clearTimeout(timer);
        this.pending = null;
        reject(new ZkHandshakeError(`Could not write to the terminal: ${err?.message}`));
      }
    });
  }

  async getVersion(): Promise<string> {
    const reply = await this.sendCommand(ZK.VERSION);
    if (reply.code !== ZK.ACK_OK && reply.code !== ZK.ACK_DATA) {
      throw new ZkHandshakeError(`VERSION rejected with code ${reply.code}`);
    }
    const text = reply.payload.length > 8 ? reply.payload.subarray(8).toString('utf8').replace(/\0/g, '').trim() : '';
    if (!text) throw new ZkParseError('VERSION reply contained no firmware string');
    return text;
  }

  /**
   * `~` queries return `~Key=Value`. An absent answer stays null — the UI has to
   * be able to tell "the device did not say" apart from a value.
   */
  async readDeviceInfoKey(key: string): Promise<string | null> {
    const reply = await this.sendCommand(ZK.DEVICE_INFO, Buffer.from(`~${key}\0`, 'utf8'));
    if (reply.code !== ZK.ACK_OK && reply.code !== ZK.ACK_DATA) return null;
    const text = reply.payload.length > 8 ? reply.payload.subarray(8).toString('utf8').replace(/\0/g, '').trim() : '';
    if (!text) return null;
    const prefix = new RegExp(`^~?${key}=`, 'i');
    const value = text.replace(prefix, '').trim();
    return value || null;
  }

  async getDeviceInfo(): Promise<ZkDeviceInfo> {
    const [firmware, serial, name, platform, userCount, logCount] = await Promise.all([
      this.getVersion().catch(() => null),
      this.readDeviceInfoKey('SerialNumber').catch(() => null),
      this.readDeviceInfoKey('DeviceName').catch(() => null),
      this.readDeviceInfoKey('Platform').catch(() => null),
      this.getUserCount().catch(() => null),
      this.getLogCount().catch(() => null),
    ]);

    return {
      serialNumber: serial,
      firmwareVersion: firmware,
      deviceName: name,
      platform,
      userCount,
      logCount,
    };
  }

  async getUserCount(): Promise<number> {
    const reply = await this.sendCommand(ZK.GET_USER_COUNT);
    const body = reply.payload.length >= 12 ? reply.payload.subarray(8, 12) : null;
    if (!body) throw new ZkParseError('USER COUNT reply had no payload');
    return body.readUInt32LE(0);
  }

  async getLogCount(): Promise<number> {
    const reply = await this.sendCommand(ZK.GET_ATTLOG_COUNT);
    const body = reply.payload.length >= 12 ? reply.payload.subarray(8, 12) : null;
    if (!body) throw new ZkParseError('LOG SIZE reply had no payload');
    return body.readUInt32LE(0);
  }

  /** Device clock, as the naive wall parts the terminal believes. */
  async getDeviceTime(): Promise<NaiveParts> {
    const reply = await this.sendCommand(ZK.GET_TIME);
    const body = reply.payload.length >= 12 ? reply.payload.subarray(8, 12) : null;
    if (!body) throw new ZkParseError('GET_TIME reply had no payload');
    return decodeZkPackedTime(body.readUInt32LE(0));
  }

  /**
   * Write the terminal's clock. `timeZone` is the zone the wall clock is meant
   * to show, so the server pushes *its* reading of that zone rather than UTC.
   */
  async setDeviceTime(fromInstant: Date, timeZone: string): Promise<void> {
    const packed = encodeZkPackedTimeForInstant(fromInstant, timeZone);
    const data = Buffer.alloc(4);
    data.writeUInt32LE(packed >>> 0, 0);
    const reply = await this.sendCommand(ZK.SET_TIME, data);
    if (reply.code !== ZK.ACK_OK) throw new ZkError(`SET_TIME rejected with code ${reply.code}`);
  }

  /** Stream the attendance log. Returns raw records with naive device times. */
  async getAttendanceRecords(timeoutMs = 6000): Promise<ZkAttendanceRecord[]> {
    const data = await this.enqueue(() => this.runStreamingCommand(ZK.ATTLOG_RRQ, timeoutMs));
    return parseZkAttLogBuffer(data);
  }

  async getDeviceUsers(timeoutMs = 6000): Promise<ZkUserRecord[]> {
    const data = await this.enqueue(() => this.runStreamingCommand(ZK.USER_RRQ, timeoutMs));
    return parseZkUserBuffer(data);
  }

  /** Serialize a whole exchange (command + streamed replies) on this session. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const queued = this.commandChain.then(task, task);
    this.commandChain = queued.catch(() => undefined);
    return queued;
  }

  async disconnect(): Promise<void> {
    const sock = this.socket;
    if (sock && !sock.destroyed) {
      try {
        this.replyId = (this.replyId + 1) & 0xffff;
        sock.write(wrapTcpZkPacket(createZkPacket(ZK.EXIT, this.sessionId, this.replyId)));
      } catch { /* terminal already gone */ }
      try { sock.destroy(); } catch { /* already destroyed */ }
    }
    this.authenticated = false;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.stream = null;
  }
}

/**
 * UDP probe with the same framing, for terminals configured for UDP. Returns
 * null when the device does not answer the datagram handshake at all.
 */
export async function probeZkTerminalUdp(
  ip: string,
  port = 4370,
  timeoutMs = 1500
): Promise<{ online: boolean; latencyMs: number; error?: string }> {
  const socket = dgram.createSocket('udp4');
  const started = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { online: boolean; latencyMs: number; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      resolve(result);
    };

    const timer = setTimeout(() => finish({ online: false, latencyMs: Date.now() - started, error: `No UDP reply from ${ip}:${port} within ${timeoutMs}ms` }), timeoutMs);

    socket.on('message', (msg) => {
      finish({ online: msg.length >= 8, latencyMs: Math.max(1, Date.now() - started), error: msg.length >= 8 ? undefined : 'Malformed UDP handshake reply' });
    });
    socket.on('error', (err) => finish({ online: false, latencyMs: Date.now() - started, error: err.message }));

    const packet = createZkPacket(ZK.CONNECT, 0, 0);
    socket.send(packet, port, ip, () => { /* sent */ });
  });
}

/**
 * Backwards-compatible helper: probe the terminal and classify what happened.
 * `latency` stays for existing callers; the message is what an operator reads.
 */
export async function probeZkTerminal(
  ip: string,
  port = 4370,
  timeoutMs = 1500,
  commKey = 0
): Promise<{ online: boolean; latency: number; latencyMs: number; error?: string; protocol: 'TCP' | 'UDP' }> {
  const client = new ZkProtocolClient(ip, port, timeoutMs, commKey);
  try {
    const result = await client.connect();
    if (result.connected) {
      await client.disconnect();
      return { online: true, latency: result.latencyMs, latencyMs: result.latencyMs, protocol: 'TCP' };
    }
    const udp = await probeZkTerminalUdp(ip, port, timeoutMs);
    if (udp.online) {
      return { online: true, latency: udp.latencyMs, latencyMs: udp.latencyMs, protocol: 'UDP' };
    }
    return { online: false, latency: 999, latencyMs: result.latencyMs, error: result.error || udp.error, protocol: 'TCP' };
  } catch (err: any) {
    return { online: false, latency: 999, latencyMs: 999, error: err?.message, protocol: 'TCP' };
  }
}
