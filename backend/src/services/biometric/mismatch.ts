/**
 * Biometric mismatch engine.
 *
 * The single place that decides "this punch / device user / mapping does not
 * agree with the employee master", across three entry points:
 *
 *   - live punches (ingest hooks call `detectPunchMismatches`);
 *   - terminal user lists (ADMS USERINFO calls `detectUserListMismatches`);
 *   - a periodic or operator-triggered sweep (`runFullMismatchScan`).
 *
 * Design rules:
 *   - classification is pure — `classifyPunchMismatch` /
 *     `classifyDeviceUser` / `classifyNotSynced` / `classifyDuplicateGroup`
 *     take plain rows and return drafts, so they are unit-testable without a
 *     database;
 *   - ONE open row per real-world problem: `dedupeKey` is unique per issue, so
 *     a thousand punches against the wrong terminal stay one row whose
 *     `occurrenceCount` goes up — the queue does not flood;
 *   - a resolved or ignored row is never silently reopened by a re-scan; it is
 *     bumped (lastDetectedAt / occurrenceCount) so the recurrence is visible
 *     but the human decision stands;
 *   - this module stays a leaf import (pool, settings, identity, socket) so the
 *     ingest pipeline can use it without an import cycle.
 */

import crypto from 'node:crypto';
import { pool } from '../../nativeDb.js';
import { socketIO } from '../../socket.js';
import { deviceLog } from './logger.js';
import { getDeviceConfig } from './settings.js';
import { normalizeDeviceUserId } from './employeeIdentity.js';
import { fromUtcMysqlString, toUtcMysqlString } from './timeCodec.js';

export type MismatchType =
  | 'ID_MISMATCH'
  | 'NAME_MISMATCH'
  | 'DEVICE_MISMATCH'
  | 'UNKNOWN_DEVICE'
  | 'UNKNOWN_USER'
  | 'NOT_SYNCED'
  | 'DUPLICATE_ID'
  | 'INACTIVE_EMPLOYEE';

export type MismatchSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MismatchStatus = 'OPEN' | 'RESOLVED' | 'IGNORED';
export type MismatchDetectedBy = 'INGEST' | 'SCAN' | 'USERINFO' | 'MANUAL';

export const MISMATCH_TYPES: MismatchType[] = [
  'ID_MISMATCH',
  'NAME_MISMATCH',
  'DEVICE_MISMATCH',
  'UNKNOWN_DEVICE',
  'UNKNOWN_USER',
  'NOT_SYNCED',
  'DUPLICATE_ID',
  'INACTIVE_EMPLOYEE',
];

export const MISMATCH_TYPE_LABELS: Record<MismatchType, string> = {
  ID_MISMATCH: 'ID Mismatch',
  NAME_MISMATCH: 'Name Mismatch',
  DEVICE_MISMATCH: 'Device Mismatch',
  UNKNOWN_DEVICE: 'Unknown Device',
  UNKNOWN_USER: 'Unknown User',
  NOT_SYNCED: 'Not Synced',
  DUPLICATE_ID: 'Duplicate ID',
  INACTIVE_EMPLOYEE: 'Inactive Employee',
};

export function severityForType(type: MismatchType): MismatchSeverity {
  switch (type) {
    case 'UNKNOWN_DEVICE':
    case 'DUPLICATE_ID':
      return 'CRITICAL';
    case 'ID_MISMATCH':
    case 'DEVICE_MISMATCH':
      return 'HIGH';
    case 'NAME_MISMATCH':
    case 'NOT_SYNCED':
    case 'INACTIVE_EMPLOYEE':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

// ─── Plain row shapes (unit-testable, no DB) ─────────────────────────────────

export interface DeviceLite {
  id: string | null;
  serialNumber: string;
  name: string | null;
  locationCode: string | null;
  floorId: string | null;
  floorName?: string | null;
  sectionId: string | null;
  sectionName?: string | null;
  isActive?: boolean;
}

export interface EmployeeLite {
  id: string;
  employeeCode: string | null;
  fullName: string | null;
  status?: string | null;
  floorId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  biometricDeviceEmployeeId?: string | null;
  locationCode?: string | null;
}

export interface MappingLite {
  id: string;
  employeeId: string;
  enrollmentNumber: string;
  normalizedEnrollment: string | null;
  serialNumber: string | null;
  showroomCode: string;
  status: string;
}

export interface DeviceUserLite {
  pin: string;
  normalizedPin: string;
  deviceName: string | null;
  employeeId: string | null;
}

export interface PunchVantage {
  punchId: string;
  serialNumber: string;
  enrollmentNumber: string;
  normalizedId: string;
  mappingStatus: string;
  employeeId: string | null;
  punchTimeUtc: Date | null;
  candidates?: Array<{ employeeId: string; employeeCode?: string | null; fullName?: string | null }>;
}

export interface PunchContext {
  device: DeviceLite | null;
  employee: EmployeeLite | null;
  mapping: MappingLite | null;
  deviceUser: DeviceUserLite | null;
  /** The terminal the mapping claims this employee is assigned to, if any. */
  assignedDevice: DeviceLite | null;
}

export interface MismatchDraft {
  type: MismatchType;
  severity: MismatchSeverity;
  dedupeKey: string;
  detectedBy: MismatchDetectedBy;
  deviceId?: string | null;
  serialNumber?: string | null;
  deviceName?: string | null;
  floorId?: string | null;
  floorName?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  departmentId?: string | null;
  locationCode?: string | null;
  employeeId?: string | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  biometricId?: string | null;
  punchId?: string | null;
  punchTime?: Date | null;
  expected: Record<string, unknown>;
  received: Record<string, unknown>;
  details: string;
}

// ─── Pure classification helpers ─────────────────────────────────────────────

/** Case/space/punctuation-insensitive, order-insensitive name key. */
export function normalizePersonName(name: string | null | undefined): string {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** 'Lakshmi Devi' == 'devi lakshmi' == 'LAKSHMI  DEVI'; 'Lakshmi Reddy' != it. */
export function personNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePersonName(a);
  const right = normalizePersonName(b);
  if (!left || !right) return true; // an absent name is not evidence of a mismatch
  return left === right;
}

/** Master device id vs the id the mapping claims, both normalised. */
export function biometricIdsDisagree(master: string | null | undefined, mappingId: string | null | undefined): boolean {
  const left = normalizeDeviceUserId(master ?? '').normalized;
  const right = normalizeDeviceUserId(mappingId ?? '').normalized;
  if (!left || !right) return false;
  return left !== right;
}

function deviceRef(device: DeviceLite | null): Pick<MismatchDraft,
  'deviceId' | 'serialNumber' | 'deviceName' | 'floorId' | 'floorName' | 'sectionId' | 'sectionName' | 'locationCode'> {
  if (!device) return { deviceId: null, serialNumber: null, deviceName: null };
  return {
    deviceId: device.id,
    serialNumber: device.serialNumber,
    deviceName: device.name,
    floorId: device.floorId ?? null,
    floorName: device.floorName ?? null,
    sectionId: device.sectionId ?? null,
    sectionName: device.sectionName ?? null,
    locationCode: device.locationCode ?? null,
  };
}

function employeeRef(employee: EmployeeLite | null): Pick<MismatchDraft, 'employeeId' | 'employeeCode' | 'employeeName' | 'departmentId'> {
  if (!employee) return {};
  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode ?? null,
    employeeName: employee.fullName ?? null,
    departmentId: employee.departmentId ?? null,
  };
}

function key(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p !== null && p !== undefined).join(':').slice(0, 191);
}

