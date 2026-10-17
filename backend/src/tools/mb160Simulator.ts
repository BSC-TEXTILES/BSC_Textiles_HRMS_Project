/**
 * Simulated eSSL MB160 terminal.
 *
 * Nothing in this repo can be verified against real hardware from a desk, so
 * this stands in for one and implements both transports faithfully:
 *
 *   --mode=tcp   listens on 4370 and answers the standalone ZK pull protocol
 *                (handshake, optional comm-key auth, VERSION/~SerialNumber,
 *                GET_TIME/SET_TIME, counts, ATTLOG_RRQ and USER_RRQ streams)
 *   --mode=adms  behaves as an ADMS client: /iclock/cdata handshake, then
 *                pushes ATTLOG rows (and ATTPHOTO snapshots with --photos)
 *                as a real terminal would when Realtime=1
 *   --mode=both  the two together, which is the normal MB160 deployment
 *
 * It is deliberately strict about the wire formats: if the server mis-parses a
 * record, a mode, or a timestamp, the simulator is what proves it.
 *
 *   npm run device:simulator -- --punch-every=6 --employees=4 --photos
 */

import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string | null = null): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return args.includes(`--${name}`) ? 'true' : fallback;
};

const MODE = flag('mode', 'both')!;
const PORT = Number(flag('port', '4370'));
const SERVER_URL = (flag('server', 'http://localhost:4000')!).replace(/\/$/, '');
const SERIAL = flag('serial', 'SIMMB160DEMO01')!;
const TIMEZONE = flag('timezone', 'Asia/Kolkata')!;
const COMM_KEY = Number(flag('comm-key', '0'));
const PUNCH_EVERY_SECONDS = Number(flag('punch-every', '6'));
const EMPLOYEE_COUNT = Number(flag('employees', '6'));
const WITH_PHOTOS = flag('photos') !== null;
const DEVICE_LOG_ROWS = Number(flag('log-rows', '20'));

/**
 * Attendance log the simulator replays. Times are naive device wall clock, and
 * verify codes use the standard ZK values: 15 face, 1 fingerprint, 2 card.
 * Enrollment numbers come from the demo dataset.
 */
const ENROLLMENTS = Array.from({ length: EMPLOYEE_COUNT }, (_, i) => String(100201 + i));
const VERIFY_CYCLE = [15, 1, 2, 15, 15, 2];

interface SimLog {
  pin: string;
  wall: Date;
  verify: number;
  state: number;
  workCode: number;
  match: number;
}

const attLog: SimLog[] = [];

function pushLog(pin: string, when: Date, verify: number, state: number): SimLog {
  const entry: SimLog = {
    pin,
    wall: when,
    verify,
    state,
    workCode: 0,
    match: verify === 15 ? 72 + (Number(pin) % 20) : 0,
  };
  attLog.push(entry);
  while (attLog.length > DEVICE_LOG_ROWS) attLog.shift();
  return entry;
}

/** Wall clock in the device zone, as the terminal would print it. */
function deviceWallParts(at = new Date()): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** ZK packed time: seconds/minutes/hours then days, months, years since 2000. */
function packTime(w = deviceWallParts()): number {
  return ((((w.year - 2000) * 12 + (w.month - 1)) * 31 + (w.day - 1)) * 24 + w.hour) * 3600 + w.minute * 60 + w.second;
}

function unpackTime(value: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  let v = value;
  const second = v % 60; v = Math.floor(v / 60);
  const minute = v % 60; v = Math.floor(v / 60);
  const hour = v % 24; v = Math.floor(v / 24);
  const day = (v % 31) + 1; v = Math.floor(v / 31);
  const month = (v % 12) + 1; v = Math.floor(v / 12);
  return { year: v + 2000, month, day, hour, minute, second };
}

