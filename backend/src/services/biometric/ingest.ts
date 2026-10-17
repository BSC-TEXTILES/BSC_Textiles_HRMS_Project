/**
 * Punch ingestion engine for the eSSL MB160 pipeline.
 *
 * One place turns whatever a terminal sent into (a) an immutable raw ledger row,
 * (b) a projection onto the daily `attendance` record, and (c) a live event for
 * the browser. Every path — ADMS push, ZK pull worker, edge connector, manual
 * ingest — comes through here so the rules cannot drift apart per transport.
 *
 * Guarantees this module is responsible for:
 *   - a punch is stored once and only once, enforced by the database unique key
 *     on (device serial, user id, punch instant) rather than read-then-write;
 *   - timestamps become absolute instants using the terminal's configured
 *     timezone, are stored as UTC, and the device's calendar day — not the UTC
 *     day — decides which attendance record a punch belongs to;
 *   - verify codes resolve through the editable mapping table, so an unknown
 *     code reports `Unknown` instead of a plausible-looking Card or Face;
 *   - an unmatchable or ambiguous employee id keeps the punch with
 *     mappingStatus set, so nothing is silently dropped;
 *   - impossible dates go to `biometric_rejected_punches` with a reason instead
 *     of corrupting attendance history.
 */

import crypto from 'node:crypto';
import { pool } from '../../nativeDb.js';
import { socketIO } from '../../socket.js';
import { deviceLog, classifyDeviceError } from './logger.js';
import {
  loadGlobalSettings,
  loadVerifyModeMap,
  getDeviceConfig,
  advanceWatermark,
  DeviceConfig,
} from './settings.js';
import {
  toSafePunchInstant,
  decodeZkPackedTime,
  wallTimeToInstant,
  deviceCalendarDate,
  formatWallString,
  toUtcMysqlString,
} from './timeCodec.js';
import { resolveVerifyMode, resolvePunchState, involvesFace, VerifyModeRow } from './verifyMode.js';
import { normalizeDeviceUserId, resolveEmployeeIdentity, IdentityCandidate, IdentityResolution, NormalizedDeviceId } from './employeeIdentity.js';
import { storePhotoForPunch } from './photos.js';
import { detectPunchMismatches } from './mismatch.js';

export type PunchSource = 'ADMS_PUSH' | 'ZK_PULL' | 'CONNECTOR' | 'MANUAL' | 'CALIBRATION';

export interface IngestPunchInput {
  serialNumber: string;
  enrollmentNumber: string;
  /** Device wall-clock string, an absolute instant, or a packed ZK 32-bit value. */
  punchTime: string | number | Date | null | undefined;
  verifyMode?: number | string | null;
  /** Raw attendance status/state byte, when the firmware sends one. */
  punchState?: number | string | null;
  punchType?: string | null;
  workCode?: string | number | null;
  matchValue?: number | string | null;
  photoBase64?: string | null;
  photoPath?: string | null;
  rawDeviceTimeString?: string | null;
  source?: PunchSource;
}

export interface LivePunchEvent {
  id: string;
  attendanceId: string | null;
  deviceId: string | null;
  deviceName: string;
  serialNumber: string;
  locationCode: string;
  locationId: string | null;
  enrollmentNumber: string;
  normalizedId: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  designation: string | null;
  photoUrl: string | null;
  /** Absolute instant, ISO 8601 UTC. */
  punchTimeUtc: string;
  /** The same instant expressed in the terminal's timezone. */
  punchTimeLocal: string;
  /** The calendar date the device believed it was. */
  attendanceDate: string;
  punchType: string;
  verifyMode: number | null;
  verifyMethod: string;
  methodFamily: string;
  rawVerifyType: number | null;
  rawPunchState: number | null;
  mappingStatus: string;
  source: string;
  receivedAt: string;
  latencyMs: number;
}

export interface IngestDetail {
  enrollmentNumber: string;
  status: 'PROCESSED' | 'UNMAPPED' | 'AMBIGUOUS' | 'DUPLICATE' | 'REJECTED';
  reason?: string;
  rawId?: string;
  employeeId?: string | null;
  verifyMethod?: string;
  punchTimeUtc?: string;
}

export interface IngestResult {
  received: number;
  inserted: number;
  processed: number;
  duplicates: number;
  /**
   * Replays that landed after an employee mapping was created — the punch was
   * already stored as UNMAPPED and is now attributed. Counted separately so a
   * retry run reports real progress instead of "0 inserted".
   */
  mappedOnReplay: number;
  unmapped: number;
  ambiguous: number;
  rejected: number;
  photosStored: number;
  latencyMs: number;
  newestPunchUtc: Date | null;
  events: LivePunchEvent[];
  details: IngestDetail[];
}