function draft(input: Omit<MismatchDraft, 'severity'> & { severity?: MismatchSeverity }): MismatchDraft {
  return { severity: input.severity ?? severityForType(input.type), ...input };
}

/**
 * Everything wrong with one punch, given what the masters say around it.
 * Returns zero or more drafts; empty means "all four sides agree".
 */
export function classifyPunchMismatch(punch: PunchVantage, ctx: PunchContext): MismatchDraft[] {
  const drafts: MismatchDraft[] = [];
  const device = ctx.device;
  const ref = deviceRef(device);
  const base = {
    detectedBy: 'INGEST' as const,
    ...ref,
    punchId: punch.punchId,
    punchTime: punch.punchTimeUtc,
    biometricId: punch.normalizedId || punch.enrollmentNumber,
  };

  if (!device || device.isActive === false) {
    drafts.push(draft({
      type: 'UNKNOWN_DEVICE',
      dedupeKey: key(['UNKNOWN_DEVICE', punch.serialNumber]),
      ...base,
      expected: { device: 'a registered, active terminal' },
      received: { serialNumber: punch.serialNumber, registered: Boolean(device), active: device ? device.isActive !== false : false },
      details: device
        ? `Punch arrived from "${punch.serialNumber}" which is deactivated in the registry.`
        : `Punch arrived from "${punch.serialNumber}" which is not in the device registry.`,
    }));
    return drafts;
  }

  if (punch.mappingStatus === 'AMBIGUOUS') {
    drafts.push(draft({
      type: 'ID_MISMATCH',
      dedupeKey: key(['ID_MISMATCH', 'punch', punch.serialNumber, punch.normalizedId]),
      ...base,
      expected: { mapping: 'exactly one employee' },
      received: { biometricId: punch.normalizedId, candidates: punch.candidates ?? [] },
      details: `Device id ${punch.normalizedId} matches more than one employee; the punch cannot be attributed safely.`,
    }));
    return drafts;
  }

  if (punch.mappingStatus === 'UNMAPPED' || !punch.employeeId) {
    drafts.push(draft({
      type: 'UNKNOWN_USER',
      dedupeKey: key(['UNKNOWN_USER', punch.serialNumber, punch.normalizedId]),
      ...base,
      expected: { mapping: 'an active employee mapping' },
      received: { biometricId: punch.normalizedId, enrollmentNumber: punch.enrollmentNumber },
      details: `Device id ${punch.normalizedId || '(empty)'} has no employee mapping.`,
    }));
    return drafts;
  }

  const employee = ctx.employee;
  const mapping = ctx.mapping;

  if (employee && biometricIdsDisagree(employee.biometricDeviceEmployeeId, mapping?.enrollmentNumber ?? punch.enrollmentNumber)) {
    drafts.push(draft({
      type: 'ID_MISMATCH',
      dedupeKey: key(['ID_MISMATCH', 'master', employee.id, mapping?.normalizedEnrollment ?? punch.normalizedId]),
      ...base,
      ...employeeRef(employee),
      expected: { employeeBiometricId: employee.biometricDeviceEmployeeId, employeeCode: employee.employeeCode, employeeName: employee.fullName },
      received: { mappingEnrollment: mapping?.enrollmentNumber ?? punch.enrollmentNumber, punchedId: punch.enrollmentNumber },
      details: `Employee master says device id ${employee.biometricDeviceEmployeeId}, but the mapping/punch used ${mapping?.enrollmentNumber ?? punch.enrollmentNumber}.`,
    }));
  }

  if (employee && ctx.deviceUser && !personNamesMatch(ctx.deviceUser.deviceName, employee.fullName)) {
    drafts.push(draft({
      type: 'NAME_MISMATCH',
      dedupeKey: key(['NAME_MISMATCH', punch.serialNumber, ctx.deviceUser.normalizedPin]),
      ...base,
      ...employeeRef(employee),
      expected: { employeeName: employee.fullName, employeeCode: employee.employeeCode },
      received: { deviceName: ctx.deviceUser.deviceName, pin: ctx.deviceUser.pin },
      details: `Terminal "${device.name ?? punch.serialNumber}" lists "${ctx.deviceUser.deviceName}" for PIN ${ctx.deviceUser.pin}; the employee master says "${employee.fullName}".`,
    }));
  }

  if (employee) {
    const reasons: string[] = [];
    const expected: Record<string, unknown> = {};
    const received: Record<string, unknown> = {};

    const assigned = ctx.assignedDevice;
    if (
      mapping?.serialNumber
      && assigned
      && assigned.isActive !== false
      && assigned.locationCode === device.locationCode
      && assigned.serialNumber !== device.serialNumber
    ) {
      reasons.push(`punched on "${device.name ?? device.serialNumber}" instead of assigned terminal "${assigned.name ?? assigned.serialNumber}"`);
      expected.assignedSerialNumber = assigned.serialNumber;
      expected.assignedDeviceName = assigned.name;
      received.serialNumber = device.serialNumber;
      received.deviceName = device.name;
    }

    if (employee.floorId && device.floorId && employee.floorId !== device.floorId) {
      reasons.push(`employee is on floor ${employee.floorId} but the terminal guards floor ${device.floorId}`);
      expected.floorId = employee.floorId;
      expected.sectionId = employee.sectionId ?? null;
      received.deviceFloorId = device.floorId;
      received.deviceSectionId = device.sectionId ?? null;
    } else if (employee.sectionId && device.sectionId && employee.sectionId !== device.sectionId) {
      reasons.push(`employee is in section ${employee.sectionId} but the terminal covers section ${device.sectionId}`);
      expected.sectionId = employee.sectionId;
      received.deviceSectionId = device.sectionId;
    }

    if (reasons.length > 0) {
      drafts.push(draft({
        type: 'DEVICE_MISMATCH',
        dedupeKey: key(['DEVICE_MISMATCH', employee.id, device.serialNumber]),
        ...base,
        ...employeeRef(employee),
        expected,
        received,
        details: `Punch from ${punch.enrollmentNumber}: ${reasons.join('; ')}.`,
      }));
    }
  }

  return drafts;
}

