/**
 * Admin review surfaces for the biometric pipeline.
 *
 * Three things an operator needs when a terminal misbehaves:
 *   - Unmapped punches: every punch that could not be attributed, with the
 *     candidate list that made it ambiguous, and an assign action that re-runs
 *     the normal projection so the record lands in the right attendance row.
 *   - Calibration: the admin punches once per method at the device and this
 *     reads back the raw codes the terminal actually sent, so the verify-mode
 *     mapping is confirmed against this exact firmware instead of a table
 *     copied from the internet.
 *   - Verify-mode mapping: the code -> label table, editable.
 */

import { pool } from '../../nativeDb.js';
import { socketIO } from '../../socket.js';
import { deviceLog } from './logger.js';
import { ingestPunches, findExactCandidates, findSuffixCandidates } from './ingest.js';
import { loadVerifyModeMap, invalidateSettingsCache, getDeviceConfig } from './settings.js';
import { decoratePunchRow } from '../biometricService.js';
import { fromUtcMysqlString, formatWallString } from './timeCodec.js';
import { loadGlobalSettings } from './settings.js';
import type { MethodFamily } from './verifyMode.js';

export interface UnmappedPunchRow {
  id: string;
  serialNumber: string;
  deviceName: string | null;
  locationCode: string | null;
  enrollmentNumber: string;
  normalizedId: string | null;
  punchTimeUtc: string | null;
  punchTimeLocal: string | null;
  verifyModeLabel: string | null;
  rawVerifyType: number | null;
  mappingStatus: string;
  candidates: Array<{ employeeId: string; employeeCode: string | null; fullName: string | null }>;
  receivedAt: string | null;
  reason: string | null;
  photoUrl: string | null;
}

/**
 * `mappingCandidates` is a JSON column. mysql2 hands JSON back already parsed
 * when the driver can, and as text when it cannot, so both shapes must be
 * accepted or the review screen silently loses every candidate it should show.
 */