function dedupHash(serial: string, normalizedId: string, utcWall: string): string {
  return crypto.createHash('sha256').update(`${serial}|${normalizedId}|${utcWall}`).digest('hex');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Deterministic attendance row id for one employee on one device-calendar day.
 * Deterministic so two transports ingesting the same day converge on one row,
 * and derived from the whole employee id so two employees can never land on it.
 */
export function attendanceRowId(employeeId: string, attendanceDate: string): string {
  const digest = crypto.createHash('sha256').update(`${employeeId}|${attendanceDate}`).digest('hex').slice(0, 32);
  return `att-${digest}`;
}

/**
 * Candidates for the exact-full-id rule: an active mapping whose enrollment
 * number normalises to the same value, or an employee whose code or stored
 * device id does.
 */
export async function findExactCandidates(normalizedId: string): Promise<IdentityCandidate[]> {
  const [mappingRows]: any = await pool.query(
    `SELECT m.employeeId, m.enrollmentNumber AS deviceUserId, e.employeeCode, e.fullName
       FROM biometric_employee_mappings m
       JOIN employee e ON e.id = m.employeeId
      WHERE m.status IN ('ACTIVE','AMBIGUOUS')
        AND (m.normalizedEnrollment = ? OR TRIM(LEADING '0' FROM TRIM(m.enrollmentNumber)) = ?)
      LIMIT 20`,
    [normalizedId, normalizedId]
  );

  const [employeeRows]: any = await pool.query(
    `SELECT id AS employeeId, biometricDeviceEmployeeId AS deviceUserId, employeeCode, fullName
       FROM employee
      WHERE TRIM(LEADING '0' FROM TRIM(COALESCE(biometricDeviceEmployeeId, ''))) = ?
         OR TRIM(LEADING '0' FROM TRIM(employeeCode)) = ?
      LIMIT 20`,
    [normalizedId, normalizedId]
  );

  return [
    ...mappingRows.map((r: any) => ({ ...r, matchRule: 'EXACT_FULL' as const })),
    ...employeeRows.map((r: any) => ({ ...r, matchRule: 'EXACT_FULL' as const })),
  ];
}

/** Candidates for the last-six-digits fallback rule. */
export async function findSuffixCandidates(lastSix: string): Promise<IdentityCandidate[]> {
  const [mappingRows]: any = await pool.query(
    `SELECT m.employeeId, m.enrollmentNumber AS deviceUserId, e.employeeCode, e.fullName
       FROM biometric_employee_mappings m
       JOIN employee e ON e.id = m.employeeId
      WHERE m.status IN ('ACTIVE','AMBIGUOUS') AND m.lastSixDigits = ?
      LIMIT 20`,
    [lastSix]
  );

  const [employeeRows]: any = await pool.query(
    `SELECT id AS employeeId, biometricDeviceEmployeeId AS deviceUserId, employeeCode, fullName
       FROM employee
      WHERE RIGHT(CONCAT('000000', TRIM(LEADING '0' FROM TRIM(COALESCE(biometricDeviceEmployeeId, '')))), 6) = ?
         OR RIGHT(CONCAT('000000', TRIM(LEADING '0' FROM TRIM(employeeCode))), 6) = ?
      LIMIT 20`,
    [lastSix, lastSix]
  );

  const seen = new Set<string>();
  return [...mappingRows, ...employeeRows]
    .map((r: any) => ({ ...r, matchRule: 'SUFFIX_LAST6' as const }))
    .filter((r: any) => {
      if (seen.has(r.employeeId)) return false;
      seen.add(r.employeeId);
      return true;
    });
}

/** 'HH:MM:SS' or a TIME column -> that calendar day's instant in `timeZone`. */
function shiftInstantForDate(value: unknown, dateYmd: string, timeZone: string): Date | null {
  if (!value) return null;
  let hh = 0;
  let mm = 0;
  let ss = 0;
  if (value instanceof Date) {
    hh = value.getHours();
    mm = value.getMinutes();
    ss = value.getSeconds();
  } else {
    const parts = String(value).trim().split(':');
    hh = Number(parts[0]) || 0;
    mm = Number(parts[1]) || 0;
    ss = Number(parts[2]) || 0;
  }
  const [y, m, d] = dateYmd.split('-').map(Number);
  return wallTimeToInstant({ year: y, month: m, day: d, hour: hh, minute: mm, second: ss, ms: 0 }, timeZone);
}

/**
 * Project one punch onto the employee's daily attendance row.
 *
 * `attendanceDate` comes from the device's own calendar day; using the UTC day
 * is the defect that moved a 04:55 IST punch onto yesterday.
 */
async function projectOntoAttendance(params: {
  employeeId: string;
  device: DeviceConfig | null;
  timeZone: string;
  instant: Date;
  punchType: string;
  hadFace: boolean;
  matchValue: number | null;
  workCode: string | null;
}): Promise<{ attendanceId: string; punchType: string }> {
  const { employeeId, device, timeZone, instant, hadFace, matchValue } = params;
  const attendanceDate = deviceCalendarDate(instant, timeZone);

  // startTime/endTime are DATETIME columns holding only the clock part. Reading
  // them back as a JS Date would make the shift boundary depend on the MySQL
  // session timezone; TIME_FORMAT keeps it the wall time HR typed in.
  const [empRows]: any = await pool.query(
    `SELECT e.id, e.locationId, e.shiftId,
            TIME_FORMAT(s.startTime, '%H:%i:%s') AS startTime,
            TIME_FORMAT(s.endTime, '%H:%i:%s') AS endTime
       FROM employee e
       LEFT JOIN shift s ON e.shiftId = s.id
      WHERE e.id = ?`,
    [employeeId]
  );
  const emp = empRows[0] || {};
  const locationId = device?.locationId || emp.locationId || null;
  const shiftStart = shiftInstantForDate(emp.startTime, attendanceDate, timeZone);
  const shiftEnd = shiftInstantForDate(emp.endTime, attendanceDate, timeZone);
  const faceVerified = hadFace ? 1 : 0;

  const [existingRows]: any = await pool.query(
    `SELECT id, actualLogin, actualLogout FROM attendance
      WHERE employeeId = ? AND attendanceDate = ? LIMIT 1`,
    [employeeId, attendanceDate]
  );

  if (existingRows.length === 0) {
    // The id must be unique per employee *and* per day. Deriving it from a
    // prefix of the employee id collides as soon as two ids share their first
    // eight characters (every "emp-demo-100201", "emp-demo-100202", … shares
    // "emp-demo"), and a colliding primary key makes one employee's attendance
    // row absorb everyone else's punches.
    const attendanceId = attendanceRowId(employeeId, attendanceDate);
    const lateSeconds = shiftStart ? Math.max(0, Math.floor((instant.getTime() - shiftStart.getTime()) / 1000)) : 0;
    const earlySeconds = shiftStart ? Math.max(0, Math.floor((shiftStart.getTime() - instant.getTime()) / 1000)) : 0;
    const earlyIncentive = earlySeconds >= 900 ? 50 : 0;
    const latePenalty = lateSeconds > 900 ? Math.min(200, Math.floor(lateSeconds / 60)) : 0;

    await pool.query(
      `INSERT INTO attendance
         (id, employeeId, locationId, shiftId, attendanceDate,
          scheduledLogin, actualLogin, scheduledLogout,
          earlyLoginSeconds, lateLoginSeconds, lateLoginPenalty, earlyLoginIncentive,
          status, faceVerified, faceMatchPercentage, notes, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PRESENT', ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         actualLogin = LEAST(COALESCE(attendance.actualLogin, VALUES(actualLogin)), VALUES(actualLogin)),
         faceVerified = GREATEST(attendance.faceVerified, VALUES(faceVerified)),
         faceMatchPercentage = COALESCE(VALUES(faceMatchPercentage), attendance.faceMatchPercentage),
         updatedAt = NOW()`,
      [
        attendanceId,
        employeeId,
        locationId,
        emp.shiftId ?? null,
        attendanceDate,
        shiftStart,
        instant,
        shiftEnd,
        earlySeconds,
        lateSeconds,
        latePenalty,
        earlyIncentive,
        faceVerified,
        // Only ever the score the device reported. A made-up 98.5% here is what
        // made every punch look like a confident face match.
        matchValue,
        truncate(`MB160 CHECK_IN${params.workCode ? ` WC:${params.workCode}` : ''}`, 191),
      ]
    );
    return { attendanceId, punchType: 'CHECK_IN' };
  }

  const attendanceId = existingRows[0].id;
  const existingLogin: Date | null = existingRows[0].actualLogin ? new Date(existingRows[0].actualLogin) : null;
  const existingLogout: Date | null = existingRows[0].actualLogout ? new Date(existingRows[0].actualLogout) : null;

  let punchType = params.punchType;
  let actualLogin = existingLogin ?? instant;
  let actualLogout = existingLogout;

  if (punchType === 'AUTO_PAIR') {
    if (!existingLogin) {
      punchType = 'CHECK_IN';
    } else if (!existingLogout) {
      punchType = 'CHECK_OUT';
    } else {
      punchType = 'MIDDLE';
    }
  }

  if (punchType === 'CHECK_IN') {
    // Earliest check-in of the day wins; a later "in" must not overwrite it.
    actualLogin = existingLogin && existingLogin < instant ? existingLogin : instant;
  } else if (punchType === 'CHECK_OUT') {
    actualLogout = instant > (existingLogout ?? new Date(0)) ? instant : existingLogout;
  } else if (punchType === 'MIDDLE' && existingLogin && instant < existingLogin) {
    actualLogin = instant;
    punchType = 'CHECK_IN';
  }

  const totalSeconds = actualLogin && actualLogout
    ? Math.max(0, Math.floor((actualLogout.getTime() - actualLogin.getTime()) / 1000))
    : 0;
  // Existing HR rule: a 45-minute break is deducted once the shift passes 5h.
  const breakSeconds = totalSeconds >= 18000 ? 2700 : 0;
  const effectiveSeconds = Math.max(0, totalSeconds - breakSeconds);
  const overtimeSeconds = shiftEnd && actualLogout && actualLogout > shiftEnd
    ? Math.floor((actualLogout.getTime() - shiftEnd.getTime()) / 1000)
    : 0;
  const lateSeconds = shiftStart ? Math.max(0, Math.floor((actualLogin.getTime() - shiftStart.getTime()) / 1000)) : 0;

  await pool.query(
    `UPDATE attendance
        SET actualLogin = ?,
            actualLogout = COALESCE(?, actualLogout),
            totalWorkingSeconds = ?,
            breakSeconds = ?,
            effectiveWorkingSeconds = ?,
            overtimeSeconds = ?,
            lateLoginSeconds = ?,
            status = 'PRESENT',
            faceVerified = GREATEST(faceVerified, ?),
            faceMatchPercentage = COALESCE(?, faceMatchPercentage),
            updatedAt = NOW()
      WHERE id = ?`,
    [actualLogin, actualLogout, totalSeconds, breakSeconds, effectiveSeconds, overtimeSeconds, lateSeconds, faceVerified, matchValue, attendanceId]
  );

  return { attendanceId, punchType };
}

/**
 * Ingest a batch of punches. An individual bad record never aborts the batch —
 * one corrupt punch must not stall a device's whole backlog.
 */
export async function ingestPunches(
  punches: IngestPunchInput[],
  options: { operatorId?: string } = {}
): Promise<IngestResult> {
  const started = Date.now();
  const settings = await loadGlobalSettings();
  const modeRows: VerifyModeRow[] = await loadVerifyModeMap();

  const result: IngestResult = {
    received: punches.length,
    inserted: 0,
    processed: 0,
    duplicates: 0,
    mappedOnReplay: 0,
    unmapped: 0,
    ambiguous: 0,
    rejected: 0,
    photosStored: 0,
    latencyMs: 0,
    newestPunchUtc: null,
    events: [],
    details: [],
  };

  // Registry rows are read once per batch, keyed by the serial the payload used.
  const deviceCache = new Map<string, DeviceConfig | null>();
  const getDevice = async (serial: string): Promise<DeviceConfig | null> => {
    const key = (serial || '').trim();
    if (deviceCache.has(key)) return deviceCache.get(key)!;
    const device = key ? await getDeviceConfig(key) : null;
    deviceCache.set(key, device);
    return device;
  };

  for (const punch of punches) {
    const serial = (punch.serialNumber || '').trim();
    const source: PunchSource = punch.source || 'ADMS_PUSH';
    const identity: NormalizedDeviceId = normalizeDeviceUserId(punch.enrollmentNumber);

    try {
      const device = await getDevice(serial);
      const timeZone = device?.timezone || settings.defaultTimezone;

      // ── 1. Device wall clock -> absolute UTC instant ──────────────────────
      const vetting = {
        timeZone,
        minValidYear: settings.minValidPunchYear,
        futureSkewSeconds: settings.futureSkewSeconds,
      };

      let timeResult;
      if (typeof punch.punchTime === 'number') {
        const wall = decodeZkPackedTime(punch.punchTime);
        const packed = `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')} ` +
          `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}:${String(wall.second).padStart(2, '0')}`;
        timeResult = toSafePunchInstant(packed, vetting);
      } else {
        timeResult = toSafePunchInstant(punch.punchTime, vetting);
      }

      if (!timeResult.ok || !timeResult.instant) {
        result.rejected++;
        const reason = timeResult.rejection === 'FUTURE_DATED'
          ? 'FUTURE_DATED' as const
          : timeResult.rejection === 'IMPOSSIBLE_DATE' ? 'IMPOSSIBLE_DATE' as const : 'UNPARSEABLE' as const;
        result.details.push({ enrollmentNumber: identity.raw, status: 'REJECTED', reason: `${timeResult.rejection}: ${timeResult.detail || ''}`.trim() });
        await recordRejected({
          serial,
          enrollmentNumber: identity.raw,
          rawDeviceTimeString: String(punch.punchTime ?? ''),
          reason,
          detail: timeResult.detail,
          source,
        });
        deviceLog.warn('Rejected punch with unusable timestamp', {
          serialNumber: serial,
          enrollmentNumber: identity.raw,
          code: 'DEVICE_TIME_DRIFT',
          detail: timeResult.detail,
        });
        continue;
      }

      const instant = timeResult.instant;
      const utcWall = toUtcMysqlString(instant);
      const localWall = formatWallString(instant, timeZone, true);
      const rawDeviceTimeString = punch.rawDeviceTimeString
        ?? (typeof punch.punchTime === 'string' ? punch.punchTime : localWall);

      // ── 2. Verify method + punch state, from the raw codes ────────────────
      const verify = resolveVerifyMode(punch.verifyMode, modeRows);
      const state = resolvePunchState(punch.punchState);
      // The raw state byte is authoritative; a transport hint is only a
      // fallback, and neither is present means the pairing engine decides.
      const punchType = state.known ? state.punchType : (punch.punchType || 'AUTO_PAIR');

      // ── 3. Employee resolution ────────────────────────────────────────────
      let resolution: IdentityResolution;
      if (!identity.normalized) {
        resolution = {
          status: 'UNMAPPED',
          employeeId: null,
          candidates: [],
          rule: 'NONE',
          normalized: identity,
          reason: 'Device sent an empty user id',
        };
      } else {
        const exact = await findExactCandidates(identity.normalized);
        resolution = resolveEmployeeIdentity(identity.normalized, exact, []);
        if (resolution.status === 'UNMAPPED') {
          const suffix = await findSuffixCandidates(identity.lastSix);
          resolution = resolveEmployeeIdentity(identity.normalized, exact, suffix);
        }
      }

      // ── 4. Photo, before the ledger row so the path can be stored with it ─
      let storedPhotoPath: string | null = punch.photoPath ?? null;
      if (punch.photoBase64) {
        storedPhotoPath = await storePhotoForPunch({
          base64: punch.photoBase64,
          serial,
          enrollmentNumber: identity.normalized,
          instant,
          uploadRoot: settings.uploadRoot,
          maxBytes: settings.maxPhotoBytes,
        }) ?? storedPhotoPath;
        if (storedPhotoPath && storedPhotoPath !== punch.photoPath) result.photosStored++;
      }

      const matchValue = punch.matchValue === null || punch.matchValue === undefined || punch.matchValue === ''
        ? null
        : Number(punch.matchValue);
      const safeMatchValue = matchValue !== null && Number.isFinite(matchValue) ? matchValue : null;
      const workCode = punch.workCode === null || punch.workCode === undefined ? null : String(punch.workCode).slice(0, 32);

      // ── 5. Insert the immutable ledger row; the DB enforces idempotency ───
      const hash = dedupHash(serial, identity.normalized, utcWall);
      const rawId = `raw-${hash.slice(0, 24)}`;
      const mappingStatus = resolution.status;
      const syncStatus = mappingStatus === 'MAPPED' ? 'QUEUED' : 'UNMAPPED';

      // A plain INSERT, with the unique key as the deduplication authority:
      // `affectedRows` from an `ON DUPLICATE KEY UPDATE id = id` is not a
      // reliable replay signal on MySQL 8 (it reports 1), and a pre-check races
      // the second instance of the worker. ER_DUP_ENTRY is unambiguous.
      let insertOutcome: 'inserted' | 'duplicate';
      try {
        await pool.query(
          `INSERT INTO biometric_raw_punches
             (id, deviceId, employeeId, serialNumber, enrollmentNumber, normalizedId,
              punchTime, punchTimeUtc, rawDeviceTimeString, rawTimezone,
              punchType, verifyMode, rawVerifyType, rawPunchState, verifyModeLabel,
              workCode, matchValue, photoPath, receivedAt, syncStatus, isProcessed,
              mappingStatus, mappingCandidates, dedupHash, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 0, ?, ?, ?, ?)`,
          [
            rawId,
            device?.id ?? null,
            resolution.employeeId,
            serial,
            identity.raw,
            identity.normalized,
            instant,
            utcWall,
            rawDeviceTimeString.slice(0, 32),
            timeZone,
            punchType,
            verify.rawCode,
            verify.rawCode,
            state.code,
            verify.label,
            workCode,
            safeMatchValue,
            storedPhotoPath,
            syncStatus,
            mappingStatus,
            resolution.candidates.length > 1 ? JSON.stringify(resolution.candidates.map((c) => c.employeeId)) : null,
            hash,
            source,
          ]
        );
        insertOutcome = 'inserted';
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') {
          insertOutcome = 'duplicate';
        } else {
          throw err;
        }
      }

      if (insertOutcome === 'duplicate') {
        result.duplicates++;
        const outcome = await handleDuplicatePunch({
          rawId,
          device,
          serial,
          identity,
          instant,
          timeZone,
          resolution,
          verify,
          stateCode: state.code,
          punchType,
          storedPhotoPath,
          safeMatchValue,
          workCode,
          started,
        });
        result.mappedOnReplay += outcome.mappedNow;
        if (outcome.event) {
          result.events.push(outcome.event);
          broadcastPunch(outcome.event);
        }
        result.details.push({
          enrollmentNumber: identity.raw,
          status: outcome.mappedNow ? 'PROCESSED' : 'DUPLICATE',
          rawId,
          employeeId: resolution.employeeId,
          verifyMethod: verify.known ? verify.label : undefined,
          punchTimeUtc: instant.toISOString(),
        });
        continue;
      }

      result.inserted++;
      if (!result.newestPunchUtc || instant > result.newestPunchUtc) result.newestPunchUtc = instant;

      // Mismatch detection runs inline so the ops queue and the live badges
      // reflect a punch the moment it is stored — not on the next sweep.
      await detectPunchMismatches({
        punchId: rawId,
        serialNumber: serial,
        enrollmentNumber: identity.raw,
        normalizedId: identity.normalized,
        mappingStatus,
        employeeId: resolution.employeeId,
        punchTimeUtc: instant,
        candidates: resolution.candidates,
      });

      // ── 6. Branch on the mapping outcome ──────────────────────────────────
      if (mappingStatus === 'AMBIGUOUS') {
        result.ambiguous++;
        await pool.query(
          `UPDATE biometric_raw_punches SET syncStatus = 'UNMAPPED', errorMessage = ? WHERE id = ?`,
          [truncate(resolution.reason || 'Multiple employees match this device id', 500), rawId]
        );
        emitUnmapped({ rawId, serial, device, identity, localWall, utcWall, verifyLabel: verify.label, mappingStatus, candidates: resolution.candidates });
        result.details.push({
          enrollmentNumber: identity.raw,
          status: 'AMBIGUOUS',
          reason: resolution.reason,
          rawId,
          verifyMethod: verify.label,
          punchTimeUtc: instant.toISOString(),
        });
        deviceLog.warn('Ambiguous device id — not guessing an employee', {
          serialNumber: serial,
          enrollmentNumber: identity.raw,
          detail: resolution.reason,
        });
        continue;
      }

      if (mappingStatus === 'UNMAPPED' || !resolution.employeeId) {
        result.unmapped++;
        await pool.query(
          `UPDATE biometric_raw_punches SET syncStatus = 'UNMAPPED', errorMessage = ? WHERE id = ?`,
          [truncate(resolution.reason || 'No active employee mapped to this device id', 500), rawId]
        );
        emitUnmapped({ rawId, serial, device, identity, localWall, utcWall, verifyLabel: verify.label, mappingStatus, candidates: [] });
        result.details.push({
          enrollmentNumber: identity.raw,
          status: 'UNMAPPED',
          reason: resolution.reason,
          rawId,
          verifyMethod: verify.label,
          punchTimeUtc: instant.toISOString(),
        });
        deviceLog.info('Punch kept for review: no employee mapping', { serialNumber: serial, enrollmentNumber: identity.raw });
        continue;
      }

      // ── 7. Project onto attendance ────────────────────────────────────────
      const projection = await projectOntoAttendance({
        employeeId: resolution.employeeId,
        device,
        timeZone,
        instant,
        punchType,
        hadFace: involvesFace(verify),
        matchValue: safeMatchValue,
        workCode,
      });

      await pool.query(
        `UPDATE biometric_raw_punches
            SET syncStatus = 'PROCESSED', isProcessed = 1, processedAt = NOW(),
                attendanceId = ?, punchType = ?, employeeId = ?
          WHERE id = ?`,
        [projection.attendanceId, projection.punchType, resolution.employeeId, rawId]
      );

      // ── 8. Live event ─────────────────────────────────────────────────────
      const event = await buildLiveEvent({
        rawId,
        attendanceId: projection.attendanceId,
        device,
        serial,
        identity,
        employeeId: resolution.employeeId,
        instant,
        timeZone,
        punchType: projection.punchType,
        verify,
        stateCode: state.code,
        photoPath: storedPhotoPath,
        source,
        receivedAtMs: started,
      });
      result.events.push(event);
      broadcastPunch(event);
      result.processed++;
      result.details.push({
        enrollmentNumber: identity.raw,
        status: 'PROCESSED',
        rawId,
        employeeId: event.employeeId,
        verifyMethod: event.verifyMethod,
        punchTimeUtc: event.punchTimeUtc,
      });

      if (device?.id) await advanceWatermark(device.id, serial, instant);

      deviceLog.info('Punch ingested', {
        serialNumber: serial,
        enrollmentNumber: identity.raw,
        latencyMs: Math.max(1, Date.now() - instant.getTime()),
        detail: `${verify.label} / ${projection.punchType}`,
      });
    } catch (err: any) {
      const classified = classifyDeviceError(err);
      result.rejected++;
      result.details.push({ enrollmentNumber: identity.raw, status: 'REJECTED', reason: classified.message });
      deviceLog.error('Failed to ingest punch', {
        serialNumber: serial,
        enrollmentNumber: identity.raw,
        code: 'DB_FAILURE',
        detail: `${err?.sqlMessage || err?.message}`,
        stack: err?.stack,
      });
    }
  }

  result.latencyMs = Date.now() - started;

  // Registry bookkeeping, once per batch per device.
  for (const [serial, device] of deviceCache) {
    if (!device) continue;
    const nowIso = new Date().toISOString();
    await pool.query(
      `UPDATE biometric_devices
          SET status = 'CONNECTED', lastConnectionAt = NOW(), lastHeartbeatAt = NOW(),
              lastSeenAt = NOW(), lastSyncAt = NOW(), lastError = NULL,
              consecutiveFailures = 0, nextRetryAt = NULL
        WHERE id = ?`,
      [device.id]
    ).catch((err) => deviceLog.warn('Could not update device registry', {
      serialNumber: serial, code: 'DB_FAILURE', detail: err.message,
    }));
    socketIO.emit('device:heartbeat', {
      deviceId: device.id,
      serialNumber: device.serialNumber,
      name: device.name,
      locationCode: device.locationCode,
      status: 'CONNECTED',
      lastHeartbeatAt: nowIso,
      lastSeenAt: nowIso,
    });
  }

  return result;
}