/** Everything wrong with one row of the terminal's own user list. */
export function classifyDeviceUser(input: {
  device: DeviceLite;
  deviceUser: DeviceUserLite;
  mapping: MappingLite | null;
  employee: EmployeeLite | null;
}): MismatchDraft[] {
  const { device, deviceUser, mapping, employee } = input;
  const drafts: MismatchDraft[] = [];
  const base = {
    detectedBy: 'USERINFO' as const,
    ...deviceRef(device),
    biometricId: deviceUser.normalizedPin,
  };

  if (!employee) {
    drafts.push(draft({
      type: 'UNKNOWN_USER',
      dedupeKey: key(['UNKNOWN_USER', device.serialNumber, deviceUser.normalizedPin]),
      ...base,
      expected: { mapping: 'an active employee mapping' },
      received: { pin: deviceUser.pin, deviceName: deviceUser.deviceName },
      details: `Terminal lists PIN ${deviceUser.pin} ("${deviceUser.deviceName ?? 'no name'}") with no employee mapping.`,
    }));
    return drafts;
  }

  if (!personNamesMatch(deviceUser.deviceName, employee.fullName)) {
    drafts.push(draft({
      type: 'NAME_MISMATCH',
      dedupeKey: key(['NAME_MISMATCH', device.serialNumber, deviceUser.normalizedPin]),
      ...base,
      ...employeeRef(employee),
      expected: { employeeName: employee.fullName, employeeCode: employee.employeeCode },
      received: { deviceName: deviceUser.deviceName, pin: deviceUser.pin },
      details: `Terminal "${device.name ?? device.serialNumber}" lists "${deviceUser.deviceName}" for PIN ${deviceUser.pin}; the employee master says "${employee.fullName}".`,
    }));
  }

  if (mapping && biometricIdsDisagree(employee.biometricDeviceEmployeeId, mapping.enrollmentNumber)) {
    drafts.push(draft({
      type: 'ID_MISMATCH',
      dedupeKey: key(['ID_MISMATCH', 'master', employee.id, mapping.normalizedEnrollment ?? deviceUser.normalizedPin]),
      ...base,
      ...employeeRef(employee),
      expected: { employeeBiometricId: employee.biometricDeviceEmployeeId },
      received: { mappingEnrollment: mapping.enrollmentNumber, pinOnDevice: deviceUser.pin },
      details: `Employee master says device id ${employee.biometricDeviceEmployeeId}, mapping says ${mapping.enrollmentNumber}, terminal says ${deviceUser.pin}.`,
    }));
  }

  if (employee.status && employee.status !== 'ACTIVE') {
    drafts.push(draft({
      type: 'INACTIVE_EMPLOYEE',
      dedupeKey: key(['INACTIVE_EMPLOYEE', employee.id]),
      ...base,
      ...employeeRef(employee),
      expected: { status: 'ACTIVE' },
      received: { status: employee.status, stillOnDevice: device.serialNumber, pin: deviceUser.pin },
      details: `Employee ${employee.employeeCode ?? employee.id} is ${employee.status} but is still enrolled on terminal ${device.serialNumber}.`,
    }));
  }

  return drafts;
}

/** An ACTIVE mapping with no trace of the PIN on any terminal of its showroom. */
export function classifyNotSynced(input: {
  mapping: MappingLite;
  employee: EmployeeLite;
  showroomSerials: string[];
  pinsBySerial: Map<string, Set<string>>;
}): MismatchDraft | null {
  const { mapping, employee, showroomSerials, pinsBySerial } = input;
  if (employee.status && employee.status !== 'ACTIVE') return null;
  if (showroomSerials.length === 0) return null;

  const normalizedPin = mapping.normalizedEnrollment || normalizeDeviceUserId(mapping.enrollmentNumber).normalized;
  if (!normalizedPin) return null;

  // Prefer the assigned terminal when it really belongs to the showroom;
  // otherwise any terminal of the showroom counts as "enrolled somewhere".
  const expectedSerials = mapping.serialNumber && showroomSerials.includes(mapping.serialNumber)
    ? [mapping.serialNumber]
    : showroomSerials;
  const present = expectedSerials.some((serial) => pinsBySerial.get(serial)?.has(normalizedPin));
  if (present) return null;

  return draft({
    type: 'NOT_SYNCED',
    dedupeKey: key(['NOT_SYNCED', employee.id]),
    detectedBy: 'SCAN',
    employeeId: employee.id,
    employeeCode: employee.employeeCode ?? null,
    employeeName: employee.fullName ?? null,
    departmentId: employee.departmentId ?? null,
    biometricId: normalizedPin,
    locationCode: mapping.showroomCode || null,
    expected: { pin: normalizedPin, showroom: mapping.showroomCode, assignedSerial: mapping.serialNumber ?? null },
    received: { presentOnSerials: expectedSerials.filter((s) => pinsBySerial.has(s)) },
    details: `Employee ${employee.employeeCode ?? employee.id} has an active mapping (${mapping.enrollmentNumber}) but PIN ${normalizedPin} is not enrolled on ${expectedSerials.join(', ') || 'any showroom terminal'}.`,
  });
}

/** One mapping row of a suffix-collision group (same last-6 digits, different employees). */
export function classifyDuplicateGroup(input: {
  lastSix: string;
  rows: Array<{ mapping: MappingLite; employee: EmployeeLite }>;
}): MismatchDraft[] {
  return input.rows.map(({ mapping, employee }) => {
    const others = input.rows
      .filter((row) => row.employee.id !== employee.id)
      .map((row) => ({ employeeId: row.employee.id, employeeCode: row.employee.employeeCode, enrollmentNumber: row.mapping.enrollmentNumber }));
    return draft({
      type: 'DUPLICATE_ID',
      dedupeKey: key(['DUPLICATE_ID', input.lastSix, employee.id]),
      detectedBy: 'SCAN',
      employeeId: employee.id,
      employeeCode: employee.employeeCode ?? null,
      employeeName: employee.fullName ?? null,
      departmentId: employee.departmentId ?? null,
      biometricId: mapping.normalizedEnrollment ?? mapping.enrollmentNumber,
      locationCode: mapping.showroomCode || null,
      expected: { uniqueEmployeeForSuffix: input.lastSix, enrollmentNumber: mapping.enrollmentNumber },
      received: { alsoClaimedBy: others },
      details: `Suffix ${input.lastSix} is claimed by more than one employee: ${input.rows.map((r) => r.employee.employeeCode ?? r.employee.id).join(', ')}.`,
    });
  });
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export interface MismatchRecordRow {
  id: string;
  mismatchType: MismatchType;
  severity: MismatchSeverity;
  status: MismatchStatus;
  detectedBy: MismatchDetectedBy;
  dedupeKey: string;
  deviceId: string | null;
  serialNumber: string | null;
  deviceName: string | null;
  floorId: string | null;
  floorName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  departmentId: string | null;
  locationCode: string | null;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  biometricId: string | null;
  punchId: string | null;
  punchTime: string | null;
  expected: unknown;
  received: unknown;
  details: string | null;
  occurrenceCount: number;
  firstDetectedAt: string | null;
  lastDetectedAt: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolutionAction: string | null;
  remark: string | null;
}

function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return String(value);
  }
}

