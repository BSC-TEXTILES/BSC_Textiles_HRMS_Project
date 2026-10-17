/**
 * Resolve / edit actions for the biometric mismatch queue.
 *
 * The detection engine (`mismatch.ts`) only *reports*; this module changes
 * masters. Eight actions are supported, all dry-runnable so the drawer can show
 * a before/after preview before HR commits:
 *
 *   RELINK / EDIT_EMPLOYEE   point the biometric id at the right employee;
 *   EDIT_BIOMETRIC_ID        correct the id (and optionally retire the old
 *                            mapping that caused a duplicate);
 *   REASSIGN_DEVICE          move the employee's assigned terminal and/or the
 *                            device/employee floor+section pairing;
 *   RESYNC_TO_DEVICE         queue a USERINFO write so the terminal gets the
 *                            corrected employee data;
 *   RESYNC_FROM_DEVICE       queue a USERINFO/ATTLOG query so the terminal
 *                            reports its current list;
 *   RESOLVE / IGNORE         close the record without changing data.
 *
 * Every committed action writes to the hash-chained audit log and re-projects
 * the held punches of the affected biometric id onto attendance through the one
 * existing ingest path (`assignUnmappedPunch`), so past attendance is remapped
 * exactly like a live punch would have been.
 */

import crypto from 'node:crypto';
import { pool } from '../../nativeDb.js';
import { AuditService } from '../auditService.js';
import { deviceLog } from './logger.js';
import { normalizeDeviceUserId } from './employeeIdentity.js';
import { assignUnmappedPunch } from './review.js';
import { queueDeviceCommand, saveEmployeeBiometricMapping } from '../biometricService.js';
import { getMismatchRecord, markMismatchDecided, MismatchRecordRow } from './mismatch.js';
import { resolveLocationAlias } from '../locationRegistry.js';

export type MismatchResolveAction =
  | 'RELINK'
  | 'EDIT_EMPLOYEE'
  | 'EDIT_BIOMETRIC_ID'
  | 'REASSIGN_DEVICE'
  | 'RESYNC_TO_DEVICE'
  | 'RESYNC_FROM_DEVICE'
  | 'RESOLVE'
  | 'IGNORE';

export const MISMATCH_RESOLVE_ACTIONS: MismatchResolveAction[] = [
  'RELINK',
  'EDIT_EMPLOYEE',
  'EDIT_BIOMETRIC_ID',
  'REASSIGN_DEVICE',
  'RESYNC_TO_DEVICE',
  'RESYNC_FROM_DEVICE',
  'RESOLVE',
  'IGNORE',
];