async function buildLiveEvent(input: {
  rawId: string;
  attendanceId: string;
  device: DeviceConfig | null;
  serial: string;
  identity: NormalizedDeviceId;
  employeeId: string;
  instant: Date;
  timeZone: string;
  punchType: string;
  verify: ReturnType<typeof resolveVerifyMode>;
  stateCode: number | null;
  photoPath: string | null;
  source: PunchSource;
  receivedAtMs: number;
}): Promise<LivePunchEvent> {
  const [empRows]: any = await pool.query(
    'SELECT id, employeeCode, fullName, designation, locationId FROM employee WHERE id = ?',
    [input.employeeId]
  );
  const emp = empRows[0] || {};

  return {
    id: input.rawId,
    attendanceId: input.attendanceId,
    deviceId: input.device?.id ?? null,
    deviceName: input.device?.name || 'Unregistered terminal',
    serialNumber: input.serial,
    locationCode: input.device?.locationCode || 'ALL',
    locationId: input.device?.locationId || emp.locationId || null,
    enrollmentNumber: input.identity.raw,
    normalizedId: input.identity.normalized,
    employeeId: emp.id ?? null,
    employeeCode: emp.employeeCode ?? null,
    employeeName: emp.fullName ?? null,
    designation: emp.designation ?? null,
    photoUrl: input.photoPath ? `/${input.photoPath.replace(/^\/+/, '')}` : null,
    punchTimeUtc: input.instant.toISOString(),
    punchTimeLocal: formatWallString(input.instant, input.timeZone, false),
    attendanceDate: deviceCalendarDate(input.instant, input.timeZone),
    punchType: input.punchType,
    verifyMode: input.verify.rawCode,
    verifyMethod: input.verify.label,
    methodFamily: input.verify.methodFamily,
    rawVerifyType: input.verify.rawCode,
    rawPunchState: input.stateCode,
    mappingStatus: 'MAPPED',
    source: input.source,
    receivedAt: new Date().toISOString(),
    latencyMs: Math.max(1, Date.now() - input.receivedAtMs),
  };
}