const MAX_DETAILS = 1000;

/**
 * Persist one draft. A repeat of an OPEN issue increments the counter instead
 * of inserting; a decided (RESOLVED/IGNORED) row is only bumped so the human
 * decision is never overwritten by a re-scan.
 */
export async function recordMismatch(input: {
  draft: MismatchDraft;
  locationCodeFallback?: string | null;
}): Promise<{ id: string; isNew: boolean; occurrenceCount: number }> {
  const { draft: d } = input;
  const id = `mmr-${crypto.randomUUID()}`;
  const punchTime = d.punchTime ? toUtcMysqlString(d.punchTime) : null;

  const [result]: any = await pool.query(
    `INSERT INTO biometric_mismatch_records
       (id, mismatchType, severity, status, detectedBy, dedupeKey,
        deviceId, serialNumber, deviceName, floorId, floorName, sectionId, sectionName,
        departmentId, locationCode,
        employeeId, employeeCode, employeeName, biometricId, punchId, punchTime,
        expected, received, details, occurrenceCount, firstDetectedAt, lastDetectedAt)
     VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE
       occurrenceCount = occurrenceCount + 1,
       lastDetectedAt = NOW(3),
       updatedAt = NOW(3),
       punchId = IF(status = 'OPEN', COALESCE(VALUES(punchId), punchId), punchId),
       punchTime = IF(status = 'OPEN', COALESCE(VALUES(punchTime), punchTime), punchTime),
       expected = IF(status = 'OPEN', VALUES(expected), expected),
       received = IF(status = 'OPEN', VALUES(received), received),
       details = IF(status = 'OPEN', VALUES(details), details)`,
    [
      id,
      d.type,
      d.severity,
      d.detectedBy,
      d.dedupeKey,
      d.deviceId ?? null,
      d.serialNumber ?? null,
      d.deviceName ?? null,
      d.floorId ?? null,
      d.floorName ?? null,
      d.sectionId ?? null,
      d.sectionName ?? null,
      d.departmentId ?? null,
      d.locationCode ?? input.locationCodeFallback ?? null,
      d.employeeId ?? null,
      d.employeeCode ?? null,
      d.employeeName ?? null,
      d.biometricId ?? null,
      d.punchId ?? null,
      punchTime,
      JSON.stringify(d.expected ?? {}),
      JSON.stringify(d.received ?? {}),
      d.details.slice(0, MAX_DETAILS),
    ]
  );

  const isNew = Number(result?.affectedRows) === 1;

  let occurrenceCount = 1;
  let recordId = id;
  try {
    const [rows]: any = await pool.query(
      'SELECT id, occurrenceCount FROM biometric_mismatch_records WHERE dedupeKey = ? LIMIT 1',
      [d.dedupeKey]
    );
    if (rows[0]) {
      occurrenceCount = Number(rows[0].occurrenceCount ?? 1);
      recordId = rows[0].id ?? id;
    }
  } catch {
    // The counter is cosmetic; never fail a punch ingest over it.
  }

  const payload = {
    id: recordId,
    mismatchType: d.type,
    severity: d.severity,
    status: 'OPEN',
    dedupeKey: d.dedupeKey,
    deviceId: d.deviceId ?? null,
    serialNumber: d.serialNumber ?? null,
    deviceName: d.deviceName ?? null,
    locationCode: d.locationCode ?? input.locationCodeFallback ?? null,
    employeeId: d.employeeId ?? null,
    employeeCode: d.employeeCode ?? null,
    employeeName: d.employeeName ?? null,
    biometricId: d.biometricId ?? null,
    occurrenceCount,
    isNew,
    details: d.details,
    lastDetectedAt: new Date().toISOString(),
  };
  socketIO.emit('biometric:mismatch', payload);

  return { id, isNew, occurrenceCount };
}

export async function recordMismatchDrafts(
  drafts: MismatchDraft[],
  locationCodeFallback?: string | null
): Promise<{ created: number; repeated: number }> {
  let created = 0;
  let repeated = 0;
  for (const d of drafts) {
    try {
      const outcome = await recordMismatch({ draft: d, locationCodeFallback });
      if (outcome.isNew) created++;
      else repeated++;
    } catch (err: any) {
      deviceLog.warn('Could not record mismatch', { code: 'DB_FAILURE', detail: err?.sqlMessage || err?.message });
    }
  }
  return { created, repeated };
}

// ─── Hooks for the ingest pipeline ───────────────────────────────────────────

export interface PunchMismatchInput {
  punchId: string;
  serialNumber: string;
  enrollmentNumber: string;
  normalizedId: string;
  mappingStatus: string;
  employeeId: string | null;
  punchTimeUtc: Date;
  candidates?: Array<{ employeeId: string; employeeCode?: string | null; fullName?: string | null }>;
}

async function loadDeviceLite(serialOrId: string): Promise<DeviceLite | null> {
  const device = await getDeviceConfig(serialOrId);
  if (!device) return null;
  const [rows]: any = await pool.query(
    `SELECT d.floorId, f.name AS floorName, d.sectionId, s.name AS sectionName
       FROM biometric_devices d
       LEFT JOIN floor f ON f.id = d.floorId
       LEFT JOIN section s ON s.id = d.sectionId
      WHERE d.id = ? LIMIT 1`,
    [device.id]
  ).catch(() => [[]]);
  return {
    id: device.id,
    serialNumber: device.serialNumber,
    name: device.name,
    locationCode: device.locationCode,
    floorId: rows[0]?.floorId ?? null,
    floorName: rows[0]?.floorName ?? null,
    sectionId: rows[0]?.sectionId ?? null,
    sectionName: rows[0]?.sectionName ?? null,
    isActive: device.isActive,
  };
}

async function loadEmployeeLite(employeeId: string): Promise<EmployeeLite | null> {
  const [rows]: any = await pool.query(
    `SELECT e.id, e.employeeCode, e.fullName, e.status, e.floorId, e.sectionId, e.departmentId,
            e.biometricDeviceEmployeeId, l.code AS locationCode
       FROM employee e
       LEFT JOIN location l ON l.id = e.locationId
      WHERE e.id = ? LIMIT 1`,
    [employeeId]
  );
  return rows[0] ?? null;
}