export interface MismatchResolveParams {
  mismatchId: string;
  action: MismatchResolveAction;
  actorId: string;
  remark?: string | null;
  dryRun?: boolean;
  /** Target employee for RELINK / EDIT_EMPLOYEE / EDIT_BIOMETRIC_ID. */
  employeeId?: string | null;
  /** Corrected biometric / device user id. */
  enrollmentNumber?: string | null;
  /** Corrected device-side name for the user list row. */
  deviceName?: string | null;
  /** Terminal to assign (REASSIGN_DEVICE) or sync with (RESYNC_*). */
  serialNumber?: string | null;
  employeeFloorId?: string | null;
  employeeSectionId?: string | null;
  deviceFloorId?: string | null;
  deviceSectionId?: string | null;
  /** Retire the previous conflicting mapping when changing a biometric id. */
  retirePreviousMapping?: boolean;
  /** Re-project held punches onto attendance (default true). */
  remapPastPunches?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface MismatchResolveChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface MismatchResolveResult {
  ok: boolean;
  message: string;
  dryRun: boolean;
  changes: MismatchResolveChange[];
  notes: string[];
  remappedPunches: number;
  record: MismatchRecordRow | null;
}

interface MappingRowLite {
  id: string;
  employeeId: string;
  enrollmentNumber: string;
  normalizedEnrollment: string | null;
  serialNumber: string | null;
  showroomCode: string;
  status: string;
}

interface EmployeeRowLite {
  id: string;
  employeeCode: string | null;
  fullName: string | null;
  status: string;
  floorId: string | null;
  sectionId: string | null;
  biometricDeviceEmployeeId: string | null;
}

interface DeviceRowLite {
  id: string;
  serialNumber: string;
  name: string;
  locationCode: string;
  floorId: string | null;
  sectionId: string | null;
  isActive: number;
}

type PlanOp =
  | { kind: 'upsertMapping'; employeeId: string; enrollmentNumber: string; showroomCode: string; serialNumber: string | null; notes: string }
  | { kind: 'retireMapping'; mappingId: string }
  | { kind: 'employeeMaster'; employeeId: string; biometricDeviceEmployeeId?: string; floorId?: string; sectionId?: string }
  | { kind: 'mappingSerial'; mappingId: string; serialNumber: string }
  | { kind: 'deviceArea'; deviceId: string; floorId?: string; sectionId?: string }
  | { kind: 'deviceUser'; serialNumber: string; pin: string; normalizedPin: string; employeeId: string | null; deviceName?: string | null; mappingStatus: 'MAPPED' | 'UNMAPPED' | 'AMBIGUOUS' }
  | { kind: 'queue'; serialNumber: string; command: string }
  | { kind: 'markSynced'; serialNumber: string; normalizedPin: string };

async function loadEmployee(employeeId: string): Promise<EmployeeRowLite | null> {
  const [rows]: any = await pool.query(
    'SELECT id, employeeCode, fullName, status, floorId, sectionId, biometricDeviceEmployeeId FROM employee WHERE id = ? LIMIT 1',
    [employeeId]
  );
  return rows[0] ?? null;
}

async function loadDevice(idOrSerial: string): Promise<DeviceRowLite | null> {
  const [rows]: any = await pool.query(
    `SELECT id, serialNumber, name, locationCode, floorId, sectionId, isActive
       FROM biometric_devices WHERE id = ? OR serialNumber = ? LIMIT 1`,
    [idOrSerial, idOrSerial]
  );
  return rows[0] ?? null;
}

async function loadMappingFor(showroomCode: string | null, normalizedId: string | null, employeeId: string | null): Promise<MappingRowLite | null> {
  if (normalizedId) {
    const params: any[] = [normalizedId];
    let where = 'm.normalizedEnrollment = ?';
    if (showroomCode) {
      where += ' AND m.showroomCode = ?';
      params.push(showroomCode);
    }
    const [rows]: any = await pool.query(
      `SELECT m.id, m.employeeId, m.enrollmentNumber, m.normalizedEnrollment, m.serialNumber, m.showroomCode, m.status
         FROM biometric_employee_mappings m WHERE ${where} LIMIT 1`,
      params
    );
    if (rows[0]) return rows[0];
  }
  if (employeeId && showroomCode) {
    const [rows]: any = await pool.query(
      `SELECT m.id, m.employeeId, m.enrollmentNumber, m.normalizedEnrollment, m.serialNumber, m.showroomCode, m.status
         FROM biometric_employee_mappings m
        WHERE m.employeeId = ? AND m.showroomCode = ? AND m.status IN ('ACTIVE','AMBIGUOUS')
        ORDER BY m.updatedAt DESC LIMIT 1`,
      [employeeId, showroomCode]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

function deviceRefFor(record: MismatchRecordRow, fallback: DeviceRowLite | null) {
  return {
    serialNumber: record.serialNumber ?? fallback?.serialNumber ?? null,
    deviceName: record.deviceName ?? fallback?.name ?? null,
    locationCode: record.locationCode ?? fallback?.locationCode ?? null,
  };
}

/**
 * Validate + plan + (unless dryRun) apply one resolution.
 */
export async function resolveMismatch(params: MismatchResolveParams): Promise<MismatchResolveResult> {
  const record = await getMismatchRecord(params.mismatchId);
  if (!record) {
    return { ok: false, message: 'Mismatch record not found', dryRun: Boolean(params.dryRun), changes: [], notes: [], remappedPunches: 0, record: null };
  }
  // A decided record is final: re-applying commands would re-execute side
  // effects and silently rewrite the audit trail. Reopen is deliberately not
  // supported — a fresh detection creates a fresh record if the problem recurs.
  if (record.status !== 'OPEN') {
    return {
      ok: false,
      message: `Record is already ${record.status}${record.resolutionAction ? ` (${record.resolutionAction})` : ''}; reopen is not supported.`,
      dryRun: Boolean(params.dryRun),
      changes: [],
      notes: [],
      remappedPunches: 0,
      record,
    };
  }

  const changes: MismatchResolveChange[] = [];
  const notes: string[] = [];
  const ops: PlanOp[] = [];
  const isDecisionOnly = params.action === 'RESOLVE' || params.action === 'IGNORE';
  const isResync = params.action === 'RESYNC_TO_DEVICE' || params.action === 'RESYNC_FROM_DEVICE';

  const showroom = record.locationCode ?? null;
  const deviceForRecord = record.deviceId || record.serialNumber
    ? await loadDevice(record.deviceId ?? record.serialNumber ?? '')
    : null;
  const mapping = await loadMappingFor(
    showroom,
    record.biometricId ? normalizeDeviceUserId(record.biometricId).normalized : null,
    record.employeeId
  );

  // ─── Per-action validation and planning ────────────────────────────────────

  if (params.action === 'RELINK' || params.action === 'EDIT_EMPLOYEE') {
    const targetId = params.employeeId ?? record.employeeId;
    if (!targetId) return fail(params, 'employeeId is required to re-link this record');
    const employee = await loadEmployee(targetId);
    if (!employee) return fail(params, 'Target employee not found');
    if (employee.status !== 'ACTIVE') return fail(params, `Employee ${employee.employeeCode ?? employee.id} is ${employee.status}; only ACTIVE employees can receive punches`);

    const enrollment = params.enrollmentNumber ?? mapping?.enrollmentNumber ?? record.biometricId;
    if (!enrollment) return fail(params, 'This record has no biometric id to map');
    const targetShowroom = showroom ?? mapping?.showroomCode ?? 'BEL';

    if (mapping && mapping.employeeId !== targetId) {
      changes.push({ field: 'mapping.employeeId', before: mapping.employeeId, after: targetId });
    }
    const existing = await loadMappingFor(targetShowroom, normalizeDeviceUserId(enrollment).normalized, null);
    if (existing && existing.employeeId !== targetId) {
      if (!params.retirePreviousMapping) {
        return fail(
          params,
          `Biometric id ${enrollment} is already mapped to another employee (${existing.employeeId}); pass retirePreviousMapping to move it`
        );
      }
      ops.push({ kind: 'retireMapping', mappingId: existing.id });
      notes.push(`Existing mapping ${existing.id} will be revoked.`);
    }
    ops.push({
      kind: 'upsertMapping',
      employeeId: targetId,
      enrollmentNumber: String(enrollment),
      showroomCode: targetShowroom,
      serialNumber: deviceForRecord?.serialNumber ?? mapping?.serialNumber ?? null,
      notes: `Re-linked from mismatch ${record.id} by ${params.actorId}`,
    });
    if (record.serialNumber && record.biometricId) {
      ops.push({
        kind: 'deviceUser',
        serialNumber: record.serialNumber,
        pin: record.biometricId,
        normalizedPin: normalizeDeviceUserId(record.biometricId).normalized,
        employeeId: targetId,
        deviceName: params.deviceName ?? undefined,
        mappingStatus: 'MAPPED',
      });
    }
  }

  if (params.action === 'EDIT_BIOMETRIC_ID') {
    const rawEnrollment = params.enrollmentNumber?.trim();
    if (!rawEnrollment) return fail(params, 'enrollmentNumber is required');
    const targetId = params.employeeId ?? mapping?.employeeId ?? record.employeeId;
    if (!targetId) return fail(params, 'No employee is associated with this record; pass employeeId too');
    const employee = await loadEmployee(targetId);
    if (!employee) return fail(params, 'Target employee not found');
    if (employee.status !== 'ACTIVE') return fail(params, `Employee ${employee.employeeCode ?? employee.id} is ${employee.status}`);

    const targetShowroom = showroom ?? mapping?.showroomCode ?? 'BEL';
    const normalized = normalizeDeviceUserId(rawEnrollment).normalized;
    const existing = await loadMappingFor(targetShowroom, normalized, null);
    if (existing && existing.employeeId !== targetId) {
      if (!params.retirePreviousMapping) {
        return fail(
          params,
          `Biometric id ${rawEnrollment} already belongs to another employee (${existing.employeeId}); pass retirePreviousMapping to move it`
        );
      }
      ops.push({ kind: 'retireMapping', mappingId: existing.id });
      notes.push(`Existing mapping ${existing.id} will be revoked.`);
    }
    if (mapping && mapping.enrollmentNumber !== rawEnrollment) {
      ops.push({ kind: 'retireMapping', mappingId: mapping.id });
      changes.push({ field: 'mapping.enrollmentNumber', before: mapping.enrollmentNumber, after: rawEnrollment });
      notes.push('The previous mapping row is revoked after the new one is created.');
    }
    ops.push({
      kind: 'upsertMapping',
      employeeId: targetId,
      enrollmentNumber: rawEnrollment,
      showroomCode: targetShowroom,
      serialNumber: deviceForRecord?.serialNumber ?? mapping?.serialNumber ?? null,
      notes: `Biometric id corrected from mismatch ${record.id} by ${params.actorId}`,
    });
    if (normalizeDeviceUserId(employee.biometricDeviceEmployeeId ?? '').normalized !== normalized) {
      ops.push({ kind: 'employeeMaster', employeeId: targetId, biometricDeviceEmployeeId: rawEnrollment });
      changes.push({ field: 'employee.biometricDeviceEmployeeId', before: employee.biometricDeviceEmployeeId, after: rawEnrollment });
    }
    if (record.serialNumber && record.biometricId) {
      ops.push({
        kind: 'deviceUser',
        serialNumber: record.serialNumber,
        pin: record.biometricId,
        normalizedPin: normalizeDeviceUserId(record.biometricId).normalized,
        employeeId: targetId,
        mappingStatus: 'MAPPED',
      });
      notes.push(`Terminal ${record.serialNumber} still lists the old PIN ${record.biometricId}; use “Sync to device” after this change.`);
      if (params.dryRun) notes.push('A device resync is recommended so the terminal learns the corrected id.');
    }
  }

  if (params.action === 'REASSIGN_DEVICE') {
    const employeeId = record.employeeId ?? mapping?.employeeId ?? null;
    const targetDevice = params.serialNumber ? await loadDevice(params.serialNumber) : null;
    if (params.serialNumber && !targetDevice) return fail(params, `Terminal ${params.serialNumber} is not in the registry`);

    if (targetDevice && employeeId) {
      const targetShowroom = mapping?.showroomCode ?? showroom ?? targetDevice.locationCode;
      if (targetDevice.locationCode !== targetShowroom) {
        notes.push(`Terminal ${targetDevice.serialNumber} belongs to ${targetDevice.locationCode}, not ${targetShowroom}.`);
      }
      // Hard rejection, matching how the target employee's ACTIVE status is
      // enforced above. Assigning a person to a deactivated terminal is not a
      // warning: their next punch is refused by that device, which re-raises
      // DEVICE_MISMATCH and leaves attendance missing.
      if (!targetDevice.isActive) {
        return fail(params, `Terminal ${targetDevice.serialNumber} is deactivated; re-activate it before assigning employees to it`);
      }
      if (mapping) {
        ops.push({ kind: 'mappingSerial', mappingId: mapping.id, serialNumber: targetDevice.serialNumber });
        changes.push({ field: 'mapping.serialNumber', before: mapping.serialNumber, after: targetDevice.serialNumber });
        if (params.deviceFloorId !== undefined || params.deviceSectionId !== undefined) {
          ops.push({
            kind: 'deviceArea',
            deviceId: targetDevice.id,
            floorId: params.deviceFloorId ?? undefined,
            sectionId: params.deviceSectionId ?? undefined,
          });
          changes.push({ field: 'device.floorId/sectionId', before: { floorId: targetDevice.floorId, sectionId: targetDevice.sectionId }, after: { floorId: params.deviceFloorId ?? targetDevice.floorId, sectionId: params.deviceSectionId ?? targetDevice.sectionId } });
        }
      } else {
        notes.push('No mapping row exists for this employee yet; assign a biometric id first.');
      }
    }

    if (employeeId && (params.employeeFloorId !== undefined || params.employeeSectionId !== undefined)) {
      const employee = await loadEmployee(employeeId);
      if (!employee) return fail(params, 'Employee not found');
      ops.push({
        kind: 'employeeMaster',
        employeeId,
        floorId: params.employeeFloorId ?? undefined,
        sectionId: params.employeeSectionId ?? undefined,
      });
      changes.push({
        field: 'employee.floorId/sectionId',
        before: { floorId: employee.floorId, sectionId: employee.sectionId },
        after: { floorId: params.employeeFloorId ?? employee.floorId, sectionId: params.employeeSectionId ?? employee.sectionId },
      });
    }

    if (ops.length === 0) {
      return fail(params, 'Nothing to change: pass serialNumber and/or employee or device floor/section');
    }
  }

  if (isResync) {
    const serials: string[] = [];
    if (params.serialNumber) {
      const device = await loadDevice(params.serialNumber);
      if (!device) return fail(params, `Terminal ${params.serialNumber} is not in the registry`);
      serials.push(device.serialNumber);
    } else if (record.serialNumber) {
      serials.push(record.serialNumber);
    } else if (showroom) {
      const [rows]: any = await pool.query(
        'SELECT serialNumber FROM biometric_devices WHERE locationCode = ? AND isActive = 1',
        [showroom]
      );
      serials.push(...rows.map((row: any) => row.serialNumber));
    }
    if (serials.length === 0) return fail(params, 'No terminal to synchronize with');

    const pin = record.biometricId ?? mapping?.enrollmentNumber ?? '';
    if (params.action === 'RESYNC_TO_DEVICE' && !pin) return fail(params, 'This record has no biometric id to push');

    let pushName: string | null = params.deviceName ?? null;
    if (!pushName && (record.employeeId ?? mapping?.employeeId)) {
      const employee = await loadEmployee(record.employeeId ?? mapping!.employeeId);
      pushName = employee?.fullName ?? null;
    }

    for (const serial of serials) {
      if (params.action === 'RESYNC_TO_DEVICE') {
        const command = `DATA UPDATE USERINFO PIN=${pin}\tName=${pushName ?? pin}\tPri=0`;
        ops.push({ kind: 'queue', serialNumber: serial, command });
        ops.push({ kind: 'markSynced', serialNumber: serial, normalizedPin: normalizeDeviceUserId(pin).normalized });
        changes.push({ field: `queue(${serial})`, before: null, after: command });
      } else {
        ops.push({ kind: 'queue', serialNumber: serial, command: 'DATA QUERY USERINFO' });
        ops.push({ kind: 'queue', serialNumber: serial, command: 'DATA QUERY ATTLOG' });
        changes.push({ field: `queue(${serial})`, before: null, after: 'DATA QUERY USERINFO + ATTLOG' });
      }
    }
  }

  if (isDecisionOnly) {
    changes.push({ field: 'status', before: record.status, after: params.action === 'IGNORE' ? 'IGNORED' : 'RESOLVED' });
  }

  // ─── Dry run stops here with the preview ───────────────────────────────────
  if (params.dryRun) {
    return {
      ok: true,
      message: `Preview: ${params.action} would apply ${changes.length} change(s).`,
      dryRun: true,
      changes,
      notes,
      remappedPunches: 0,
      record,
    };
  }

  // ─── Apply ────────────────────────────────────────────────────────────────
  const before = {
    mismatch: { id: record.id, type: record.mismatchType, status: record.status, employeeId: record.employeeId, biometricId: record.biometricId, serialNumber: record.serialNumber },
    mapping: mapping ? { id: mapping.id, employeeId: mapping.employeeId, enrollmentNumber: mapping.enrollmentNumber, serialNumber: mapping.serialNumber, status: mapping.status } : null,
  };
  const appliedOps: string[] = [];

  try {
    for (const op of ops) {
      switch (op.kind) {
        case 'retireMapping': {
          await pool.query("UPDATE biometric_employee_mappings SET status = 'REVOKED', updatedAt = NOW() WHERE id = ?", [op.mappingId]);
          appliedOps.push(`revoked mapping ${op.mappingId}`);
          break;
        }
        case 'upsertMapping': {
          const outcome = await saveEmployeeBiometricMapping({
            employeeId: op.employeeId,
            enrollmentNumber: op.enrollmentNumber,
            showroomCode: op.showroomCode,
            serialNumber: op.serialNumber ?? undefined,
            status: 'ACTIVE',
            notes: op.notes,
            mappingSource: 'MANUAL',
          });
          appliedOps.push(`mapping ${op.enrollmentNumber} → ${op.employeeId} (${outcome.status}${outcome.conflictCount ? `, ${outcome.conflictCount} conflict(s)` : ''})`);
          if (outcome.conflictCount > 0) {
            notes.push(`Suffix conflict remains on ${normalizeDeviceUserId(op.enrollmentNumber).lastSix}; the scan will report it until the other claim is cleared.`);
          }
          break;
        }
        case 'employeeMaster': {
          const sets: string[] = [];
          const values: any[] = [];
          if (op.biometricDeviceEmployeeId !== undefined) { sets.push('biometricDeviceEmployeeId = ?'); values.push(op.biometricDeviceEmployeeId); }
          if (op.floorId !== undefined) { sets.push('floorId = ?'); values.push(op.floorId); }
          if (op.sectionId !== undefined) { sets.push('sectionId = ?'); values.push(op.sectionId); }
          if (sets.length > 0) {
            values.push(op.employeeId);
            await pool.query(`UPDATE employee SET ${sets.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
            appliedOps.push(`employee ${op.employeeId} updated (${sets.join(', ')})`);
          }
          break;
        }
        case 'mappingSerial': {
          await pool.query('UPDATE biometric_employee_mappings SET serialNumber = ?, updatedAt = NOW() WHERE id = ?', [op.serialNumber, op.mappingId]);
          appliedOps.push(`mapping ${op.mappingId} → terminal ${op.serialNumber}`);
          break;
        }
        case 'deviceArea': {
          const sets: string[] = [];
          const values: any[] = [];
          if (op.floorId !== undefined) { sets.push('floorId = ?'); values.push(op.floorId); }
          if (op.sectionId !== undefined) { sets.push('sectionId = ?'); values.push(op.sectionId); }
          if (sets.length > 0) {
            values.push(op.deviceId);
            await pool.query(`UPDATE biometric_devices SET ${sets.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
            appliedOps.push(`device ${op.deviceId} area updated`);
          }
          break;
        }
        case 'deviceUser': {
          const [result]: any = await pool.query(
            `UPDATE biometric_device_users
                SET employeeId = ?, mappingStatus = ?, deviceName = COALESCE(?, deviceName), lastSeenAt = lastSeenAt
              WHERE serialNumber = ? AND normalizedPin = ?`,
            [op.employeeId, op.mappingStatus, op.deviceName ?? null, op.serialNumber, op.normalizedPin]
          );
          if (Number(result?.affectedRows) === 0 && op.employeeId) {
            // The terminal row does not exist yet — record what the device
            // *should* hold so a later USERINFO pull reconciles it.
            const id = `bdu-${crypto.createHash('sha1').update(`${op.serialNumber}|${op.normalizedPin}`).digest('hex').slice(0, 24)}`;
            await pool.query(
              `INSERT INTO biometric_device_users
                 (id, serialNumber, locationCode, pin, normalizedPin, deviceName, employeeId, mappingStatus, firstSeenAt, lastSeenAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
               ON DUPLICATE KEY UPDATE employeeId = VALUES(employeeId), mappingStatus = VALUES(mappingStatus), deviceName = COALESCE(VALUES(deviceName), deviceName)`,
              [id, op.serialNumber, record.locationCode ?? '', op.pin, op.normalizedPin, op.deviceName ?? null, op.employeeId, op.mappingStatus]
            );
          }
          appliedOps.push(`device user ${op.pin}@${op.serialNumber} updated`);
          break;
        }
        case 'queue': {
          queueDeviceCommand(op.serialNumber, op.command);
          appliedOps.push(`queued on ${op.serialNumber}: ${op.command}`);
          break;
        }
        case 'markSynced': {
          await pool.query(
            'UPDATE biometric_device_users SET lastSyncedAt = NOW(3) WHERE serialNumber = ? AND normalizedPin = ?',
            [op.serialNumber, op.normalizedPin]
          ).catch(() => undefined);
          break;
        }
      }
    }
  } catch (err: any) {
    deviceLog.error('Mismatch resolution failed', { code: 'DB_FAILURE', detail: err?.sqlMessage || err?.message, stack: err?.stack });
    return { ok: false, message: `Resolution failed: ${err?.sqlMessage || err?.message}`, dryRun: false, changes, notes, remappedPunches: 0, record };
  }

  // ─── Re-project held punches for the corrected biometric id ───────────────
  let remappedPunches = 0;
  const shouldRemap = (params.remapPastPunches ?? true) && !isDecisionOnly && !isResync;
  const targetEmployeeId = params.employeeId ?? mapping?.employeeId ?? record.employeeId;
  if (shouldRemap && targetEmployeeId && record.serialNumber && record.biometricId) {
    const [held]: any = await pool.query(
      `SELECT id FROM biometric_raw_punches
        WHERE serialNumber = ? AND normalizedId = ? AND mappingStatus IN ('UNMAPPED','AMBIGUOUS')
        ORDER BY punchTimeUtc DESC LIMIT 200`,
      [record.serialNumber, normalizeDeviceUserId(record.biometricId).normalized]
    );
    for (const punch of held) {
      const outcome = await assignUnmappedPunch({ rawPunchId: punch.id, employeeId: targetEmployeeId, actorId: params.actorId });
      if (outcome.ok) remappedPunches++;
    }
    if (remappedPunches > 0) notes.push(`${remappedPunches} held punch(es) re-projected onto attendance.`);
    // The query is deliberately capped so one resolution cannot lock the table
    // for minutes. Say so when the cap was hit, otherwise "resolved" reads as
    // "everything was re-attributed" when a backlog is still held.
    if (remappedPunches >= 200) {
      notes.push('Only the first 200 held punches were re-projected. Run the resolution again to take the next batch.');
    }
  }

  // ─── Close the record + audit ─────────────────────────────────────────────
  await markMismatchDecided({
    id: record.id,
    status: params.action === 'IGNORE' ? 'IGNORED' : 'RESOLVED',
    action: params.action,
    actorId: params.actorId,
    remark: params.remark ?? null,
  });

  try {
    await AuditService.log({
      userId: params.actorId,
      // auditlog.locationId has an FK to location.id — the record stores the
      // showroom CODE, so it must be resolved before it reaches the FK.
      locationId: (showroom ? resolveLocationAlias(showroom) : undefined) || undefined,
      action: `BIOMETRIC_MISMATCH_${params.action}`,
      entityType: 'BiometricMismatch',
      entityId: record.id,
      ipAddress: params.ipAddress || '127.0.0.1',
      userAgent: params.userAgent || 'HRM UI',
      riskScore: 40,
      tags: ['biometric', 'mismatch', params.action.toLowerCase()],
      before,
      after: {
        mismatch: { status: params.action === 'IGNORE' ? 'IGNORED' : 'RESOLVED', action: params.action, remark: params.remark ?? null },
        changes,
        appliedOps,
        remappedPunches,
      },
    });
  } catch (err: any) {
    deviceLog.warn('Audit log write failed for mismatch resolution', { code: 'DB_FAILURE', detail: err?.sqlMessage || err?.message });
  }

  const updated = await getMismatchRecord(record.id);
  return {
    ok: true,
    message: `Record ${record.id} ${params.action === 'IGNORE' ? 'ignored' : 'resolved'} (${appliedOps.length} operation(s), ${remappedPunches} punch(es) remapped).`,
    dryRun: false,
    changes,
    notes,
    remappedPunches,
    record: updated,
  };
}

function fail(params: MismatchResolveParams, message: string): MismatchResolveResult {
  return { ok: false, message, dryRun: Boolean(params.dryRun), changes: [], notes: [], remappedPunches: 0, record: null };
}
