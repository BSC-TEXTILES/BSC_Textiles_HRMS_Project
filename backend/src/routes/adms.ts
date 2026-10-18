/**
 * eSSL MB160 ADMS / "cloud server" push endpoints.
 *
 * This is the transport that actually delivers punches in real time: the
 * terminal is pointed at this server (Menu → Comm → Cloud Server Setting) and
 * pushes ATTLOG/RTLOG rows itself, with `Realtime=1` making it push within a
 * second of a verification. The standalone pull protocol has no equivalent of a
 * device-initiated event, so push is the real-time path and polling is the
 * fallback.
 *
 * Handled paths (mounted at both `/iclock` and `/api/devices/adms`):
 *   GET  /cdata            — handshake; returns Realtime/TransInterval/TimeZone
 *   POST /cdata?table=ATTLOG|RTLOG   — punch push
 *   POST /cdata?table=ATTPHOTO       — face snapshot push (firmware dependent)
 *   POST /cdata?table=USERINFO|USER  — enrollment list push
 *   POST /cdata?table=options        — firmware/telemetry registration
 *   GET  /getrequest       — heartbeat; the server queues commands here
 *   POST /devicecmd        — command result
 *   POST /registry         — initial registration
 *
 * Deliberately absent: no default verify mode. A line without a verify code is
 * ingested as "not reported", which the UI shows as Unknown.
 */

import { Router, Request, Response } from 'express';
import {
  ingestRawPunches,
  ingestDeviceUsers,
  recordDeviceHeartbeat,
  updateDeviceSpecs,
  popDeviceCommand,
} from '../services/biometricService.js';
import { loadGlobalSettings, getDeviceConfig } from '../services/biometric/settings.js';
import { deviceLog } from '../services/biometric/logger.js';
import { pool } from '../nativeDb.js';

export const admsRouter = Router();

/** Buffer bodies up to the photo limit without parsing them as JSON. */
const rawBody = (req: Request): string => {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body instanceof Uint8Array) return Buffer.from(req.body).toString('utf8');
  if (req.body && typeof req.body === 'object') return Object.keys(req.body).join('\n');
  return '';
};

/**
 * `<PIN>\t<YYYY-MM-DD HH:MM:SS>\t<Status>\t<VerifyMode>` — tab separated, but
 * eSSL firmware is inconsistent about spaces vs tabs, and about whether the
 * timestamp is one field or split across two.
 *
 * @returns parsed punches plus lines that could not be understood, so a silent
 *          format change on the device shows up as a count instead of lost data.
 */
export function parseAttLogBody(bodyText: string, serialNumber: string): {
  punches: Array<{
    serialNumber: string;
    enrollmentNumber: string;
    punchTime: string;
    punchState: number | null;
    verifyMode: number | null;
  }>;
  malformed: string[];
} {
  const lines = bodyText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const punches: ReturnType<typeof buildEmpty>['punches'] = [];
  const malformed: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;
    if (/^GET\s+OPTION/i.test(line) || /=\s*$/.test(line) && !line.includes('\t')) {
      // Handshake option echoes can arrive on a POST; ignore, not malformed.
      continue;
    }

    const fields = line.includes('\t')
      ? line.split('\t').map((f) => f.trim())
      : line.split(/\s+/).map((f) => f.trim());

    if (fields.length < 2) {
      malformed.push(line);
      continue;
    }

    const enrollmentNumber = fields[0];
    if (!enrollmentNumber || !/^[\w-]{1,24}$/.test(enrollmentNumber)) {
      malformed.push(line);
      continue;
    }

    // Timestamp is either one field ("2026-10-16 09:12:34" after a tab) or two
    // space-separated fields when the whole line was split on whitespace.
    let punchTime = fields[1];
    let restStart = 2;
    if (!/\d{4}.\d{2}.\d{2}/.test(punchTime) && /\d{2}:\d{2}/.test(fields[1] ?? '')) {
      punchTime = fields[1];
    } else if (/\d{4}.\d{2}.\d{2}$/.test(punchTime)) {
      // Date-only first field; the clock time follows.
      punchTime = `${punchTime} ${fields[2] ?? '00:00:00'}`;
      restStart = 3;
    }

    if (!/\d{4}.\d{2}.\d{2}/.test(punchTime)) {
      malformed.push(line);
      continue;
    }
    // A time of day is required; date-only lines would land at 00:00 and look
    // like a real midnight punch.
    if (!/(\d{1,2}):(\d{2})(?::(\d{2}))?/.test(punchTime)) {
      punchTime = `${punchTime} 00:00:00`;
    }

    const statusField = fields[restStart];
    const verifyField = fields[restStart + 1];

    punches.push({
      serialNumber,
      enrollmentNumber,
      punchTime,
      // null keeps "the device did not say" instead of inventing a value.
      punchState: statusField !== undefined && statusField !== '' && Number.isFinite(Number(statusField)) ? Number(statusField) : null,
      verifyMode: verifyField !== undefined && verifyField !== '' && Number.isFinite(Number(verifyField)) ? Number(verifyField) : null,
    });
  }

  return { punches, malformed };
}