function wallString(w: { year: number; month: number; day: number; hour: number; minute: number; second: number }): string {
  const p = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${p(w.year, 4)}-${p(w.month)}-${p(w.day)} ${p(w.hour)}:${p(w.minute)}:${p(w.second)}`;
}

// ─── ZK framing ─────────────────────────────────────────────────────────────

function checksum(buf: Buffer): number {
  let sum = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) sum += buf.readUInt16LE(i);
  if (buf.length % 2) sum += buf[buf.length - 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

function makeKey(key: number, sessionId: number, ticks = 50): Buffer {
  let k = 0n;
  for (let i = 0n; i < 32n; i++) k = ((BigInt(key >>> 0) & (1n << i)) > 0n ? (k << 1n) | 1n : k << 1n);
  k = (k + BigInt(sessionId >>> 0)) & 0xffffffffn;
  const b = Buffer.alloc(4);
  b.writeUInt32LE(Number(k), 0);
  const zkso = [0x5a, 0x4b, 0x53, 0x4f];
  for (let i = 0; i < 4; i++) b[i] ^= zkso[i];
  const w0 = b.readUInt16LE(0);
  const w1 = b.readUInt16LE(2);
  b.writeUInt16LE(w1, 0);
  b.writeUInt16LE(w0, 2);
  const byte = 0xff & ticks;
  b[0] ^= byte; b[1] ^= byte; b[2] = byte; b[3] ^= byte;
  return b;
}

function buildPacket(command: number, sessionId: number, replyId: number, data = Buffer.alloc(0)): Buffer {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt16LE(command, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt16LE(sessionId, 4);
  buf.writeUInt16LE(replyId, 6);
  if (data.length) data.copy(buf, 8);
  buf.writeUInt16LE(checksum(buf), 2);
  return buf;
}

function frame(packet: Buffer): Buffer {
  const out = Buffer.alloc(8 + packet.length);
  out.writeUInt16BE(0x5050, 0);
  out.writeUInt16BE(0x827d, 2);
  out.writeUInt32LE(packet.length, 4);
  packet.copy(out, 8);
  return out;
}

const CMD = {
  CONNECT: 1000, EXIT: 1001, GET_TIME: 201, SET_TIME: 202, VERSION: 1100, AUTH: 1102,
  ACK_OK: 2000, ACK_UNAUTH: 2005, PREPARE_DATA: 1500, DATA: 1501,
  ATTLOG_RRQ: 13, USER_RRQ: 8, GET_USER_COUNT: 50, GET_ATTLOG_COUNT: 51, DEVICE_INFO: 11,
};

const FIRMWARE = 'SIM MB160 Ver 8.0.4.7';
const PLATFORM = 'ZMM220_TFT';

/** Encode one 40-byte ATLOG record exactly as a ZMM220 terminal does. */
function encodeAttRecord(log: SimLog): Buffer {
  const record = Buffer.alloc(40);
  record.writeUInt16LE(40, 0);
  record.write(log.pin.slice(0, 24), 2, 'utf8');
  record.writeUInt8(log.verify, 26);
  const w = deviceWallParts(log.wall);
  const packed = ((((w.year - 2000) * 12 + (w.month - 1)) * 31 + (w.day - 1)) * 24 + w.hour) * 3600 + w.minute * 60 + w.second;
  record.writeUInt32LE(packed, 27);
  record.writeUInt8(log.state, 31);
  record.writeUInt32LE(log.workCode, 32);
  return record;
}

/** Encode one 292-byte USERINFO record. */
function encodeUserRecord(pin: string, name: string): Buffer {
  const record = Buffer.alloc(292);
  record.writeUInt16LE(292, 0);
  record.write(pin.slice(0, 8), 2, 'utf8');
  record.writeUInt8(0, 11); // privilege: normal user
  record.write('0', 12, 'utf8');
  record.write(name.slice(0, 31), 20, 'utf8');
  return record;
}

// ─── TCP server (standalone pull protocol) ──────────────────────────────────

function startTcpServer(): net.Server {
  let sessionId = 1;
  const server = net.createServer((socket) => {
    let authenticated = COMM_KEY === 0;
    let session = sessionId++;
    let buffer = Buffer.alloc(0);
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;

    const send = (command: number, data = Buffer.alloc(0), id = session) => {
      socket.write(frame(buildPacket(command, id, 0, data)));
    };

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8) {
        if (buffer.readUInt16BE(0) !== 0x5050) { buffer = Buffer.alloc(0); break; }
        const length = buffer.readUInt32LE(4);
        if (buffer.length < 8 + length) break;
        const frameBody = buffer.subarray(8, 8 + length);
        buffer = buffer.subarray(8 + length);
        handle(frameBody);
      }
    });

    socket.on('error', (err) => log(`tcp socket error: ${err.message}`));

    function handle(packet: Buffer): void {
      if (packet.length < 8) return;
      const command = packet.readUInt16LE(0);
      const replyId = packet.readUInt16LE(6);
      const body = packet.subarray(8);

      if (command === CMD.CONNECT) {
        session = sessionId++;
        if (COMM_KEY === 0) {
          log(`handshake from ${peer} (no comm key)`);
          send(CMD.ACK_OK, Buffer.alloc(0), session);
        } else {
          log(`handshake from ${peer}, requiring comm key`);
          send(CMD.ACK_UNAUTH, Buffer.alloc(0), session);
        }
        return;
      }

      if (command === CMD.AUTH) {
        const expected = makeKey(COMM_KEY, session);
        if (body.length >= 4 && body.subarray(0, 4).equals(expected)) {
          authenticated = true;
          log(`comm key accepted for session ${session}`);
          send(CMD.ACK_OK, Buffer.alloc(0), session);
        } else {
          log(`comm key REJECTED for session ${session}`);
          send(CMD.ACK_UNAUTH, Buffer.alloc(0), session);
          socket.end();
        }
        return;
      }

      if (!authenticated) {
        send(CMD.ACK_UNAUTH, Buffer.alloc(0), session);
        return;
      }

      switch (command) {
        case CMD.VERSION: {
          const payload = Buffer.alloc(8 + FIRMWARE.length + 1);
          Buffer.from(FIRMWARE, 'utf8').copy(payload, 8);
          send(CMD.ACK_OK, payload.subarray(8), session);
          break;
        }
        case CMD.DEVICE_INFO: {
          const query = body.toString('utf8').replace(/\0/g, '');
          const key = query.replace(/^~/, '').split('=')[0];
          const values: Record<string, string> = {
            SerialNumber: SERIAL,
            DeviceName: 'MB160-SIM',
            Platform: PLATFORM,
            FlashSize: '16M',
            AttendanceInRam: String(attLog.length),
            TimeZone: String(offsetMinutes()),
          };
          const text = `~${key}=${values[key] ?? ''}`;
          send(CMD.ACK_OK, Buffer.from(text, 'utf8'), session);
          break;
        }
        case CMD.GET_TIME: {
          const data = Buffer.alloc(4);
          data.writeUInt32LE(packTime(), 0);
          send(CMD.ACK_OK, data, session);
          break;
        }
        case CMD.SET_TIME: {
          if (body.length >= 4) {
            const packed = body.readUInt32LE(0);
            const w = unpackTime(packed);
            log(`clock SET by server to ${wallString(w)} (${TIMEZONE})`);
            simulatedClockOffsetMs = Date.now() - wallToEpoch(w);
          }
          send(CMD.ACK_OK, Buffer.alloc(0), session);
          break;
        }
        case CMD.GET_USER_COUNT: {
          const data = Buffer.alloc(4);
          data.writeUInt32LE(ENROLLMENTS.length, 0);
          send(CMD.ACK_OK, data, session);
          break;
        }
        case CMD.GET_ATTLOG_COUNT: {
          const data = Buffer.alloc(4);
          data.writeUInt32LE(attLog.length, 0);
          send(CMD.ACK_OK, data, session);
          break;
        }
        case CMD.ATTLOG_RRQ: {
          log(`ATTLOG_RRQ — streaming ${attLog.length} record(s)`);
          const records = attLog.map(encodeAttRecord);
          const payload = Buffer.concat(records);
          const size = Buffer.alloc(4);
          size.writeUInt32LE((payload.length | 0x80000000) >>> 0, 0);
          socket.write(frame(buildPacket(CMD.PREPARE_DATA, session, replyId, size)));
          // Stream in two writes so the client has to reassemble frames.
          const half = Math.ceil(payload.length / 2);
          socket.write(frame(buildPacket(CMD.DATA, session, replyId, payload.subarray(0, half))));
          if (payload.length > half) socket.write(frame(buildPacket(CMD.DATA, session, replyId, payload.subarray(half))));
          socket.write(frame(buildPacket(CMD.ACK_OK, session, replyId)));
          break;
        }
        case CMD.USER_RRQ: {
          log('USER_RRQ — streaming users');
          const payload = Buffer.concat(ENROLLMENTS.map((pin) => encodeUserRecord(pin, `SIM ${pin}`)));
          const size = Buffer.alloc(4);
          size.writeUInt32LE((payload.length | 0x80000000) >>> 0, 0);
          socket.write(frame(buildPacket(CMD.PREPARE_DATA, session, replyId, size)));
          socket.write(frame(buildPacket(CMD.DATA, session, replyId, payload)));
          socket.write(frame(buildPacket(CMD.ACK_OK, session, replyId)));
          break;
        }
        case CMD.EXIT:
          log('client sent EXIT');
          socket.end();
          break;
        default:
          send(CMD.ACK_OK, Buffer.alloc(0), session);
      }
    }
  });

  server.on('error', (err) => log(`tcp server error: ${err.message}`));
  server.listen(PORT, '0.0.0.0', () => log(`ZK pull server listening on tcp://0.0.0.0:${PORT} (serial ${SERIAL}, tz ${TIMEZONE}, commKey ${COMM_KEY})`));
  return server;
}