/**
 * One event name per payload. `attendance:punch` carried the identical object
 * and had no listeners anywhere in the frontend — it only doubled the traffic
 * on every socket connection and gave the next developer two names to choose
 * between for the same fact.
 */
function broadcastPunch(event: LivePunchEvent): void {
  socketIO.emit('biometric:punch', event);
}

function emitUnmapped(input: {
  rawId: string;
  serial: string;
  device: DeviceConfig | null;
  identity: NormalizedDeviceId;
  localWall: string;
  utcWall: string;
  verifyLabel: string;
  mappingStatus: string;
  candidates: IdentityCandidate[];
}): void {
  socketIO.emit('biometric:unmapped_punch', {
    id: input.rawId,
    deviceId: input.device?.id ?? null,
    serialNumber: input.serial,
    deviceName: input.device?.name || 'Unregistered terminal',
    locationCode: input.device?.locationCode || 'ALL',
    enrollmentNumber: input.identity.raw,
    normalizedId: input.identity.normalized,
    punchTimeLocal: input.localWall,
    punchTimeUtc: input.utcWall,
    verifyMethod: input.verifyLabel,
    mappingStatus: input.mappingStatus,
    candidates: input.candidates.map((c) => ({ employeeId: c.employeeId, employeeCode: c.employeeCode, fullName: c.fullName })),
    receivedAt: new Date().toISOString(),
  });
}