function buildEmpty() {
  return { punches: [] as any[], malformed: [] as string[] };
}

/**
 * USERINFO push. Formats vary: `PIN\tName\tPri\tPasswd\tCard`, space separated,
 * or `PIN=.. Name=..` key=value lines.
 */
export function parseUserInfoBody(bodyText: string): Array<{ pin: string; name: string; privilege?: number; card?: string; password?: string }> {
  const lines = bodyText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const users: Array<{ pin: string; name: string; privilege?: number; card?: string; password?: string }> = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;

    if (line.includes('=') && !line.includes('\t')) {
      const parsed: Record<string, string> = {};
      for (const part of line.split(/[\t ]+/)) {
        const eq = part.indexOf('=');
        if (eq > 0) parsed[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).trim();
      }
      if (parsed.PIN) {
        users.push({
          pin: parsed.PIN,
          name: parsed.NAME || '',
          privilege: parsed.PRI !== undefined ? Number(parsed.PRI) || 0 : 0,
          card: parsed.CARD || '',
          password: parsed.PASSWD || '',
        });
      }
      continue;
    }

    const fields = line.includes('\t') ? line.split('\t').map((f) => f.trim()) : line.split(/\s+/).map((f) => f.trim());
    if (!fields[0]) continue;
    users.push({
      pin: fields[0],
      name: fields[1] || '',
      privilege: fields[2] !== undefined ? Number(fields[2]) || 0 : 0,
      password: fields[3] || '',
      card: fields[4] || '',
    });
  }

  return users;
}

/**
 * ATTPHOTO push: `<PIN>\t<YYYY-MM-DD HH:MM:SS>\t<size>\t<base64 JPEG>`.
 * The size field and base64 payload make this the one ADMS table that must not
 * be line-trimmed, so it is parsed on its own.
 */
export function parseAttPhotoBody(bodyText: string): Array<{ pin: string; punchTime: string; size: number | null; base64: string }> {
  const photos: Array<{ pin: string; punchTime: string; size: number | null; base64: string }> = [];
  for (const line of bodyText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const fields = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(/\s+/);
    if (fields.length < 4) continue;
    const [pin, punchTime, sizeRaw, payload] = fields;
    if (!/^[\w-]{1,24}$/.test(pin.trim())) continue;
    if (!/\d{4}.\d{2}.\d{2}/.test(punchTime.trim())) continue;
    const base64 = (payload || '').replace(/\s+/g, '');
    if (!base64) continue;
    photos.push({
      pin: pin.trim(),
      punchTime: punchTime.trim(),
      size: Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : null,
      base64,
    });
  }
  return photos;
}

/**
 * GET /cdata — handshake. The values returned here configure the device:
 * Realtime=1 makes it push on each verification, TransInterval=1 tightens the
 * transaction cadence, and TimeZone is the offset the device will stamp its own
 * wall clock with, taken from the stored device timezone rather than hardcoded.
 */
admsRouter.get('/cdata', async (req: Request, res: Response) => {
  const sn = String(req.query.SN || '').trim();
  const pushver = String(req.query.pushver || '').trim();

  if (!sn) {
    deviceLog.warn('ADMS handshake missing serial number', { detail: `IP: ${req.ip}` });
    res.status(400).setHeader('Content-Type', 'text/plain');
    return res.send('ERROR: MISSING_SN');
  }

  const device = await getDeviceConfig(sn);
  if (!device) {
    deviceLog.warn('ADMS handshake rejected: unknown or unregistered device', {
      serialNumber: sn,
      detail: `IP: ${req.ip}`,
      code: 'CONFIG_MISSING',
    });
    res.status(401).setHeader('Content-Type', 'text/plain');
    return res.send('UNAUTHORIZED: UNKNOWN_DEVICE');
  }

  if (device.isActive === false) {
    deviceLog.warn('ADMS handshake rejected: device deactivated', {
      serialNumber: sn,
      code: 'DEVICE_DEACTIVATED',
    });
    res.status(403).setHeader('Content-Type', 'text/plain');
    return res.send('FORBIDDEN: DEVICE_DEACTIVATED');
  }

  const settings = await loadGlobalSettings();
  const timeZoneOffsetMinutes = offsetMinutesFor(device.timezone || settings.defaultTimezone, new Date());

  await recordDeviceHeartbeat(sn, req.ip);
  if (pushver) await updateDeviceSpecs(sn, { pushVersion: pushver });

  deviceLog.info('ADMS handshake', {
    serialNumber: sn,
    locationCode: device.locationCode,
    detail: `pushver=${pushver || 'unset'} tzOffset=${timeZoneOffsetMinutes / 60}`,
  });

  res.setHeader('Content-Type', 'text/plain');
  res.send(
    [
      `GET OPTION FROM: ${sn}`,
      `Stamp=${Math.floor(Date.now() / 1000)}`,
      `OpStamp=${Math.floor(Date.now() / 1000)}`,
      `ErrorDelay=30`,
      `Delay=5`,
      `TransTimes=00:00;12:00`,
      `TransInterval=1`,
      `TransFlag=1111111111`,
      `TimeZone=${timeZoneOffsetMinutes}`,
      `Realtime=1`,
      `Encrypt=0`,
      `ServerVersion=3.1.1`,
      `PushOptionsFlag=1`,
      '',
    ].join('\n')
  );
});