async function loadMappingLite(showroomCode: string | null, normalizedId: string): Promise<MappingLite | null> {
  if (!normalizedId) return null;
  const params: any[] = [normalizedId];
  let extra = '';
  if (showroomCode) {
    extra = ' AND m.showroomCode = ?';
    params.push(showroomCode);
  }
  const [rows]: any = await pool.query(
    `SELECT m.id, m.employeeId, m.enrollmentNumber, m.normalizedEnrollment, m.serialNumber, m.showroomCode, m.status
       FROM biometric_employee_mappings m
      WHERE m.normalizedEnrollment = ? ${extra}
      ORDER BY FIELD(m.status, 'ACTIVE', 'AMBIGUOUS') LIMIT 1`,
    params
  );
  return rows[0] ?? null;
}

async function loadDeviceUserLite(serialNumber: string, normalizedPin: string): Promise<DeviceUserLite | null> {
  const [rows]: any = await pool.query(
    `SELECT pin, normalizedPin, deviceName, employeeId
       FROM biometric_device_users
      WHERE serialNumber = ? AND normalizedPin = ? LIMIT 1`,
    [serialNumber, normalizedPin]
  );
  return rows[0] ?? null;
}

async function contextFor(input: PunchMismatchInput, device: DeviceLite | null): Promise<PunchContext> {
  const employee = input.employeeId ? await loadEmployeeLite(input.employeeId) : null;
  const mapping = await loadMappingLite(device?.locationCode ?? null, input.normalizedId);
  const deviceUser = input.normalizedId ? await loadDeviceUserLite(input.serialNumber, input.normalizedId) : null;

  let assignedDevice: DeviceLite | null = null;
  if (mapping?.serialNumber && mapping.serialNumber !== input.serialNumber) {
    assignedDevice = await loadDeviceLite(mapping.serialNumber);
  }

  return { device, employee, mapping, deviceUser, assignedDevice };
}

/**
 * Called by the ingest pipeline for every stored punch. Kept cheap for the
 * happy path: a fully agreeing punch performs no writes and no extra reads
 * beyond the mapping/user lookups the rules need.
 */
export async function detectPunchMismatches(input: PunchMismatchInput): Promise<{ examined: number; created: number; repeated: number }> {
  try {
    const device = await loadDeviceLite(input.serialNumber);
    const ctx = await contextFor(input, device);
    const drafts = classifyPunchMismatch(
      {
        punchId: input.punchId,
        serialNumber: input.serialNumber,
        enrollmentNumber: input.enrollmentNumber,
        normalizedId: input.normalizedId,
        mappingStatus: input.mappingStatus,
        employeeId: input.employeeId,
        punchTimeUtc: input.punchTimeUtc,
        candidates: input.candidates,
      },
      ctx
    );
    if (drafts.length === 0) return { examined: 1, created: 0, repeated: 0 };
    const outcome = await recordMismatchDrafts(drafts, device?.locationCode ?? null);
    return { examined: 1, created: outcome.created, repeated: outcome.repeated };
  } catch (err: any) {
    deviceLog.warn('Punch mismatch detection failed', { code: 'DB_FAILURE', detail: err?.sqlMessage || err?.message });
    return { examined: 1, created: 0, repeated: 0 };
  }
}

async function deviceBySerialMap(locationCode?: string | null): Promise<{
  bySerial: Map<string, DeviceLite>;
  serialsByShowroom: Map<string, string[]>;
}> {
  const params: any[] = [];
  let where = '';
  if (locationCode && locationCode !== 'ALL') {
    where = 'WHERE d.locationCode = ?';
    params.push(locationCode);
  }
  const [rows]: any = await pool.query(
    `SELECT d.id, d.serialNumber, d.name, d.locationCode, d.floorId, f.name AS floorName,
            d.sectionId, s.name AS sectionName, d.isActive
       FROM biometric_devices d
       LEFT JOIN floor f ON f.id = d.floorId
       LEFT JOIN section s ON s.id = d.sectionId
       ${where}`,
    params
  );

  const bySerial = new Map<string, DeviceLite>();
  const serialsByShowroom = new Map<string, string[]>();
  for (const row of rows) {
    const device: DeviceLite = {
      id: row.id,
      serialNumber: row.serialNumber,
      name: row.name,
      locationCode: row.locationCode,
      floorId: row.floorId ?? null,
      floorName: row.floorName ?? null,
      sectionId: row.sectionId ?? null,
      sectionName: row.sectionName ?? null,
      isActive: Boolean(Number(row.isActive ?? 1)),
    };
    bySerial.set(row.serialNumber, device);
    const list = serialsByShowroom.get(row.locationCode || 'ALL') ?? [];
    if (device.isActive !== false) list.push(row.serialNumber);
    serialsByShowroom.set(row.locationCode || 'ALL', list);
  }
  return { bySerial, serialsByShowroom };
}

/**
 * Re-evaluate the user list of one terminal after USERINFO was ingested.
 * Returns how many rows were checked and how many issues were recorded.
 */
export async function detectUserListMismatches(serialNumber: string): Promise<{
  examined: number;
  created: number;
  repeated: number;
}> {
  const { bySerial } = await deviceBySerialMap();
  const device = bySerial.get(serialNumber.trim());
  if (!device) return { examined: 0, created: 0, repeated: 0 };

  const [users]: any = await pool.query(
    `SELECT pin, normalizedPin, deviceName, employeeId FROM biometric_device_users WHERE serialNumber = ?`,
    [device.serialNumber]
  );

  const [mappingRows]: any = await pool.query(
    `SELECT m.id, m.employeeId, m.enrollmentNumber, m.normalizedEnrollment, m.serialNumber, m.showroomCode, m.status
       FROM biometric_employee_mappings m
      WHERE m.showroomCode = ? AND m.status IN ('ACTIVE','AMBIGUOUS')`,
    [device.locationCode || 'BEL']
  );
  const mappingByPin = new Map<string, MappingLite>();
  for (const m of mappingRows) mappingByPin.set(String(m.normalizedEnrollment), m);

  const employeeIds = new Set<string>();
  for (const user of users) {
    const mapped = mappingByPin.get(String(user.normalizedPin));
    const id = mapped?.employeeId || user.employeeId;
    if (id) employeeIds.add(id);
  }
  const employees = new Map<string, EmployeeLite>();
  if (employeeIds.size > 0) {
    const [empRows]: any = await pool.query(
      `SELECT id, employeeCode, fullName, status, floorId, sectionId, departmentId, biometricDeviceEmployeeId
         FROM employee WHERE id IN (?)`,
      [[...employeeIds]]
    );
    for (const emp of empRows) employees.set(emp.id, emp);
  }

  const drafts: MismatchDraft[] = [];
  for (const user of users) {
    const mapping = mappingByPin.get(String(user.normalizedPin)) ?? null;
    const employeeId = mapping?.employeeId || user.employeeId || null;
    const employee = employeeId ? employees.get(employeeId) ?? null : null;
    drafts.push(...classifyDeviceUser({ device, deviceUser: user, mapping, employee }));
  }

  const outcome = await recordMismatchDrafts(drafts, device.locationCode);
  return { examined: users.length, ...outcome };
}