function offsetMinutes(at = new Date()): number {
  const w = deviceWallParts(at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

let simulatedClockOffsetMs = 0;

function wallToEpoch(w: { year: number; month: number; day: number; hour: number; minute: number; second: number }): number {
  // Convert the device's claim about its own wall clock back to an epoch by
  // removing the zone offset the simulator reports.
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const probe = new Date(naive - offsetMinutes(new Date(naive)) * 60_000);
  return probe.getTime();
}

function nowOnDevice(): Date {
  return new Date(Date.now() + simulatedClockOffsetMs);
}

// ─── ADMS client (push protocol) ────────────────────────────────────────────

function postText(pathname: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, SERVER_URL);
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8').trim() }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getText(pathname: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, SERVER_URL);
    const req = http.request(url, { method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8').trim() }));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * A real, decodable 8x8 PNG.
 *
 * The first version of this simulator emitted a 12-byte "JPEG-ish" buffer that
 * satisfied the server's magic-byte check but that no browser can decode — so
 * the photo column looked broken even though storage and HTTP were correct. A
 * valid image is the only way to actually test the display path.
 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function tinyPng(seed: number): string {
  const size = 8;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      raw[offset++] = (x * 31 + seed) & 0xff;
      raw[offset++] = (y * 37 + seed * 3) & 0xff;
      raw[offset++] = ((x + y) * 19 + seed * 7) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

async function admsHandshake(): Promise<Record<string, string>> {
  const res = await getText(`/iclock/cdata?SN=${SERIAL}&options=all&pushver=2.4.1&language=Chinese`);
  const options: Record<string, string> = {};
  for (const line of res.text.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0) options[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  log(`handshake replied ${res.status}: Realtime=${options.Realtime} TimeZone=${options.TimeZone} TransInterval=${options.TransInterval}`);
  return options;
}

async function pushPunches(logs: SimLog[]): Promise<void> {
  if (logs.length === 0) return;
  const body = logs
    .map((l) => `${l.pin}\t${wallString(deviceWallParts(l.wall))}\t${l.state}\t${l.verify}`)
    .join('\r\n');
  const res = await postText(`/iclock/cdata?SN=${SERIAL}&table=ATTLOG`, body);
  log(`ATTLOG push ${logs.length} → ${res.status} ${res.text}`);
}

async function pushPhoto(entry: SimLog): Promise<void> {
  const payload = tinyPng(Number(entry.pin) || 1);
  const body = `${entry.pin}\t${wallString(deviceWallParts(entry.wall))}\t${payload.length}\t${payload}`;
  const res = await postText(`/iclock/cdata?SN=${SERIAL}&table=ATTPHOTO`, body);
  log(`ATTPHOTO push → ${res.status} ${res.text}`);
}

async function pushUsers(): Promise<void> {
  const body = ENROLLMENTS.map((pin) => `${pin}\tSIM ${pin}\t0\t0\t`).join('\r\n');
  const res = await postText(`/iclock/cdata?SN=${SERIAL}&table=USERINFO`, body);
  log(`USERINFO push ${ENROLLMENTS.length} → ${res.status} ${res.text}`);
}

async function heartbeat(): Promise<void> {
  const res = await getText(`/iclock/getrequest?SN=${SERIAL}&options=all`);
  if (res.text && res.text !== 'N' && !res.text.startsWith('OK')) {
    log(`server commands: ${res.text.replace(/\n/g, ' | ')}`);
    for (const line of res.text.split(/\r?\n/)) {
      const match = /^C:(\d+):(.+)$/.exec(line.trim());
      if (match) {
        const ack = await postText(`/iclock/devicecmd?SN=${SERIAL}&ID=${match[1]}&Return=0`, '');
        log(`acked command ${match[2]} → ${ack.status}`);
      }
    }
  }
}

// ─── Runner ─────────────────────────────────────────────────────────────────

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] [MB160-SIM] ${message}`);
}

let punchesSent = 0;
let nextPunchAt = 0;

async function tickAdms(): Promise<void> {
  if (Date.now() < nextPunchAt) return;
  nextPunchAt = Date.now() + PUNCH_EVERY_SECONDS * 1000;

  const pin = ENROLLMENTS[punchesSent % ENROLLMENTS.length];
  const verify = VERIFY_CYCLE[punchesSent % VERIFY_CYCLE.length];
  // Alternate in/out so the pairing logic gets a realistic day.
  const state = punchesSent % 2 === 0 ? 0 : 1;
  const when = nowOnDevice();
  const entry = pushLog(pin, when, verify, state);

  await pushPunches([entry]);
  if (WITH_PHOTOS && verify === 15) await pushPhoto(entry);
  punchesSent++;
}

async function main(): Promise<void> {
  if (MODE === 'tcp' || MODE === 'both') startTcpServer();

  if (MODE === 'adms' || MODE === 'both') {
    // Give the API a moment if it is starting at the same time.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await admsHandshake();
      await pushUsers();
      await postText(`/iclock/cdata?SN=${SERIAL}&table=options`, [
        `Company=BSC Textiles`,
        `Firmware=${FIRMWARE}`,
        `SerialNumber=${SERIAL}`,
        `Platform=${PLATFORM}`,
        `UserCount=${ENROLLMENTS.length}`,
        `AttendColor=0`,
        `SupportPhoto=1`,
        `LockTime=60`,
      ].join('\r\n'));
      log(`ADMS client ready → ${SERVER_URL}/iclock (interval ${PUNCH_EVERY_SECONDS}s${WITH_PHOTOS ? ', photos on' : ''})`);

      // A short backlog so there is history to report on immediately.
      const backlog: SimLog[] = [];
      for (let i = 0; i < 4; i++) {
        const pin = ENROLLMENTS[i % ENROLLMENTS.length];
        const minutesAgo = (4 - i) * 17;
        backlog.push(pushLog(pin, new Date(Date.now() - minutesAgo * 60_000), VERIFY_CYCLE[i % VERIFY_CYCLE.length], i % 2 === 0 ? 0 : 1));
      }
      await pushPunches(backlog);
    } catch (err: any) {
      log(`ADMS bootstrap failed: ${err.message} — is the API running on ${SERVER_URL}?`);
    }

    setInterval(() => {
      tickAdms().catch((err) => log(`push tick failed: ${err.message}`));
      heartbeat().catch((err) => log(`heartbeat failed: ${err.message}`));
    }, Math.max(1000, PUNCH_EVERY_SECONDS * 1000));
  }

  process.on('SIGINT', () => {
    log('shutting down');
    fs.writeFileSync(path.resolve('simulator-last-state.json'), JSON.stringify({ serial: SERIAL, attLogCount: attLog.length, punchesSent }, null, 2));
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Simulator failed:', err);
  process.exit(1);
});