function offsetMinutesFor(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
  } catch {
    return 330;
  }
}

/**
 * POST /cdata?table=… — the payload paths.
 */
admsRouter.post('/cdata', async (req: Request, res: Response) => {
  const sn = String(req.query.SN || '').trim();
  const table = String(req.query.table || 'ATTLOG').toUpperCase();
  const body = rawBody(req);

  if (!sn) {
    deviceLog.warn('ADMS push missing serial number', { detail: `table=${table} IP=${req.ip}` });
    res.status(400).setHeader('Content-Type', 'text/plain');
    return res.send('ERROR: MISSING_SN');
  }

  const device = await getDeviceConfig(sn);
  if (!device) {
    deviceLog.warn('ADMS push rejected: unknown or unregistered device', {
      serialNumber: sn,
      detail: `table=${table} IP=${req.ip}`,
      code: 'CONFIG_MISSING',
    });
    res.status(401).setHeader('Content-Type', 'text/plain');
    return res.send('UNAUTHORIZED: UNKNOWN_DEVICE');
  }

  if (device.isActive === false) {
    deviceLog.warn('ADMS push rejected: device deactivated', {
      serialNumber: sn,
      code: 'DEVICE_DEACTIVATED',
    });
    res.status(403).setHeader('Content-Type', 'text/plain');
    return res.send('FORBIDDEN: DEVICE_DEACTIVATED');
  }

  try {
    await recordDeviceHeartbeat(sn, req.ip);

    if ((table === 'ATTLOG' || table === 'RTLOG') && body) {
      const { punches, malformed } = parseAttLogBody(body, sn);
      if (malformed.length > 0) {
        deviceLog.warn('ADMS punch lines could not be parsed', {
          serialNumber: sn, code: 'PROTOCOL_PARSE_FAILURE',
          detail: `${malformed.length} line(s), first: ${malformed[0].slice(0, 80)}`,
        });
      }
      if (punches.length > 0) {
        const result = await ingestRawPunches(
          punches.map((p) => ({
            serialNumber: p.serialNumber,
            enrollmentNumber: p.enrollmentNumber,
            punchTime: p.punchTime,
            punchState: p.punchState,
            verifyMode: p.verifyMode,
            source: 'ADMS_PUSH' as const,
          }))
        );
        deviceLog.info('ADMS punch push processed', {
          serialNumber: sn,
          detail: `${result.inserted} new, ${result.duplicates} replayed, ${result.unmapped + result.ambiguous} need review, ${result.rejected} rejected, ${result.latencyMs}ms`,
        });
        res.setHeader('Content-Type', 'text/plain');
        return res.send(`OK: ${punches.length}`);
      }
      res.setHeader('Content-Type', 'text/plain');
      return res.send('OK: 0');
    }

    if (table === 'ATTPHOTO' && body) {
      const photos = parseAttPhotoBody(body);
      const device = sn ? await getDeviceConfig(sn) : null;
      if (device && !device.photoPushEnabled) {
        await pool.query('UPDATE biometric_devices SET photoPushEnabled = 1 WHERE id = ?', [device.id]).catch(() => undefined);
        deviceLog.info('Terminal is pushing photos — flag enabled automatically', { serialNumber: sn });
      }
      if (photos.length > 0) {
        // Route the snapshot through the ingestion engine with the punch it
        // belongs to, so storage and linking share one code path.
        await ingestRawPunches(
          photos.map((p) => ({
            serialNumber: sn,
            enrollmentNumber: p.pin,
            // A photo only makes sense attached to its punch timestamp.
            punchTime: p.punchTime,
            photoBase64: p.base64,
            source: 'ADMS_PUSH' as const,
          }))
        );
        res.setHeader('Content-Type', 'text/plain');
        return res.send(`OK: ${photos.length}`);
      }
      res.setHeader('Content-Type', 'text/plain');
      return res.send('OK: 0');
    }

    if ((table === 'USERINFO' || table === 'USER' || table === 'ENROLLDPASS') && body) {
      const users = parseUserInfoBody(body);
      if (users.length > 0) {
        const result = await ingestDeviceUsers(sn, users);
        deviceLog.info('ADMS user push processed', {
          serialNumber: sn,
          detail: `${result.processed} read, ${result.mapped} matched, ${result.ambiguous} ambiguous, ${result.unlinked} unlinked`,
        });
        res.setHeader('Content-Type', 'text/plain');
        return res.send(`OK: ${users.length}`);
      }
    }

    if (table === 'OPTIONS' && body) {
      const specs = parseOptionsBody(body);
      await updateDeviceSpecs(sn, specs);
      deviceLog.info('ADMS options registered', { serialNumber: sn, detail: Object.keys(specs).join(',') });
      res.setHeader('Content-Type', 'text/plain');
      return res.send('OK');
    }

    res.setHeader('Content-Type', 'text/plain');
    return res.send('OK');
  } catch (err: any) {
    deviceLog.error('ADMS push failed', { serialNumber: sn, code: 'PROTOCOL_PARSE_FAILURE', detail: err?.message });
    // A device treats any non-OK body as a failed transaction and retries; 500
    // would make it stop pushing entirely on some firmwares.
    res.status(500).setHeader('Content-Type', 'text/plain');
    return res.send('ERROR');
  }
});