/**
 * A punch the unique key already holds. Three things can still need doing:
 *   - merge data that arrived separately (an ATTPHOTO snapshot, a verify code
 *     that came on the log line instead of the photo line);
 *   - attribute it, when it was previously stored as UNMAPPED/AMBIGUOUS and an
 *     employee mapping now exists — this is exactly how the "assign unmapped
 *     punch" and retry-held flows complete;
 *   - re-broadcast it, so the live feed shows the snapshot.
 * A replay never overwrites a value that is already there.
 */
async function handleDuplicatePunch(input: {
  rawId: string;
  device: DeviceConfig | null;
  serial: string;
  identity: NormalizedDeviceId;
  instant: Date;
  timeZone: string;
  resolution: IdentityResolution;
  verify: ReturnType<typeof resolveVerifyMode>;
  stateCode: number | null;
  punchType: string;
  storedPhotoPath: string | null;
  safeMatchValue: number | null;
  workCode: string | null;
  started: number;
}): Promise<{ mappedNow: number; event: LivePunchEvent | null }> {
  const [rows]: any = await pool.query(
    `SELECT id, employeeId, attendanceId, syncStatus, mappingStatus, photoPath, verifyMode, punchType
       FROM biometric_raw_punches WHERE id = ?`,
    [input.rawId]
  );
  const existing = rows[0];
  if (!existing) return { mappedNow: 0, event: null };

  await mergeOntoExistingPunch(input.rawId, {
    photoPath: input.storedPhotoPath,
    verifyCode: input.verify.rawCode,
    verifyLabel: input.verify.label,
    punchState: input.stateCode,
    matchValue: input.safeMatchValue,
    deviceId: input.device?.id ?? null,
  });

  const needsAttribution = !existing.employeeId && Boolean(input.resolution.employeeId);
  if (!needsAttribution) {
    if (input.storedPhotoPath && existing.employeeId) {
      // Keep the stored punch type: a snapshot carries no state byte, and
      // letting it default to AUTO_PAIR would rewrite a CHECK_IN as unknown in
      // the live feed.
      const event = await buildLiveEvent({
        rawId: input.rawId,
        attendanceId: existing.attendanceId || '',
        device: input.device,
        serial: input.serial,
        identity: input.identity,
        employeeId: existing.employeeId,
        instant: input.instant,
        timeZone: input.timeZone,
        punchType: existing.punchType || input.punchType,
        verify: existing.verifyMode === null ? input.verify : resolveVerifyMode(existing.verifyMode, await loadVerifyModeMap()),
        stateCode: input.stateCode,
        photoPath: input.storedPhotoPath,
        source: 'ADMS_PUSH',
        receivedAtMs: input.started,
      });
      return { mappedNow: 0, event };
    }
    return { mappedNow: 0, event: null };
  }

  const projection = await projectOntoAttendance({
    employeeId: input.resolution.employeeId!,
    device: input.device,
    timeZone: input.timeZone,
    instant: input.instant,
    punchType: input.punchType,
    hadFace: involvesFace(input.verify),
    matchValue: input.safeMatchValue,
    workCode: input.workCode,
  });

  await pool.query(
    `UPDATE biometric_raw_punches
        SET employeeId = ?, attendanceId = ?, punchType = ?, syncStatus = 'PROCESSED',
            isProcessed = 1, processedAt = NOW(), mappingStatus = 'MAPPED', errorMessage = NULL
      WHERE id = ?`,
    [input.resolution.employeeId, projection.attendanceId, projection.punchType, input.rawId]
  );

  deviceLog.info('Held punch attributed on replay', {
    serialNumber: input.serial,
    enrollmentNumber: input.identity.raw,
    detail: `now mapped to ${input.resolution.employeeId}`,
  });

  // A punch that just became attributable can itself evidence device/name
  // conflicts, so it goes through the same detector as a live punch.
  await detectPunchMismatches({
    punchId: input.rawId,
    serialNumber: input.serial,
    enrollmentNumber: input.identity.raw,
    normalizedId: input.identity.normalized,
    mappingStatus: 'MAPPED',
    employeeId: input.resolution.employeeId,
    punchTimeUtc: input.instant,
  });

  const event = await buildLiveEvent({
    rawId: input.rawId,
    attendanceId: projection.attendanceId,
    device: input.device,
    serial: input.serial,
    identity: input.identity,
    employeeId: input.resolution.employeeId!,
    instant: input.instant,
    timeZone: input.timeZone,
    punchType: projection.punchType,
    verify: input.verify,
    stateCode: input.stateCode,
    photoPath: input.storedPhotoPath ?? existing.photoPath ?? null,
    source: 'MANUAL',
    receivedAtMs: input.started,
  });

  return { mappedNow: 1, event };
}

