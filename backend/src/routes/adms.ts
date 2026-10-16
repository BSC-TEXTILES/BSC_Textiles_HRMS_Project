/**
 * BSC Textiles HRMS - eSSL MB160 ADMS (Automatic Data Master Server) Cloud Push Protocol
 * 
 * Hardware Model: eSSL MB160 (Multi-Biometric Face & Fingerprint Time Attendance Terminal)
 * Direct Device-to-Cloud Integration without showroom computer gateways:
 * - GET /iclock/cdata: Device handshake, push parameters (Realtime=1, TransInterval=1, TimeZone=330)
 * - POST /iclock/cdata?table=ATTLOG / RTLOG: Real-time attendance log push
 * - POST /iclock/cdata?table=options: Hardware metadata & specifications registration
 * - GET /iclock/getrequest: Heartbeat polling & command retrieval
 * - POST /iclock/devicecmd: Command execution confirmation
 * - POST /iclock/registry: Terminal cloud registration
 */

import { Router, Request, Response } from 'express';
import {
  ingestRawPunches,
  recordDeviceHeartbeat,
  updateDeviceSpecs,
} from '../services/biometricService.js';
import { pool } from '../nativeDb.js';
import { socketIO } from '../socket.js';

export const admsRouter = Router();

/**
 * Parses ADMS tab-separated or space-separated attendance log lines from eSSL MB160
 * Standard eSSL format: <PIN>\t<YYYY-MM-DD HH:mm:ss>\t<Status>\t<VerifyMode>
 * e.g. "1\t2026-10-16 09:12:34\t0\t15" (15=Face, 1=Fingerprint, 2=Card, 0=Password)
 */
export function parseAttLogBody(bodyText: string, serialNumber: string) {
  const lines = bodyText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const punches: Array<{
    serialNumber: string;
    enrollmentNumber: string;
    punchTime: string;
    punchType?: string;
    verifyMode?: number;
  }> = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;

    let enrollmentNumber = '';
    let punchTime = '';
    let status = '0';
    let verifyMode = 15; // Default MB160 face verify

    if (line.includes('\t')) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        enrollmentNumber = parts[0].trim();
        punchTime = parts[1].trim();
        status = parts[2] ? parts[2].trim() : '0';
        verifyMode = parts[3] ? Number(parts[3].trim()) : 15;
      }
    } else {
      // Space or multi-space separated format fallback
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        enrollmentNumber = parts[0].trim();
        punchTime = `${parts[1]} ${parts[2]}`.trim();
        status = parts[3] ? parts[3].trim() : '0';
        verifyMode = parts[4] ? Number(parts[4].trim()) : 15;
      }
    }

    if (enrollmentNumber && punchTime) {
      // Status mapping: 0=CheckIn, 1=CheckOut, 2=BreakOut, 3=BreakIn, 4=OTIn, 5=OTOut
      let punchType = 'AUTO_PAIR';
      if (status === '0') punchType = 'CHECK_IN';
      else if (status === '1') punchType = 'CHECK_OUT';
      else if (status === '2') punchType = 'BREAK_OUT';
      else if (status === '3') punchType = 'BREAK_IN';
      else if (status === '4') punchType = 'CHECK_IN';
      else if (status === '5') punchType = 'CHECK_OUT';

      punches.push({
        serialNumber,
        enrollmentNumber,
        punchTime,
        punchType,
        verifyMode: isNaN(verifyMode) ? 15 : verifyMode,
      });
    }
  }

  return punches;
}

/**
 * Parses key-value specifications from ADMS table=options push
 */
function parseSpecsBody(bodyText: string): Record<string, string> {
  const specs: Record<string, string> = {};
  const lines = bodyText.split(/[\r\n&]+/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).replace(/^[~_]/, '').trim();
      const val = line.slice(eqIdx + 1).trim();
      specs[key] = val;
    }
  }

  return specs;
}

/**
 * GET /iclock/cdata & /api/devices/adms/cdata
 * eSSL MB160 terminal handshake & configuration response
 */