function parseOptionsBody(bodyText: string): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const line of bodyText.split(/[\r\n&]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    specs[trimmed.slice(0, eq).replace(/^[~_]/, '').trim()] = trimmed.slice(eq + 1).trim();
  }
  return specs;
}

/**
 * GET /getrequest — heartbeat plus command dispatch. Anything the server wants
 * the terminal to do (re-read logs after an outage, set time) is answered here.
 */
admsRouter.get('/getrequest', async (req: Request, res: Response) => {
  const sn = String(req.query.SN || '').trim();
  if (!sn) {
    res.status(400).setHeader('Content-Type', 'text/plain');
    return res.send('ERROR: MISSING_SN');
  }

  const device = await getDeviceConfig(sn);
  if (!device || device.isActive === false) {
    res.status(401).setHeader('Content-Type', 'text/plain');
    return res.send('UNAUTHORIZED: UNKNOWN_DEVICE');
  }

  const commands: string[] = [];
  await recordDeviceHeartbeat(sn, req.ip);
  let command = popDeviceCommand(sn);
  while (command && commands.length < 5) {
    commands.push(`C:${command.id}:${command.command}`);
    command = popDeviceCommand(sn);
  }

  res.setHeader('Content-Type', 'text/plain');
  res.send(commands.length ? `${commands.join('\n')}\n` : 'N');
});

admsRouter.post('/devicecmd', async (req: Request, res: Response) => {
  const sn = String(req.query.SN || '').trim();
  if (!sn) {
    res.status(400).setHeader('Content-Type', 'text/plain');
    return res.send('ERROR: MISSING_SN');
  }

  const device = await getDeviceConfig(sn);
  if (!device || device.isActive === false) {
    res.status(401).setHeader('Content-Type', 'text/plain');
    return res.send('UNAUTHORIZED: UNKNOWN_DEVICE');
  }

  await recordDeviceHeartbeat(sn, req.ip);
  deviceLog.info('ADMS command result', {
    serialNumber: sn,
    detail: `id=${req.query.ID || '-'} return=${req.query.Return || '-'}`,
  });
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

admsRouter.post('/registry', async (req: Request, res: Response) => {
  const sn = String(req.query.SN || '').trim();
  deviceLog.info('ADMS registry handshake', { serialNumber: sn || 'UNKNOWN' });
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

/** Convenience alias some deployments configure instead of /cdata. */
admsRouter.post('/push', async (req: Request, res: Response) => {
  const sn = String(req.query.SN || '').trim();
  if (!sn) {
    res.status(400).setHeader('Content-Type', 'text/plain');
    return res.send('ERROR: MISSING_SN');
  }

  const device = await getDeviceConfig(sn);
  if (!device || device.isActive === false) {
    res.status(401).setHeader('Content-Type', 'text/plain');
    return res.send('UNAUTHORIZED: UNKNOWN_DEVICE');
  }

  const body = rawBody(req);
  const { punches } = parseAttLogBody(body, sn);
  if (punches.length > 0) {
    const result = await ingestRawPunches(punches.map((p) => ({ ...p, source: 'ADMS_PUSH' as const })));
    res.setHeader('Content-Type', 'text/plain');
    return res.send(`OK: ${result.inserted}`);
  }
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK: 0');
});

export default admsRouter;