// ─── Full sweep ──────────────────────────────────────────────────────────────

export interface MismatchScanResult {
  scanned: number;
  created: number;
  repeated: number;
  byType: Record<string, number>;
  sinceDays: number;
  durationMs: number;
}

/**
 * The scheduled / operator-triggered sweep:
 *   1. suffix collisions across mappings (duplicate biometric ids);
 *   2. every terminal user list vs mappings and employee masters;
 *   3. active mappings with no presence on their showroom terminals;
 *   4. the recent punch window (device conflict, unknown user/device).
 */
export async function runFullMismatchScan(options: {
  detectedBy?: MismatchDetectedBy;
  sinceDays?: number;
  locationCode?: string | null;
  punchWindowLimit?: number;
} = {}): Promise<MismatchScanResult> {
  const started = Date.now();
  const sinceDays = Math.min(Math.max(Number(options.sinceDays) || 7, 1), 90);
  const scope = options.locationCode && options.locationCode !== 'ALL' ? options.locationCode : null;
  const result: MismatchScanResult = { scanned: 0, created: 0, repeated: 0, byType: {}, sinceDays, durationMs: 0 };

  const track = (drafts: MismatchDraft[]) => {
    for (const d of drafts) result.byType[d.type] = (result.byType[d.type] ?? 0) + 1;
    result.scanned += drafts.length;
  };

  const { bySerial, serialsByShowroom } = await deviceBySerialMap(scope);

  // ── 1 + 3. mappings: duplicate suffixes and not-synced ────────────────────
  const mappingParams: any[] = [];
  const mappingWhere: string[] = ["m.status IN ('ACTIVE','AMBIGUOUS')"];
  if (scope) {
    mappingWhere.push('m.showroomCode = ?');
    mappingParams.push(scope);
  }
  const [mappingRows]: any = await pool.query(
    `SELECT m.id, m.employeeId, m.enrollmentNumber, m.normalizedEnrollment, m.serialNumber, m.showroomCode, m.status,
            m.lastSixDigits,
            e.employeeCode, e.fullName, e.status AS empStatus, e.floorId, e.sectionId, e.departmentId, e.biometricDeviceEmployeeId
       FROM biometric_employee_mappings m
       JOIN employee e ON e.id = m.employeeId
      WHERE ${mappingWhere.join(' AND ')}`,
    mappingParams
  );

  const mappings: Array<{ mapping: MappingLite; employee: EmployeeLite; lastSix: string | null }> = mappingRows.map((row: any) => ({
    mapping: {
      id: row.id,
      employeeId: row.employeeId,
      enrollmentNumber: row.enrollmentNumber,
      normalizedEnrollment: row.normalizedEnrollment,
      serialNumber: row.serialNumber,
      showroomCode: row.showroomCode,
      status: row.status,
    },
    employee: {
      id: row.employeeId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      status: row.empStatus,
      floorId: row.floorId,
      sectionId: row.sectionId,
      departmentId: row.departmentId,
      biometricDeviceEmployeeId: row.biometricDeviceEmployeeId,
    },
    lastSix: row.lastSixDigits ?? null,
  }));

  const bySuffix = new Map<string, Array<{ mapping: MappingLite; employee: EmployeeLite }>>();
  for (const entry of mappings) {
    if (!entry.lastSix) continue;
    // One employee claiming a suffix twice (e.g. two pins) is not a duplicate.
    const list = bySuffix.get(entry.lastSix) ?? [];
    if (!list.some((existing) => existing.employee.id === entry.employee.id)) list.push(entry);
    bySuffix.set(entry.lastSix, list);
  }
  for (const [lastSix, group] of bySuffix) {
    if (group.length > 1) {
      const drafts = classifyDuplicateGroup({ lastSix, rows: group });
      track(drafts);
      const outcome = await recordMismatchDrafts(drafts);
      result.created += outcome.created;
      result.repeated += outcome.repeated;
    }
  }

  // ── 2. device user lists ──────────────────────────────────────────────────
  const userParams: any[] = [];
  let userWhere = '';
  if (scope) {
    userWhere = 'WHERE u.locationCode = ?';
    userParams.push(scope);
  }
  const [deviceUsers]: any = await pool.query(
    `SELECT u.serialNumber, u.pin, u.normalizedPin, u.deviceName, u.employeeId, u.locationCode
       FROM biometric_device_users u ${userWhere}`,
    userParams
  );

  const mappingByShowroomPin = new Map<string, MappingLite>();
  for (const entry of mappings) {
    mappingByShowroomPin.set(`${entry.mapping.showroomCode}:${entry.mapping.normalizedEnrollment}`, entry.mapping);
  }

  const employeeIds = new Set<string>();
  for (const user of deviceUsers) {
    const mapped = mappingByShowroomPin.get(`${user.locationCode}:${user.normalizedPin}`);
    const id = mapped?.employeeId || user.employeeId;
    if (id) employeeIds.add(id);
  }
  const employees = new Map<string, EmployeeLite>();
  if (employeeIds.size > 0) {
    const [empRows]: any = await pool.query(
      `SELECT id, employeeCode, fullName, status, floorId, sectionId, departmentId, biometricDeviceEmployeeId
         FROM employee WHERE id IN (?)`,
      [[...employeeIds]]
    );
    for (const emp of empRows) employees.set(emp.id, emp);
  }

  const pinsBySerial = new Map<string, Set<string>>();
  const userDrafts: MismatchDraft[] = [];
  for (const user of deviceUsers) {
    const serial = String(user.serialNumber);
    const pins = pinsBySerial.get(serial) ?? new Set<string>();
    pins.add(String(user.normalizedPin));
    pinsBySerial.set(serial, pins);

    const device = bySerial.get(serial);
    if (!device) continue;
    const mapping = mappingByShowroomPin.get(`${user.locationCode}:${user.normalizedPin}`) ?? null;
    const employeeId = mapping?.employeeId || user.employeeId || null;
    const employee = employeeId ? employees.get(employeeId) ?? null : null;
    userDrafts.push(
      ...classifyDeviceUser({ device, deviceUser: { pin: user.pin, normalizedPin: user.normalizedPin, deviceName: user.deviceName, employeeId: user.employeeId }, mapping, employee })
    );
  }
  track(userDrafts);
  {
    const outcome = await recordMismatchDrafts(userDrafts);
    result.created += outcome.created;
    result.repeated += outcome.repeated;
  }

  // ── 3. not synced ─────────────────────────────────────────────────────────
  const notSyncedDrafts: MismatchDraft[] = [];
  for (const entry of mappings) {
    if (entry.mapping.status !== 'ACTIVE') continue;
    const showroom = entry.mapping.showroomCode || '';
    const serials = serialsByShowroom.get(showroom) ?? [];
    const draftFound = classifyNotSynced({
      mapping: entry.mapping,
      employee: entry.employee,
      showroomSerials: serials,
      pinsBySerial,
    });
    if (draftFound) notSyncedDrafts.push(draftFound);
  }
  track(notSyncedDrafts);
  {
    const outcome = await recordMismatchDrafts(notSyncedDrafts);
    result.created += outcome.created;
    result.repeated += outcome.repeated;
  }

  // ── 4. recent punches ─────────────────────────────────────────────────────
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const punchParams: any[] = [toUtcMysqlString(since)];
  let punchWhere = 'r.punchTimeUtc >= ?';
  if (scope) {
    punchWhere += " AND (d.locationCode = ? OR r.deviceId IS NULL)";
    punchParams.push(scope);
  }
  const [punches]: any = await pool.query(
    `SELECT r.id, r.serialNumber, r.enrollmentNumber, r.normalizedId, r.mappingStatus, r.employeeId,
            r.mappingCandidates, r.punchTimeUtc, r.deviceId
       FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON d.id = r.deviceId
      WHERE ${punchWhere}
      ORDER BY r.punchTimeUtc DESC
      LIMIT ?`,
    [...punchParams, Math.min(Math.max(Number(options.punchWindowLimit) || 2000, 1), 10_000)]
  );

  const punchEmpIds = new Set<string>();
  for (const punch of punches) if (punch.employeeId) punchEmpIds.add(punch.employeeId);
  const punchEmployees = new Map<string, EmployeeLite>();
  if (punchEmpIds.size > 0) {
    const [empRows]: any = await pool.query(
      `SELECT id, employeeCode, fullName, status, floorId, sectionId, departmentId, biometricDeviceEmployeeId
         FROM employee WHERE id IN (?)`,
      [[...punchEmpIds]]
    );
    for (const emp of empRows) punchEmployees.set(emp.id, emp);
  }

  const punchDrafts: MismatchDraft[] = [];
  for (const punch of punches) {
    const serial = String(punch.serialNumber);
    const device = bySerial.get(serial) ?? null;
    const instant = fromUtcMysqlString(punch.punchTimeUtc);
    const mapping = mappingByShowroomPin.get(`${device?.locationCode ?? ''}:${punch.normalizedId}`) ?? null;
    const employee = punch.employeeId ? punchEmployees.get(punch.employeeId) ?? null : null;
    let assignedDevice: DeviceLite | null = null;
    if (mapping?.serialNumber && mapping.serialNumber !== serial) {
      assignedDevice = bySerial.get(mapping.serialNumber) ?? null;
    }
    const deviceUser = punch.normalizedId
      ? { pin: punch.enrollmentNumber, normalizedPin: punch.normalizedId, deviceName: null, employeeId: punch.employeeId }
      : null;

    punchDrafts.push(
      ...classifyPunchMismatch(
        {
          punchId: punch.id,
          serialNumber: serial,
          enrollmentNumber: punch.enrollmentNumber,
          normalizedId: punch.normalizedId || '',
          mappingStatus: punch.mappingStatus,
          employeeId: punch.employeeId,
          punchTimeUtc: instant,
          candidates: parseCandidates(punch.mappingCandidates),
        },
        { device, employee, mapping, deviceUser, assignedDevice }
      )
    );
  }
  track(punchDrafts);
  {
    const outcome = await recordMismatchDrafts(punchDrafts);
    result.created += outcome.created;
    result.repeated += outcome.repeated;
  }

  result.durationMs = Date.now() - started;
  return result;
}