admsRouter.get(['/cdata', '/api/devices/adms/cdata'], async (req: Request, res: Response) => {
  const sn = (req.query.SN as string || '').trim();
  const pushver = (req.query.pushver as string || '2.4.1').trim();
  const options = (req.query.options as string || '').trim();

  console.log(`[ADMS Handshake] Terminal SN: ${sn || 'UNKNOWN'} (PushVer: ${pushver}, Opt: ${options})`);

  if (sn) {
    await recordDeviceHeartbeat(sn, req.ip);
    if (pushver) {
      await updateDeviceSpecs(sn, { pushVersion: pushver });
    }
  }

  // Response required by eSSL MB160 ADMS Cloud Push firmware:
  // - Realtime=1: Immediate event transmission upon employee face/finger verification (<1 sec)
  // - TransInterval=1: Transaction polling frequency (1s)
  // - TimeZone=330: Indian Standard Time (UTC+05:30)
  // - Delay=10: Reconnection retry delay
  res.setHeader('Content-Type', 'text/plain');
  res.send(
    `GET OPTION FROM: ${sn}\n` +
    `Stamp=9999\n` +
    `OpStamp=9999\n` +
    `ErrorDelay=60\n` +
    `Delay=10\n` +
    `TransTimes=00:00;14:00\n` +
    `TransInterval=1\n` +
    `TransFlag=1111000000\n` +
    `TimeZone=330\n` +
    `Realtime=1\n` +
    `Encrypt=0\n` +
    `ServerVersion=3.1.1\n` +
    `PushOptionsFlag=1\n`
  );
});

/**
 * POST /iclock/cdata & /api/devices/adms/cdata
 * Ingestion of biometric punches and hardware telemetry from terminal
 */
admsRouter.post(['/cdata', '/api/devices/adms/cdata'], async (req: Request, res: Response) => {
  const sn = (req.query.SN as string || '').trim();
  const table = (req.query.table as string || 'ATTLOG').toUpperCase();

  try {
    let rawBody = '';
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf-8');
    } else if (typeof req.body === 'object') {
      rawBody = JSON.stringify(req.body);
    }

    if ((table === 'ATTLOG' || table === 'RTLOG') && rawBody) {
      const punches = parseAttLogBody(rawBody, sn);
      if (punches.length > 0) {
        const result = await ingestRawPunches(punches);
        console.log(
          `[ADMS Push] Processed ${punches.length} punches from ${sn}: ` +
          `${result.processed} matched, ${result.duplicates} dups, ${result.unmapped} unmapped (avg latency: ${result.latencyMs}ms)`
        );
        res.setHeader('Content-Type', 'text/plain');
        return res.send(`OK: ${punches.length}`);
      }
    } else if (table === 'OPTIONS' && rawBody) {
      // Terminal specification registration (Firmware, UserCount, FaceCount, etc.)
      const specs = parseSpecsBody(rawBody);
      console.log(`[ADMS Options] Registering hardware telemetry from ${sn}:`, specs);
      await updateDeviceSpecs(sn, specs);
      res.setHeader('Content-Type', 'text/plain');
      return res.send('OK');
    }

    // Touch device heartbeat
    if (sn) {
      await recordDeviceHeartbeat(sn, req.ip);
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send('OK');
  } catch (error: any) {
    console.error(`[ADMS Push Error] SN: ${sn}:`, error.message);
    res.status(500).send('ERROR');
  }
});

/**
 * GET /iclock/getrequest & /api/devices/adms/getrequest
 * Command retrieval and continuous heartbeat monitoring loop
 */
admsRouter.get(['/getrequest', '/api/devices/adms/getrequest'], async (req: Request, res: Response) => {
  const sn = (req.query.SN as string || '').trim();
  if (sn) {
    await recordDeviceHeartbeat(sn, req.ip);
  }

  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

/**
 * POST /iclock/devicecmd & /api/devices/adms/devicecmd
 * Hardware command execution confirmation
 */
admsRouter.post(['/devicecmd', '/api/devices/adms/devicecmd'], async (req: Request, res: Response) => {
  const sn = (req.query.SN as string || '').trim();
  if (sn) {
    await recordDeviceHeartbeat(sn, req.ip);
  }
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

/**
 * POST /iclock/registry
 * Initial terminal discovery & cloud server registration handshake
 */
admsRouter.post(['/registry', '/api/devices/adms/registry'], async (req: Request, res: Response) => {
  const sn = (req.query.SN as string || '').trim();
  if (sn) {
    await recordDeviceHeartbeat(sn, req.ip);
  }

  res.setHeader('Content-Type', 'text/plain');
  res.send(
    `RegistryCode=1\n` +
    `ServerVersion=3.1.1\n` +
    `ServerName=BSC-HRMS-PUSH\n` +
    `PushVersion=2.4.1\n`
  );
});

/**
 * POST /iclock/push & /api/devices/adms/push
 * Fallback alias for direct punch payload POST
 */
admsRouter.post(['/push', '/api/devices/adms/push'], async (req: Request, res: Response) => {
  const sn = (req.query.SN as string || '').trim();
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const punches = parseAttLogBody(rawBody, sn);

  if (punches.length > 0) {
    const result = await ingestRawPunches(punches);
    res.setHeader('Content-Type', 'text/plain');
    return res.send(`OK: ${result.processed}`);
  }

  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

export default admsRouter;