/**
 * Fill in only what the stored punch is still missing. A duplicate never
 * overwrites an existing value, so re-delivery cannot change history.
 */
async function mergeOntoExistingPunch(
  rawId: string,
  patch: {
    photoPath: string | null;
    verifyCode: number | null;
    verifyLabel: string;
    punchState: number | null;
    matchValue: number | null;
    deviceId: string | null;
  }
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];

  if (patch.photoPath) { sets.push('photoPath = COALESCE(photoPath, ?)'); params.push(patch.photoPath); }
  if (patch.verifyCode !== null) {
    sets.push('verifyMode = COALESCE(verifyMode, ?)', 'rawVerifyType = COALESCE(rawVerifyType, ?)');
    sets.push('verifyModeLabel = IF(verifyMode IS NULL, ?, verifyModeLabel)');
    params.push(patch.verifyCode, patch.verifyCode, patch.verifyLabel);
  }
  if (patch.punchState !== null) { sets.push('rawPunchState = COALESCE(rawPunchState, ?)'); params.push(patch.punchState); }
  if (patch.matchValue !== null) { sets.push('matchValue = COALESCE(matchValue, ?)'); params.push(patch.matchValue); }
  if (patch.deviceId) { sets.push('deviceId = COALESCE(deviceId, ?)'); params.push(patch.deviceId); }

  if (sets.length === 0) return;
  params.push(rawId);
  await pool.query(`UPDATE biometric_raw_punches SET ${sets.join(', ')} WHERE id = ?`, params)
    .catch((err: any) => deviceLog.warn('Could not merge a repeated punch', { code: 'DB_FAILURE', detail: err?.sqlMessage || err.message }));
}

async function recordRejected(input: {
  serial: string;
  enrollmentNumber: string;
  rawDeviceTimeString: string;
  reason: 'IMPOSSIBLE_DATE' | 'FUTURE_DATED' | 'UNPARSEABLE' | 'MISSING_USER_ID' | 'DUPLICATE_WINDOW' | 'PHOTO_REJECTED';
  detail?: string;
  source: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO biometric_rejected_punches
         (id, serialNumber, enrollmentNumber, rawDeviceTimeString, reason, detail, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `rej-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        input.serial,
        input.enrollmentNumber,
        input.rawDeviceTimeString.slice(0, 64),
        input.reason,
        input.detail ?? null,
        input.source,
      ]
    );
  } catch (err: any) {
    deviceLog.warn('Could not record a rejected punch', { code: 'DB_FAILURE', detail: err?.sqlMessage || err.message });
  }
}

/** Convenience for the calibration tool: describe one incoming record. */
export function describeIncoming(punch: IngestPunchInput, modeRows: VerifyModeRow[]) {
  return {
    verify: resolveVerifyMode(punch.verifyMode, modeRows),
    state: resolvePunchState(punch.punchState),
  };
}