function parseCandidates(value: unknown): PunchVantage['candidates'] {
  if (!value) return undefined;
  let parsed: any = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed
    .map((entry) => {
      if (typeof entry === 'string') return { employeeId: entry };
      if (entry && typeof entry === 'object' && entry.employeeId) {
        return { employeeId: entry.employeeId, employeeCode: entry.employeeCode, fullName: entry.fullName };
      }
      return null;
    })
    .filter(Boolean) as PunchVantage['candidates'];
}

// ─── Read model ──────────────────────────────────────────────────────────────

export interface MismatchListFilters {
  status?: string;
  types?: string[];
  severities?: string[];
  locationCode?: string;
  deviceId?: string;
  serialNumber?: string;
  floorId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeQuery?: string;
  biometricId?: string;
  from?: string;
  to?: string;
  sort?: 'lastDetectedAt' | 'firstDetectedAt' | 'severity' | 'occurrenceCount';
  direction?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

function mapMismatchRow(row: any): MismatchRecordRow {
  return {
    id: row.id,
    mismatchType: row.mismatchType,
    severity: row.severity,
    status: row.status,
    detectedBy: row.detectedBy,
    dedupeKey: row.dedupeKey,
    deviceId: row.deviceId ?? null,
    serialNumber: row.serialNumber ?? null,
    deviceName: row.deviceName ?? null,
    floorId: row.floorId ?? null,
    floorName: row.floorName ?? null,
    sectionId: row.sectionId ?? null,
    sectionName: row.sectionName ?? null,
    departmentId: row.departmentId ?? null,
    locationCode: row.locationCode ?? null,
    employeeId: row.employeeId ?? null,
    employeeCode: row.employeeCode ?? null,
    employeeName: row.employeeName ?? null,
    biometricId: row.biometricId ?? null,
    punchId: row.punchId ?? null,
    punchTime: row.punchTime ? new Date(row.punchTime).toISOString() : null,
    expected: parseJson(row.expected),
    received: parseJson(row.received),
    details: row.details ?? null,
    occurrenceCount: Number(row.occurrenceCount ?? 1),
    firstDetectedAt: row.firstDetectedAt ? new Date(row.firstDetectedAt).toISOString() : null,
    lastDetectedAt: row.lastDetectedAt ? new Date(row.lastDetectedAt).toISOString() : null,
    resolvedById: row.resolvedById ?? null,
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null,
    resolutionAction: row.resolutionAction ?? null,
    remark: row.remark ?? null,
  };
}

function mismatchWhere(filters: MismatchListFilters): { where: string; params: any[] } {
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.status && filters.status !== 'ALL') {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.types && filters.types.length > 0) {
    where.push(`mismatchType IN (${filters.types.map(() => '?').join(',')})`);
    params.push(...filters.types);
  }
  if (filters.severities && filters.severities.length > 0) {
    where.push(`severity IN (${filters.severities.map(() => '?').join(',')})`);
    params.push(...filters.severities);
  }
  if (filters.locationCode && filters.locationCode !== 'ALL') {
    where.push('locationCode = ?');
    params.push(filters.locationCode);
  }
  if (filters.deviceId) {
    where.push('deviceId = ?');
    params.push(filters.deviceId);
  }
  if (filters.serialNumber) {
    where.push('serialNumber = ?');
    params.push(filters.serialNumber);
  }
  if (filters.floorId) {
    where.push('floorId = ?');
    params.push(filters.floorId);
  }
  if (filters.sectionId) {
    where.push('sectionId = ?');
    params.push(filters.sectionId);
  }
  if (filters.departmentId) {
    where.push('departmentId = ?');
    params.push(filters.departmentId);
  }
  if (filters.employeeQuery) {
    const like = `%${String(filters.employeeQuery).trim()}%`;
    where.push('(employeeCode LIKE ? OR employeeName LIKE ? OR biometricId LIKE ? OR details LIKE ?)');
    params.push(like, like, like, like);
  }
  if (filters.biometricId) {
    where.push('biometricId = ?');
    params.push(String(filters.biometricId).replace(/^0+/, '') || String(filters.biometricId));
  }
  if (filters.from) {
    where.push('lastDetectedAt >= ?');
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    where.push('lastDetectedAt <= ?');
    params.push(`${filters.to} 23:59:59.999`);
  }
  return { where: where.join(' AND '), params };
}