export function parseCandidateIds(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  if (typeof value === 'object') return [];
  const text = String(value).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Punches held for review, newest first, with their ambiguity candidates. */
export async function listUnmappedPunches(options: {
  locationCode?: string;
  serialNumber?: string;
  limit?: number;
}): Promise<UnmappedPunchRow[]> {
  const settings = await loadGlobalSettings();
  let query = `
    SELECT r.id, r.serialNumber, r.enrollmentNumber, r.normalizedId, r.punchTimeUtc,
           r.verifyModeLabel, r.rawVerifyType, r.mappingStatus, r.mappingCandidates,
           r.errorMessage, r.receivedAt, r.photoPath, r.rawTimezone,
           d.name as deviceName, d.locationCode
      FROM biometric_raw_punches r
      LEFT JOIN biometric_devices d ON r.deviceId = d.id
     WHERE r.mappingStatus IN ('UNMAPPED','AMBIGUOUS')`;
  const params: any[] = [];

  if (options.locationCode && options.locationCode !== 'ALL') {
    query += ' AND d.locationCode = ?';
    params.push(options.locationCode);
  }
  if (options.serialNumber) {
    query += ' AND r.serialNumber = ?';
    params.push(options.serialNumber);
  }
  query += ' ORDER BY r.receivedAt DESC LIMIT ?';
  params.push(Math.min(Math.max(Number(options.limit) || 100, 1), 500));

  const [rows]: any = await pool.query(query, params);

  // Resolve the ambiguity candidate ids once for the whole page, so the admin
  // sees "who it might be" instead of a list of opaque keys.
  const candidateIds = new Set<string>();
  const parsedCandidates = new Map<string, string[]>();
  for (const row of rows) {
    const ids = parseCandidateIds(row.mappingCandidates);
    parsedCandidates.set(row.id, ids);
    for (const id of ids) candidateIds.add(id);
  }

  let employeeById = new Map<string, { employeeCode: string | null; fullName: string | null }>();
  if (candidateIds.size > 0) {
    const [emps]: any = await pool.query(
      `SELECT id, employeeCode, fullName FROM employee WHERE id IN (${[...candidateIds].map(() => '?').join(',')})`,
      [...candidateIds]
    );
    employeeById = new Map(emps.map((e: any) => [e.id, { employeeCode: e.employeeCode ?? null, fullName: e.fullName ?? null }]));
  }

  return rows.map((row: any) => {
    const instant = fromUtcMysqlString(row.punchTimeUtc);
    const zone = row.rawTimezone || settings.defaultTimezone;
    const candidates = (parsedCandidates.get(row.id) || []).map((employeeId) => ({
      employeeId,
      employeeCode: employeeById.get(employeeId)?.employeeCode ?? null,
      fullName: employeeById.get(employeeId)?.fullName ?? null,
    }));

    return {
      id: row.id,
      serialNumber: row.serialNumber,
      deviceName: row.deviceName ?? null,
      locationCode: row.locationCode ?? null,
      enrollmentNumber: row.enrollmentNumber,
      normalizedId: row.normalizedId ?? null,
      punchTimeUtc: instant ? instant.toISOString() : null,
      punchTimeLocal: instant ? formatWallString(instant, zone, false) : null,
      verifyModeLabel: row.verifyModeLabel ?? null,
      rawVerifyType: row.rawVerifyType === null ? null : Number(row.rawVerifyType),
      mappingStatus: row.mappingStatus,
      candidates,
      reason: row.errorMessage ?? null,
      receivedAt: row.receivedAt ? new Date(row.receivedAt).toISOString() : null,
      photoUrl: row.photoPath ? `/${String(row.photoPath).replace(/^\/+/, '')}` : null,
    };
  });
}

/**
 * Attach an unmapped/ambiguous punch to an employee, then project it onto
 * attendance exactly as a live punch would have been.
 */
export async function assignUnmappedPunch(params: {
  rawPunchId: string;
  employeeId: string;
  actorId: string;
  createMapping?: boolean;
  showroomCode?: string;
}): Promise<{ ok: boolean; attendanceId: string | null; message: string }> {
  const [rows]: any = await pool.query(
    `SELECT id, serialNumber, enrollmentNumber, punchTimeUtc, rawTimezone, punchType,
            rawVerifyType, rawPunchState, workCode, matchValue, photoPath, mappingStatus
       FROM biometric_raw_punches WHERE id = ?`,
    [params.rawPunchId]
  );
  const punch = rows[0];
  if (!punch) return { ok: false, attendanceId: null, message: 'Punch not found' };

  const [empRows]: any = await pool.query('SELECT id, fullName, employeeCode FROM employee WHERE id = ?', [params.employeeId]);
  if (empRows.length === 0) return { ok: false, attendanceId: null, message: 'Employee not found' };

  if (params.createMapping) {
    const device = await getDeviceConfig(punch.serialNumber);
    const { deriveMappingKeys } = await import('./employeeIdentity.js');
    const keys = deriveMappingKeys(punch.enrollmentNumber);
    await pool.query(
      `INSERT INTO biometric_employee_mappings
         (id, employeeId, enrollmentNumber, normalizedEnrollment, lastSixDigits, serialNumber, showroomCode, status, effectiveDate, notes, mappingSource)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURDATE(), ?, 'MANUAL')
       ON DUPLICATE KEY UPDATE employeeId = VALUES(employeeId), status = 'ACTIVE', conflictCount = 0, updatedAt = NOW()`,
      [
        `map-${(params.showroomCode || device?.locationCode || 'HQ').toUpperCase()}-${keys.normalizedEnrollment}`,
        params.employeeId,
        punch.enrollmentNumber,
        keys.normalizedEnrollment,
        keys.lastSixDigits,
        punch.serialNumber,
        (params.showroomCode || device?.locationCode || 'HQ').toUpperCase(),
        `Assigned by ${params.actorId} from the unmapped-punch queue`,
      ]
    );
  }

  const instant = fromUtcMysqlString(punch.punchTimeUtc);
  if (!instant) return { ok: false, attendanceId: null, message: 'Stored punch has no usable timestamp' };

  // Re-ingest with the same key: the engine's ON DUPLICATE path means the
  // existing row is merged rather than duplicated, and the projection runs with
  // the mapping that now exists.
  const result = await ingestPunches([
    {
      serialNumber: punch.serialNumber,
      enrollmentNumber: punch.enrollmentNumber,
      punchTime: instant,
      verifyMode: punch.rawVerifyType,
      punchState: punch.rawPunchState,
      workCode: punch.workCode,
      matchValue: punch.matchValue,
      photoPath: punch.photoPath,
      source: 'MANUAL',
    },
  ]);

  const detail = result.details[0];
  if (detail?.status === 'REJECTED') {
    return { ok: false, attendanceId: null, message: `Re-ingest rejected: ${detail.reason}` };
  }

  const [updated]: any = await pool.query(
    `SELECT attendanceId FROM biometric_raw_punches WHERE id = ?`,
    [params.rawPunchId]
  );
  const attendanceId = updated[0]?.attendanceId ?? null;

  await pool.query(
    `UPDATE biometric_raw_punches SET assignedById = ?, assignedAt = NOW() WHERE id = ?`,
    [params.actorId, params.rawPunchId]
  ).catch(() => undefined);

  socketIO.emit('biometric:punch_assigned', {
    rawPunchId: params.rawPunchId,
    employeeId: params.employeeId,
    attendanceId,
    assignedBy: params.actorId,
    at: new Date().toISOString(),
  });

  deviceLog.info('Unmapped punch assigned', {
    enrollmentNumber: punch.enrollmentNumber,
    detail: `to ${empRows[0].employeeCode} (${empRows[0].fullName})`,
  });

  return {
    ok: true,
    attendanceId,
    message: `Punch from ${punch.enrollmentNumber} assigned to ${empRows[0].fullName}${attendanceId ? ' and folded into attendance' : ''}`,
  };
}

/** Re-run the whole held queue after a batch of mappings was added. */
export async function retryHeldPunches(limit = 200): Promise<{
  considered: number;
  mapped: number;
  stillUnmapped: number;
  ambiguous: number;
}> {
  const [rows]: any = await pool.query(
    `SELECT serialNumber, enrollmentNumber, punchTimeUtc, rawTimezone, rawVerifyType,
            rawPunchState, workCode, matchValue, photoPath
       FROM biometric_raw_punches
      WHERE mappingStatus IN ('UNMAPPED','AMBIGUOUS')
      ORDER BY punchTimeUtc ASC
      LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 200, 1), 1000)]
  );

  if (rows.length === 0) return { considered: 0, mapped: 0, stillUnmapped: 0, ambiguous: 0 };

  const result = await ingestPunches(
    rows.map((r: any) => ({
      serialNumber: r.serialNumber,
      enrollmentNumber: r.enrollmentNumber,
      punchTime: fromUtcMysqlString(r.punchTimeUtc) ?? r.punchTimeUtc,
      verifyMode: r.rawVerifyType,
      punchState: r.rawPunchState,
      workCode: r.workCode,
      matchValue: r.matchValue,
      photoPath: r.photoPath,
      source: 'MANUAL' as const,
    }))
  );

  return {
    considered: rows.length,
    // A replayed punch counts as a duplicate but is now mapped, so both are
    // reported: `mapped` reflects the merge outcome, `processed` new work.
    mapped: result.processed + result.duplicates,
    stillUnmapped: result.unmapped,
    ambiguous: result.ambiguous,
  };
}

// ─── Calibration ────────────────────────────────────────────────────────────

export interface CalibrationSession {
  id: string;
  deviceId: string | null;
  serialNumber: string | null;
  startedAt: string;
  endsAt: string;
  status: string;
  observations: Array<{
    rawVerifyType: number | null;
    rawPunchState: number | null;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
    currentLabel: string | null;
    sampleEnrollment: string | null;
    samplePhotoUrl: string | null;
  }>;
}

/**
 * Open a calibration window. Punches arriving while it is open are captured as
 * observations keyed by their raw codes so the admin can see exactly what this
 * firmware emits for face, finger and card.
 */
export async function startCalibration(params: {
  actorId: string;
  deviceId?: string;
  durationSeconds?: number;
}): Promise<{ id: string; endsAt: string; instructions: string }> {
  const durationSeconds = Math.min(Math.max(Number(params.durationSeconds) || 120, 15), 900);
  const device = params.deviceId ? await getDeviceConfig(params.deviceId) : null;
  const id = `cal-${Date.now().toString(36)}`;

  await pool.query(
    `INSERT INTO biometric_calibration_sessions (id, deviceId, serialNumber, startedById, endsAt, instructions)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?)`,
    [
      id,
      device?.id ?? null,
      device?.serialNumber ?? null,
      params.actorId,
      durationSeconds,
      'Punch once with Face, once with Fingerprint, once with Card, then close the session.',
    ]
  );

  const [rows]: any = await pool.query('SELECT endsAt FROM biometric_calibration_sessions WHERE id = ?', [id]);
  deviceLog.info('Calibration session opened', {
    serialNumber: device?.serialNumber ?? 'ALL',
    detail: `${durationSeconds}s window for ${params.actorId}`,
  });

  return {
    id,
    endsAt: new Date(rows[0].endsAt).toISOString(),
    instructions: 'At the terminal: punch once with your face, once with a fingerprint, once with a card. Keep at least a second between punches.',
  };
}

/**
 * Observations for a session = the distinct raw code pairs present in the punch
 * ledger inside that time window. Derived rather than copied, so it cannot
 * disagree with what was actually stored.
 */
export async function getCalibrationSession(id: string): Promise<CalibrationSession | null> {
  const [sessions]: any = await pool.query('SELECT * FROM biometric_calibration_sessions WHERE id = ?', [id]);
  const session = sessions[0];
  if (!session) return null;

  const [rows]: any = await pool.query(
    `SELECT rawVerifyType, rawPunchState,
            COUNT(*) AS count,
            MIN(punchTimeUtc) AS firstSeenUtc,
            MAX(punchTimeUtc) AS lastSeenUtc,
            MAX(verifyModeLabel) AS currentLabel,
            MAX(enrollmentNumber) AS sampleEnrollment,
            MAX(photoPath) AS samplePhotoPath,
            MAX(rawTimezone) AS sampleTimezone
       FROM biometric_raw_punches
      WHERE receivedAt >= ? AND receivedAt <= ?
        AND (? IS NULL OR serialNumber = ?)
      GROUP BY rawVerifyType, rawPunchState
      ORDER BY count DESC, lastSeenUtc DESC`,
    [session.startedAt, session.endsAt, session.serialNumber, session.serialNumber]
  );

  const settings = await loadGlobalSettings();
  const observations = rows.map((row: any) => {
    const firstSeen = fromUtcMysqlString(row.firstSeenUtc);
    const lastSeen = fromUtcMysqlString(row.lastSeenUtc);
    const zone = row.sampleTimezone || settings.defaultTimezone;
    return {
      rawVerifyType: row.rawVerifyType === null ? null : Number(row.rawVerifyType),
      rawPunchState: row.rawPunchState === null ? null : Number(row.rawPunchState),
      count: Number(row.count),
      firstSeenAt: firstSeen ? firstSeen.toISOString() : null,
      lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
      currentLabel: row.currentLabel ?? null,
      sampleEnrollment: row.sampleEnrollment ?? null,
      samplePhotoUrl: row.samplePhotoPath ? `/${String(row.samplePhotoPath).replace(/^\/+/, '')}` : null,
      localTimeExample: firstSeen ? formatWallString(firstSeen, zone, false) : null,
    };
  });

  const expired = session.status === 'OPEN' && new Date(session.endsAt) < new Date();

  return {
    id: session.id,
    deviceId: session.deviceId,
    serialNumber: session.serialNumber,
    startedAt: new Date(session.startedAt).toISOString(),
    endsAt: new Date(session.endsAt).toISOString(),
    status: expired ? 'EXPIRED' : session.status,
    observations,
  };
}

export async function closeCalibrationSession(id: string, actorId: string): Promise<CalibrationSession | null> {
  await pool.query(
    `UPDATE biometric_calibration_sessions SET status = 'CLOSED', closedAt = NOW() WHERE id = ?`,
    [id]
  );
  deviceLog.info('Calibration session closed', { detail: `by ${actorId}` });
  return getCalibrationSession(id);
}

/**
 * Apply an admin's confirmed label to a raw code. The code must have been
 * observed during the named session, so a mapping cannot be "confirmed" against
 * evidence the terminal never produced.
 */
export async function applyCalibrationMapping(params: {
  sessionId: string;
  rawVerifyType: number;
  confirmedLabel: string;
  methodFamily: MethodFamily;
  actorId: string;
}): Promise<void> {
  const session = await getCalibrationSession(params.sessionId);
  if (!session) throw new Error('Calibration session not found');
  const observed = session.observations.some(
    (o) => o.rawVerifyType === params.rawVerifyType
  );
  if (!observed) {
    throw new Error(
      `Code ${params.rawVerifyType} was not observed during this session — punch at the terminal first, then confirm.`
    );
  }

  await pool.query(
    `INSERT INTO verify_mode_mapping (id, rawCode, label, methodFamily, isStandard, confirmedByCalibration, notes)
     VALUES (?, ?, ?, ?, 0, 1, ?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       methodFamily = VALUES(methodFamily),
       confirmedByCalibration = 1,
       notes = VALUES(notes),
       updatedAt = NOW()`,
    [
      `vmm_${params.rawVerifyType}`,
      params.rawVerifyType,
      params.confirmedLabel,
      params.methodFamily,
      `Confirmed via calibration session ${params.sessionId} by ${params.actorId}`,
    ]
  );

  // Retro-correct rows already stored under this code, so the ledger matches the
  // confirmed meaning instead of keeping a stale "Unknown".
  const [updated]: any = await pool.query(
    `UPDATE biometric_raw_punches SET verifyModeLabel = ? WHERE rawVerifyType = ?`,
    [params.confirmedLabel, params.rawVerifyType]
  );

  invalidateSettingsCache();
  socketIO.emit('biometric:verify_mapping_changed', {
    rawCode: params.rawVerifyType,
    label: params.confirmedLabel,
    by: params.actorId,
    rowsCorrected: (updated as any)?.affectedRows ?? 0,
  });
}

// ─── Verify-mode mapping CRUD ───────────────────────────────────────────────

export async function listVerifyModeMapping(): Promise<Array<{
  rawCode: number;
  label: string;
  methodFamily: string;
  isStandard: boolean;
  confirmedByCalibration: boolean;
  notes: string | null;
  punchesSeen: number;
}>> {
  const rows = await loadVerifyModeMap(true);
  const [counts]: any = await pool.query(
    `SELECT rawVerifyType, COUNT(*) AS n FROM biometric_raw_punches
      WHERE rawVerifyType IS NOT NULL GROUP BY rawVerifyType`
  );
  const byCode = new Map(counts.map((c: any) => [Number(c.rawVerifyType), Number(c.n)]));

  // Show codes the device has actually sent that the table does not know about.
  const known = new Set(rows.map((r) => r.rawCode));
  const extra = counts
    .filter((c: any) => !known.has(Number(c.rawVerifyType)))
    .map((c: any) => ({
      rawCode: Number(c.rawVerifyType),
      label: 'Unknown',
      methodFamily: 'UNKNOWN',
      isStandard: false,
      confirmedByCalibration: false,
      notes: 'Observed from the device but not in the mapping table',
    }));

  return [...rows.map((r) => ({
    ...r,
    isStandard: true,
    confirmedByCalibration: false,
    notes: null,
    punchesSeen: byCode.get(r.rawCode) ?? 0,
  })), ...extra.map((e: any) => ({ ...e, punchesSeen: byCode.get(e.rawCode) ?? 0 }))];
}

export async function upsertVerifyModeMapping(params: {
  rawCode: number;
  label: string;
  methodFamily: MethodFamily;
  notes?: string;
}): Promise<void> {
  if (!Number.isInteger(params.rawCode) || params.rawCode < 0 || params.rawCode > 255) {
    throw new Error('rawCode must be an integer between 0 and 255');
  }
  if (!params.label.trim()) throw new Error('label is required');
  const allowed: MethodFamily[] = ['FACE', 'FINGERPRINT', 'CARD', 'PASSWORD', 'COMBINED', 'UNKNOWN'];
  if (!allowed.includes(params.methodFamily)) throw new Error(`methodFamily must be one of ${allowed.join(', ')}`);

  await pool.query(
    `INSERT INTO verify_mode_mapping (id, rawCode, label, methodFamily, isStandard, notes)
     VALUES (?, ?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE label = VALUES(label), methodFamily = VALUES(methodFamily), notes = VALUES(notes), updatedAt = NOW()`,
    [`vmm_${params.rawCode}`, params.rawCode, params.label.trim(), params.methodFamily, params.notes ?? null]
  );
  invalidateSettingsCache();
  socketIO.emit('biometric:verify_mapping_changed', { rawCode: params.rawCode, label: params.label });
}

export async function deleteVerifyModeMapping(rawCode: number): Promise<void> {
  await pool.query('DELETE FROM verify_mode_mapping WHERE rawCode = ?', [rawCode]);
  invalidateSettingsCache();
}

/** Rejected-punch ledger: what the terminal sent that could not be used. */
export async function listRejectedPunches(limit = 100): Promise<any[]> {
  const [rows]: any = await pool.query(
    `SELECT id, serialNumber, enrollmentNumber, rawDeviceTimeString, reason, detail, receivedAt, source
       FROM biometric_rejected_punches
      ORDER BY receivedAt DESC LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return rows;
}

export { decoratePunchRow };