export async function listMismatchRecords(filters: MismatchListFilters): Promise<{
  rows: MismatchRecordRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { where, params } = mismatchWhere(filters);
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
  const sortColumn = filters.sort === 'firstDetectedAt' || filters.sort === 'severity' || filters.sort === 'occurrenceCount'
    ? filters.sort
    : 'lastDetectedAt';
  const direction = filters.direction === 'asc' ? 'ASC' : 'DESC';

  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM biometric_mismatch_records WHERE ${where}`,
    params
  );

  const [rows]: any = await pool.query(
    `SELECT * FROM biometric_mismatch_records
      WHERE ${where}
      ORDER BY FIELD(severity, 'CRITICAL','HIGH','MEDIUM','LOW'), ${sortColumn} ${direction}, id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params
  );

  return {
    rows: rows.map(mapMismatchRow),
    total: Number(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

export async function getMismatchRecord(id: string, locationCode?: string | null): Promise<MismatchRecordRow | null> {
  const params: any[] = [id];
  let where = 'id = ?';
  if (locationCode && locationCode !== 'ALL') {
    where += ' AND locationCode = ?';
    params.push(locationCode);
  }
  const [rows]: any = await pool.query(`SELECT * FROM biometric_mismatch_records WHERE ${where} LIMIT 1`, params);
  return rows[0] ? mapMismatchRow(rows[0]) : null;
}

export interface MismatchSummary {
  totalOpen: number;
  totalResolved: number;
  totalIgnored: number;
  byType: Array<{ type: string; label: string; open: number }>;
  notSyncedEmployees: number;
  unknownUsers: number;
  devicesTotal: number;
  devicesOnline: number;
  devicesOffline: number;
  punchesToday: number;
  activeMappings: number;
  lastScanAt: string | null;
}

export async function getMismatchSummary(locationCode?: string | null): Promise<MismatchSummary> {
  const scope = locationCode && locationCode !== 'ALL' ? locationCode : null;
  const locParam = scope ? [scope] : [];

  const [typeRows]: any = await pool.query(
    `SELECT mismatchType, status, COUNT(*) AS count FROM biometric_mismatch_records
      ${scope ? 'WHERE locationCode = ?' : ''}
      GROUP BY mismatchType, status`,
    locParam
  );

  let totalOpen = 0;
  let totalResolved = 0;
  let totalIgnored = 0;
  const tallyOpen = new Map<string, number>();
  for (const row of typeRows) {
    const type = String(row.mismatchType);
    const count = Number(row.count);
    if (row.status === 'OPEN') {
      totalOpen += count;
      tallyOpen.set(type, (tallyOpen.get(type) ?? 0) + count);
    } else if (row.status === 'RESOLVED') totalResolved += count;
    else if (row.status === 'IGNORED') totalIgnored += count;
  }

  const [deviceRows]: any = await pool.query(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'CONNECTED' THEN 1 ELSE 0 END) AS online,
        SUM(CASE WHEN status <> 'CONNECTED' THEN 1 ELSE 0 END) AS offline
       FROM biometric_devices WHERE isActive = 1 ${scope ? 'AND locationCode = ?' : ''}`,
    locParam
  );

  const [punchRows]: any = await pool.query(
    `SELECT COUNT(*) AS count FROM biometric_raw_punches r
      WHERE DATE(COALESCE(r.punchTime, r.punchTimeUtc)) = CURDATE()`
  );

  const [mappingRows]: any = await pool.query(
    `SELECT COUNT(*) AS count FROM biometric_employee_mappings
      WHERE status = 'ACTIVE' ${scope ? 'AND showroomCode = ?' : ''}`,
    locParam
  );

  const [scanRow]: any = await pool.query(
    `SELECT MAX(lastDetectedAt) AS lastScanAt FROM biometric_mismatch_records ${scope ? 'WHERE locationCode = ?' : ''}`,
    locParam
  );

  const byType = MISMATCH_TYPES.map((type) => ({
    type,
    label: MISMATCH_TYPE_LABELS[type],
    open: tallyOpen.get(type) ?? 0,
  }));

  return {
    totalOpen,
    totalResolved,
    totalIgnored,
    byType,
    notSyncedEmployees: tallyOpen.get('NOT_SYNCED') ?? 0,
    unknownUsers: (tallyOpen.get('UNKNOWN_USER') ?? 0),
    devicesTotal: Number(deviceRows[0]?.total ?? 0),
    devicesOnline: Number(deviceRows[0]?.online ?? 0),
    devicesOffline: Number(deviceRows[0]?.offline ?? 0),
    punchesToday: Number(punchRows[0]?.count ?? 0),
    activeMappings: Number(mappingRows[0]?.count ?? 0),
    lastScanAt: scanRow[0]?.lastScanAt ? new Date(scanRow[0].lastScanAt).toISOString() : null,
  };
}

/** Mark a record decided. Only mismatchResolution should call this. */
export async function markMismatchDecided(params: {
  id: string;
  status: 'RESOLVED' | 'IGNORED';
  action: string;
  actorId: string;
  remark?: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE biometric_mismatch_records
        SET status = ?, resolutionAction = ?, resolvedById = ?, resolvedAt = NOW(3), remark = ?, updatedAt = NOW(3)
      WHERE id = ?`,
    [params.status, params.action, params.actorId, params.remark ?? null, params.id]
  );
  socketIO.emit('biometric:mismatch_resolved', {
    id: params.id,
    status: params.status,
    action: params.action,
    resolvedBy: params.actorId,
    at: new Date().toISOString(),
  });
}

export function describeMismatch(d: MismatchRecordRow): string {
  return `${MISMATCH_TYPE_LABELS[d.mismatchType] ?? d.mismatchType}: ${d.details ?? ''}`.slice(0, 500);
}
