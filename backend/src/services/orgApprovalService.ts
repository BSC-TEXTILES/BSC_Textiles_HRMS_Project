import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { AuditService } from './auditService.js';
import { cacheService } from './cacheService.js';
import { container } from '../core/container/ServiceContainer.js';
import { socketIO } from '../socket.js';
import { validateChangeRequest } from './orgValidation.js';
import {
  OrgError,
  assertCanCreateRequest,
  assertCanOverride,
  assertCanViewRequest,
  assertStageReviewer,
  getApprovalPolicy,
  getStageRoles,
  resolveScope,
  stageLabel,
  stageRequiresPreliminary,
  type ApprovalPolicy,
  type OrgRequestAction,
  type OrgRequestType,
  type OrgStageName,
} from './orgPermissionService.js';
import { buildScope } from './organizationService.js';

/**
 * Organization change-request lifecycle:
 *
 *   DRAFT --submit--> PENDING --manager approve--> PENDING(HR) --HR approve--> APPLIED
 *                        |                                |
 *                        +--request changes--> CHANGES_REQUESTED --resubmit--> PENDING
 *                        +--reject-----------> REJECTED (never applied)
 *                        +--cancel-----------> CANCELLED
 *
 * Only the final `APPLIED` transition writes to the approved topology tables
 * (location / floor / department / section / sellingpoint / employee /
 * user), and it does so inside the same database transaction as the final
 * approval decision. A failure rolls the whole thing back and leaves the
 * approved organization untouched.
 */

export interface ChangeRequestRecord {
  id: string;
  requestCode: string;
  requestType: OrgRequestType;
  action: OrgRequestAction;
  title: string;
  reason: string;
  locationId: string | null;
  floorId: string | null;
  departmentId: string | null;
  sectionId: string | null;
  workAreaId: string | null;
  employeeId: string | null;
  effectiveDate: string | null;
  payload: any;
  existingSnapshot: any;
  status: string;
  currentStage: string;
  requestedById: string;
  submittedAt: string | null;
  managerReviewerId: string | null;
  managerReviewedAt: string | null;
  managerRemarks: string | null;
  hrReviewerId: string | null;
  hrReviewedAt: string | null;
  hrRemarks: string | null;
  appliedAt: string | null;
  appliedById: string | null;
  applyError: string | null;
  isEmergencyOverride: number;
  overrideJustification: string | null;
  overrideById: string | null;
  overrideAt: string | null;
  dedupKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChangeRequestInput {
  requestType: OrgRequestType;
  action: OrgRequestAction;
  reason: string;
  title?: string;
  locationId?: string | null;
  floorId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
  workAreaId?: string | null;
  employeeId?: string | null;
  effectiveDate?: string | null;
  payload: any;
}

const MANAGER_STAGES: string[] = ['LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER'];

/* ---------------------------------------------------------------------------------
 * Infrastructure helpers
 * --------------------------------------------------------------------------------- */

async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = (await pool.getConnection()) as PoolConnection;
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* rollback failure must not mask the original error */
    }
    throw error;
  } finally {
    conn.release();
  }
}

function newId(): string {
  return `c${crypto.randomBytes(12).toString('hex')}`;
}

function parseJson(value: any): any {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function isDuplicateCodeError(error: any): boolean {
  return (
    error?.code === 'ER_DUP_ENTRY' &&
    typeof error?.message === 'string' &&
    error.message.includes('requestCode')
  );
}

function isDuplicateDedupError(error: any): boolean {
  return (
    error?.code === 'ER_DUP_ENTRY' &&
    typeof error?.message === 'string' &&
    error.message.includes('dedupKey')
  );
}

async function nextRequestCode(conn: PoolConnection, offset = 0): Promise<string> {
  const year = new Date().getFullYear();
  const [rows]: any = await conn.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(requestCode, 10) AS UNSIGNED)), 0) AS maxSeq
       FROM orgchangerequest WHERE requestCode LIKE ?`,
    [`ORG-${year}-%`]
  );
  const next = Number(rows?.[0]?.maxSeq || 0) + 1 + offset;
  return `ORG-${year}-${String(next).padStart(6, '0')}`;
}

function computeDedupKey(
  input: CreateChangeRequestInput,
  locationId: string | null,
  requestedById: string
): string {
  const material = JSON.stringify([
    input.requestType,
    input.action,
    locationId,
    input.floorId || null,
    input.departmentId || null,
    input.sectionId || null,
    input.workAreaId || null,
    input.employeeId || null,
    input.payload,
    requestedById,
  ]);
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 40);
}

async function selectForUpdate(
  conn: PoolConnection,
  id: string
): Promise<ChangeRequestRecord | null> {
  const [rows]: any = await conn.query(
    'SELECT * FROM orgchangerequest WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows && rows.length > 0 ? (rows[0] as ChangeRequestRecord) : null;
}

async function findById(id: string): Promise<ChangeRequestRecord | null> {
  const [rows]: any = await pool.query('SELECT * FROM orgchangerequest WHERE id = ?', [id]);
  return rows && rows.length > 0 ? (rows[0] as ChangeRequestRecord) : null;
}

function invalidateCaches(): void {
  cacheService.invalidateLocations();
  cacheService.invalidateDepartments();
  cacheService.invalidatePrefix('org:');
  cacheService.invalidateDashboard();
}

function emitOrganizationChanged(payload: {
  kind: string;
  locationId?: string | null;
  requestId: string;
  requestCode: string;
  status: string;
  actorId: string;
}): void {
  const event = { ...payload, at: new Date().toISOString() };
  socketIO.to('organization').emit('organization:changed', event);
  if (payload.locationId) {
    socketIO.to(`location:${payload.locationId}`).emit('organization:changed', event);
  }
}

async function notify(
  event: Parameters<typeof container.notificationService.publishEvent>[0],
  options?: { skipDeduplication?: boolean }
): Promise<void> {
  try {
    await container.notificationService.publishEvent(event, {
      skipDeduplication: true,
      ...options,
    });
  } catch (error) {
    console.error('[orgApproval] Notification publish failed:', error);
  }
}

async function notifyUser(userId: string, title: string, message: string, type: 'INFO' | 'WARNING' | 'DANGER' = 'INFO'): Promise<void> {
  try {
    await container.notificationService.notifyUser(userId, title, message, type);
  } catch (error) {
    console.error('[orgApproval] Direct notification failed:', error);
  }
}

async function audit(entry: {
  user: NonNullable<AuthRequest['user']>;
  action: string;
  entityId: string;
  locationId?: string | null;
  before?: any;
  after?: any;
  tags?: string[];
}): Promise<void> {
  try {
    await AuditService.log({
      userId: entry.user.id,
      locationId: entry.locationId || entry.user.locationId,
      action: entry.action,
      entityType: 'OrganizationChangeRequest',
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      tags: entry.tags || ['organization', 'approval-workflow'],
    });
  } catch (error) {
    console.error('[orgApproval] Audit write failed:', error);
  }
}

/* ---------------------------------------------------------------------------------
 * Stage planning
 * --------------------------------------------------------------------------------- */

async function resolvePreliminaryStage(conn: PoolConnection, row: {
  requestType: OrgRequestType;
  departmentId?: string | null;
  floorId?: string | null;
  locationId?: string | null;
}): Promise<OrgStageName> {
  if (row.departmentId) {
    const [dept]: any = await conn.query('SELECT managerId FROM department WHERE id = ?', [
      row.departmentId,
    ]);
    if (dept?.[0]?.managerId) return 'DEPARTMENT_MANAGER';
  }
  if (row.floorId) {
    const [floor]: any = await conn.query('SELECT floorManagerId FROM floor WHERE id = ?', [
      row.floorId,
    ]);
    if (floor?.[0]?.floorManagerId) return 'FLOOR_MANAGER';
  }
  if (row.locationId) {
    const [loc]: any = await conn.query('SELECT managerId FROM location WHERE id = ?', [
      row.locationId,
    ]);
    if (loc?.[0]?.managerId) return 'LOCATION_MANAGER';
  }
  return 'LOCATION_MANAGER';
}

async function planStages(
  conn: PoolConnection,
  row: { requestType: OrgRequestType; departmentId?: string | null; floorId?: string | null; locationId?: string | null },
  policy: ApprovalPolicy,
  startSequence: number
): Promise<Array<{ seq: number; stageName: OrgStageName }>> {
  const stages: Array<{ seq: number; stageName: OrgStageName }> = [];
  if (stageRequiresPreliminary(policy, row.requestType)) {
    stages.push({
      seq: startSequence,
      stageName: await resolvePreliminaryStage(conn, row),
    });
  }
  stages.push({ seq: startSequence + stages.length, stageName: 'HR' });
  return stages;
}

/* ---------------------------------------------------------------------------------
 * Create / submit / edit / cancel
 * --------------------------------------------------------------------------------- */

export async function createChangeRequest(
  input: CreateChangeRequestInput,
  user: NonNullable<AuthRequest['user']>,
  options: { submit?: boolean } = {}
): Promise<ChangeRequestRecord> {
  const policy = await getApprovalPolicy();
  const locationId = input.locationId || (input.payload?.locationId ?? null);

  await assertCanCreateRequest(user, input.requestType, locationId, policy);

  if (!input.reason || input.reason.trim().length < 5) {
    throw new OrgError(400, 'A reason for the change is required (at least 5 characters)');
  }

  const effectiveLocationId =
    input.requestType === 'ADMIN_ACCOUNT' ? null : locationId ? String(locationId) : null;

  // Structural / allocation integrity + duplicate-pending conflict checks.
  if (input.requestType !== 'ADMIN_ACCOUNT') {
    await validateChangeRequest({
      requestType: input.requestType,
      action: input.action,
      payload: input.payload,
      locationId: effectiveLocationId,
      floorId: input.floorId,
      departmentId: input.departmentId,
      sectionId: input.sectionId,
      workAreaId: input.workAreaId,
      employeeId: input.employeeId,
    });
  } else {
    await validateChangeRequest({
      requestType: input.requestType,
      action: input.action,
      payload: input.payload,
      locationId: null,
    });
  }

  const title =
    (input.title && input.title.trim()) ||
    defaultTitle(input.requestType, input.action, input.payload);
  const dedupKey = computeDedupKey(input, effectiveLocationId, user.id);

  const created = await withTransaction(async (conn) => {
    const [dupes]: any = await conn.query(
      `SELECT id, requestCode FROM orgchangerequest
        WHERE dedupKey = ? AND status IN ('DRAFT','PENDING','CHANGES_REQUESTED')`,
      [dedupKey]
    );
    if (dupes && dupes.length > 0) {
      throw new OrgError(
        409,
        `An identical request (${dupes[0].requestCode}) has already been raised and is still open`
      );
    }

    const id = newId();
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const requestCode = await nextRequestCode(conn, attempt);
      try {
        await conn.query(
          `INSERT INTO orgchangerequest
             (id, requestCode, requestType, action, title, reason, locationId, floorId,
              departmentId, sectionId, workAreaId, employeeId, effectiveDate, payload,
              existingSnapshot, status, currentStage, requestedById, dedupKey, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'NONE', ?, ?, NOW(3), NOW(3))`,
          [
            id,
            requestCode,
            input.requestType,
            input.action,
            title,
            input.reason.trim(),
            effectiveLocationId,
            input.floorId || null,
            input.departmentId || null,
            input.sectionId || null,
            input.workAreaId || null,
            input.employeeId || null,
            input.effectiveDate || null,
            JSON.stringify(input.payload || {}),
            JSON.stringify(await buildSnapshot(input, effectiveLocationId)),
            user.id,
            dedupKey,
          ]
        );
        break;
      } catch (error: any) {
        if (isDuplicateCodeError(error) && attempt < 5) {
          attempt += 1;
          continue;
        }
        if (isDuplicateDedupError(error)) {
          throw new OrgError(
            409,
            'An identical request has already been raised and is still open'
          );
        }
        throw error;
      }
    }

    const row = await selectForUpdate(conn, id);
    if (!row) throw new OrgError(500, 'Failed to create the change request');
    return row;
  });

  await audit({
    user,
    action: 'ORG_REQUEST_CREATED',
    entityId: created.id,
    locationId: effectiveLocationId,
    after: {
      requestCode: created.requestCode,
      requestType: created.requestType,
      action: created.action,
      title: created.title,
    },
  });

  if (options.submit !== false) {
    return submitChangeRequest(created.id, user);
  }
  return created;
}

async function buildSnapshot(
  input: CreateChangeRequestInput,
  locationId: string | null
): Promise<any> {
  const snapshot: any = { capturedAt: new Date().toISOString() };
  try {
    if (input.employeeId) {
      const [rows]: any = await pool.query(
        `SELECT id, employeeCode, fullName, status, locationId, floorId, departmentId, sectionId
           FROM employee WHERE id = ?`,
        [input.employeeId]
      );
      snapshot.employee = rows?.[0] || null;
    }
    if (input.departmentId) {
      const [rows]: any = await pool.query(
        'SELECT id, name, code, floorId, managerId, status FROM department WHERE id = ?',
        [input.departmentId]
      );
      snapshot.department = rows?.[0] || null;
    }
    if (input.sectionId) {
      const [rows]: any = await pool.query(
        'SELECT id, name, code, floorId, departmentId, supervisorId, status FROM section WHERE id = ?',
        [input.sectionId]
      );
      snapshot.section = rows?.[0] || null;
    }
    if (input.floorId) {
      const [rows]: any = await pool.query(
        'SELECT id, name, floorNumber, floorManagerId, status FROM floor WHERE id = ?',
        [input.floorId]
      );
      snapshot.floor = rows?.[0] || null;
    }
    if (input.workAreaId) {
      const [rows]: any = await pool.query(
        'SELECT id, name, code, sectionId, floorId, managerId, status FROM sellingpoint WHERE id = ?',
        [input.workAreaId]
      );
      snapshot.workArea = rows?.[0] || null;
    }
    if (locationId) {
      const [rows]: any = await pool.query(
        'SELECT id, code, name, status FROM location WHERE id = ?',
        [locationId]
      );
      snapshot.location = rows?.[0] || null;
    }
  } catch (error) {
    console.error('[orgApproval] Snapshot capture failed:', error);
  }
  return snapshot;
}

function defaultTitle(requestType: OrgRequestType, action: OrgRequestAction, payload: any): string {
  const name = payload?.name || payload?.fullName || '';
  const verbs: Record<string, string> = {
    CREATE: 'Create',
    UPDATE: 'Update',
    DEACTIVATE: 'Deactivate',
    ACTIVATE: 'Activate',
    ASSIGN: 'Assign',
    TRANSFER: 'Transfer',
    REASSIGN: 'Assign manager for',
    PROVISION: 'Provision',
  };
  const nouns: Record<string, string> = {
    LOCATION: 'store location',
    FLOOR: 'floor',
    DEPARTMENT: 'department',
    SECTION: 'section',
    WORK_AREA: 'work area / counter',
    EMPLOYEE_ALLOCATION: 'employee allocation',
    EMPLOYEE_TRANSFER: 'employee transfer',
    MANAGER_ASSIGNMENT: 'manager assignment',
    ADMIN_ACCOUNT: 'administrative account',
  };
  return `${verbs[action] || action} ${nouns[requestType] || requestType}${name ? `: ${name}` : ''}`.trim();
}

export async function submitChangeRequest(
  id: string,
  user: NonNullable<AuthRequest['user']>
): Promise<ChangeRequestRecord> {
  const policy = await getApprovalPolicy();

  const updated = await withTransaction(async (conn) => {
    const row = await selectForUpdate(conn, id);
    if (!row) throw new OrgError(404, 'Change request not found');

    await assertCanViewRequest(user, row);
    const isRequester = row.requestedById === user.id;
    const isElevated = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
    if (!isRequester && !isElevated) {
      throw new OrgError(403, 'Only the requester may submit this change request');
    }
    if (row.status === 'PENDING') {
      throw new OrgError(409, 'This request has already been submitted for approval');
    }
    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(row.status)) {
      throw new OrgError(
        409,
        `A request that is ${row.status.toLowerCase()} cannot be submitted for approval`
      );
    }

    const payload = parseJson(row.payload);
    await validateChangeRequest({
      requestType: row.requestType,
      action: row.action,
      payload,
      locationId: row.locationId,
      floorId: row.floorId,
      departmentId: row.departmentId,
      sectionId: row.sectionId,
      workAreaId: row.workAreaId,
      employeeId: row.employeeId,
    });

    // Clear undecided stages from any previous round, then plan the new round.
    await conn.query(
      `DELETE FROM orgapprovaldecision WHERE changeRequestId = ? AND status = 'PENDING'`,
      [id]
    );
    const [seqRows]: any = await conn.query(
      'SELECT COALESCE(MAX(stageSequence), 0) AS maxSeq FROM orgapprovaldecision WHERE changeRequestId = ?',
      [id]
    );
    const startSequence = Number(seqRows?.[0]?.maxSeq || 0) + 1;
    const stages = await planStages(conn, row, policy, startSequence);

    for (const stage of stages) {
      await conn.query(
        `INSERT INTO orgapprovaldecision (id, changeRequestId, stageSequence, stageName, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'PENDING', NOW(3), NOW(3))`,
        [newId(), id, stage.seq, stage.stageName]
      );
    }

    const firstStage = stages[0].stageName;
    const dedupKey = computeDedupKey(
      {
        requestType: row.requestType,
        action: row.action,
        reason: row.reason,
        payload,
        locationId: row.locationId,
        floorId: row.floorId,
        departmentId: row.departmentId,
        sectionId: row.sectionId,
        workAreaId: row.workAreaId,
        employeeId: row.employeeId,
      },
      row.locationId,
      row.requestedById
    );

    const [result]: any = await conn.query(
      `UPDATE orgchangerequest
          SET status = 'PENDING', currentStage = ?, submittedAt = COALESCE(submittedAt, NOW(3)),
              dedupKey = ?, applyError = NULL, updatedAt = NOW(3)
        WHERE id = ? AND status IN ('DRAFT','CHANGES_REQUESTED')`,
      [firstStage, dedupKey, id]
    );
    if (result.affectedRows !== 1) {
      throw new OrgError(409, 'The request changed while it was being submitted - please refresh');
    }

    const fresh = await selectForUpdate(conn, id);
    if (!fresh) throw new OrgError(500, 'Failed to submit the change request');
    return fresh;
  });

  await audit({
    user,
    action: 'ORG_REQUEST_SUBMITTED',
    entityId: updated.id,
    locationId: updated.locationId,
    before: { status: 'DRAFT' },
    after: { status: updated.status, currentStage: updated.currentStage, requestCode: updated.requestCode },
  });

  const [requester]: any = await pool.query('SELECT fullName FROM user WHERE id = ?', [
    updated.requestedById,
  ]);

  await notify({
    eventId: 'ORG.APPROVAL_REQUESTED',
    title: 'Organization change awaiting approval',
    message: `${requester?.[0]?.fullName || 'A user'} submitted ${updated.requestCode} - ${updated.title} (${stageLabel(
      updated.currentStage
    )}).`,
    type: 'WARNING',
    severity: 'MEDIUM',
    entityType: 'organizationChangeRequest',
    entityId: updated.id,
    locationId: updated.locationId || undefined,
    actionUrl: `/organization/approvals?id=${updated.id}`,
    correlationId: `org_request_${updated.id}`,
    recipientRoles: [...new Set([...policy.preliminaryRoles, ...policy.finalRoles])],
    metadata: { requestCode: updated.requestCode, requestType: updated.requestType },
  });

  emitOrganizationChanged({
    kind: 'request.submitted',
    locationId: updated.locationId,
    requestId: updated.id,
    requestCode: updated.requestCode,
    status: updated.status,
    actorId: user.id,
  });
  invalidateCaches();

  return updated;
}

export async function updateChangeRequest(
  id: string,
  user: NonNullable<AuthRequest['user']>,
  changes: { title?: string; reason?: string; payload?: any; effectiveDate?: string | null }
): Promise<ChangeRequestRecord> {
  const row = await findById(id);
  if (!row) throw new OrgError(404, 'Change request not found');
  await assertCanViewRequest(user, row);

  if (row.requestedById !== user.id) {
    throw new OrgError(403, 'Only the requester may edit this change request');
  }
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(row.status)) {
    throw new OrgError(409, `A request that is ${row.status.toLowerCase()} can no longer be edited`);
  }

  const payload = changes.payload !== undefined ? changes.payload : parseJson(row.payload);
  if (row.requestType !== 'ADMIN_ACCOUNT') {
    await validateChangeRequest({
      requestType: row.requestType,
      action: row.action,
      payload,
      locationId: row.locationId,
      floorId: row.floorId,
      departmentId: row.departmentId,
      sectionId: row.sectionId,
      workAreaId: row.workAreaId,
      employeeId: row.employeeId,
    });
  }

  await pool.query(
    `UPDATE orgchangerequest
        SET title = ?, reason = ?, payload = ?, effectiveDate = ?, dedupKey = NULL, updatedAt = NOW(3)
      WHERE id = ? AND status IN ('DRAFT','CHANGES_REQUESTED')`,
    [
      (changes.title || row.title).slice(0, 191),
      (changes.reason || row.reason).trim(),
      JSON.stringify(payload),
      changes.effectiveDate !== undefined ? changes.effectiveDate : row.effectiveDate,
      id,
    ]
  );

  await audit({
    user,
    action: 'ORG_REQUEST_UPDATED',
    entityId: id,
    locationId: row.locationId,
    before: { title: row.title, reason: row.reason, payload: parseJson(row.payload) },
    after: { title: changes.title || row.title, reason: changes.reason || row.reason, payload },
  });

  const fresh = await findById(id);
  if (!fresh) throw new OrgError(500, 'Failed to update the change request');
  return fresh;
}

export async function cancelChangeRequest(
  id: string,
  user: NonNullable<AuthRequest['user']>
): Promise<ChangeRequestRecord> {
  const row = await findById(id);
  if (!row) throw new OrgError(404, 'Change request not found');
  await assertCanViewRequest(user, row);

  const isRequester = row.requestedById === user.id;
  const canCancel = isRequester || user.role === 'SUPER_ADMIN';
  if (!canCancel) throw new OrgError(403, 'You are not allowed to cancel this request');
  if (!['DRAFT', 'PENDING', 'CHANGES_REQUESTED'].includes(row.status)) {
    throw new OrgError(409, `A request that is ${row.status.toLowerCase()} cannot be cancelled`);
  }

  const [result]: any = await pool.query(
    `UPDATE orgchangerequest
        SET status = 'CANCELLED', currentStage = 'NONE', dedupKey = NULL, updatedAt = NOW(3)
      WHERE id = ? AND status IN ('DRAFT','PENDING','CHANGES_REQUESTED')`,
    [id]
  );
  if (result.affectedRows !== 1) {
    throw new OrgError(409, 'The request is no longer in a cancellable state');
  }

  await audit({
    user,
    action: 'ORG_REQUEST_CANCELLED',
    entityId: id,
    locationId: row.locationId,
    before: { status: row.status },
    after: { status: 'CANCELLED' },
  });

  emitOrganizationChanged({
    kind: 'request.cancelled',
    locationId: row.locationId,
    requestId: id,
    requestCode: row.requestCode,
    status: 'CANCELLED',
    actorId: user.id,
  });
  invalidateCaches();

  const fresh = await findById(id);
  if (!fresh) throw new OrgError(500, 'Failed to cancel the change request');
  return fresh;
}

/* ---------------------------------------------------------------------------------
 * Approval decisions
 * --------------------------------------------------------------------------------- */

export type OrgDecision = 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED';

export async function decideChangeRequest(
  id: string,
  decision: OrgDecision,
  remarks: string | undefined,
  user: NonNullable<AuthRequest['user']>
): Promise<ChangeRequestRecord> {
  const policy = await getApprovalPolicy();
  const scope = await resolveScope(user);
  const trimmedRemarks = (remarks || '').trim();

  if (decision !== 'APPROVE' && trimmedRemarks.length < 5) {
    throw new OrgError(400, 'Rejection or change remarks are required (at least 5 characters)');
  }

  let finalRow: ChangeRequestRecord | null = null;
  let applyFailure: { message: string } | null = null;

  await withTransaction(async (conn) => {
    const row = await selectForUpdate(conn, id);
    if (!row) throw new OrgError(404, 'Change request not found');

    const stage = row.currentStage as OrgStageName;
    if (!['LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'HR'].includes(stage)) {
      throw new OrgError(409, 'This request is not awaiting an approval decision');
    }

    assertStageReviewer(user, row, stage, getStageRoles(policy, stage), scope);

    const reviewerColumn =
      stage === 'HR' ? 'hrReviewerId' : 'managerReviewerId';
    const reviewedAtColumn = stage === 'HR' ? 'hrReviewedAt' : 'managerReviewedAt';
    const remarksColumn = stage === 'HR' ? 'hrRemarks' : 'managerRemarks';

    if (decision === 'APPROVE' && stage === 'HR') {
      // Final mandatory approval: apply in the very same transaction.
      try {
        await applyChangeRequest(conn, row, user.id);
      } catch (error: any) {
        applyFailure = {
          message: error?.message || 'The approved change could not be applied',
        };
        throw error instanceof OrgError
          ? error
          : new OrgError(500, `Approved change could not be applied: ${applyFailure.message}`);
      }
    }

    const isFinalStage = stage === 'HR';
    const nextStatus = isFinalStage ? 'APPLIED' : 'PENDING';
    const nextStage = isFinalStage ? 'COMPLETED' : 'HR';

    const [result]: any = await conn.query(
      `UPDATE orgchangerequest
          SET status = ?, currentStage = ?, ${reviewerColumn} = ?, ${reviewedAtColumn} = NOW(3),
              ${remarksColumn} = ?, ${isFinalStage ? 'appliedAt = NOW(3), appliedById = ?, applyError = NULL,' : ''}
              dedupKey = NULL, updatedAt = NOW(3)
        WHERE id = ? AND status = 'PENDING' AND currentStage = ?`,
      [
        nextStatus,
        nextStage,
        user.id,
        trimmedRemarks || null,
        ...(isFinalStage ? [user.id] : []),
        id,
        stage,
      ]
    );
    if (result.affectedRows !== 1) {
      throw new OrgError(
        409,
        'This request was already processed by another reviewer - please refresh the queue'
      );
    }

    const decisionStatus =
      decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';

    const [decisionRows]: any = await conn.query(
      `UPDATE orgapprovaldecision
          SET status = ?, reviewerId = ?, reviewerRole = ?, remarks = ?, decidedAt = NOW(3), updatedAt = NOW(3)
        WHERE changeRequestId = ? AND stageName = ? AND status = 'PENDING'
        ORDER BY stageSequence DESC
        LIMIT 1`,
      [decisionStatus, user.id, user.role, trimmedRemarks || null, id, stage]
    );
    if (decisionRows.affectedRows !== 1) {
      throw new OrgError(409, 'Approval stage could not be recorded - please retry');
    }

    if (decision === 'REJECT') {
      await conn.query(
        `UPDATE orgchangerequest SET status = 'REJECTED', currentStage = 'NONE' WHERE id = ?`,
        [id]
      );
    } else if (decision === 'CHANGES_REQUESTED') {
      await conn.query(
        `UPDATE orgchangerequest SET status = 'CHANGES_REQUESTED', currentStage = 'NONE' WHERE id = ?`,
        [id]
      );
    }

    const fresh = await selectForUpdate(conn, id);
    if (!fresh) throw new OrgError(500, 'Failed to update the change request');
    finalRow = fresh;
  });

  if (!finalRow) throw new OrgError(500, 'Approval processing produced no result');
  const row = finalRow as ChangeRequestRecord;

  await audit({
    user,
    action:
      row.status === 'APPLIED'
        ? 'ORG_REQUEST_APPLIED'
        : row.status === 'REJECTED'
          ? 'ORG_REQUEST_REJECTED'
          : row.status === 'CHANGES_REQUESTED'
            ? 'ORG_REQUEST_CHANGES_REQUESTED'
            : 'ORG_REQUEST_STAGE_APPROVED',
    entityId: id,
    locationId: row.locationId,
    before: { status: 'PENDING', currentStage: row.currentStage },
    after: {
      status: row.status,
      currentStage: row.currentStage,
      decision,
      remarks: trimmedRemarks || null,
      requestCode: row.requestCode,
    },
  });

  const [requester]: any = await pool.query('SELECT id, fullName FROM user WHERE id = ?', [
    row.requestedById,
  ]);
  const requesterName = requester?.[0]?.fullName || 'Requester';

  if (row.status === 'APPLIED') {
    await notify({
      eventId: 'ORG.REQUEST_APPLIED',
      title: 'Organization change approved and applied',
      message: `${row.requestCode} (${row.title}) was approved and is now part of the active organization.`,
      type: 'INFO',
      severity: 'MEDIUM',
      entityType: 'organizationChangeRequest',
      entityId: row.id,
      locationId: row.locationId || undefined,
      actionUrl: `/organization/approvals?id=${row.id}`,
      correlationId: `org_applied_${row.id}`,
      recipientRoles: ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE'],
      metadata: { requestCode: row.requestCode },
    });
    await notifyUser(
      row.requestedById,
      'Change request approved',
      `${row.requestCode} - ${row.title} has been approved and applied to the active organization.`,
      'INFO'
    );
  } else if (row.status === 'REJECTED') {
    await notifyUser(
      row.requestedById,
      'Change request rejected',
      `${row.requestCode} - ${row.title} was rejected: ${trimmedRemarks}`,
      'DANGER'
    );
  } else if (row.status === 'CHANGES_REQUESTED') {
    await notifyUser(
      row.requestedById,
      'Changes requested on your change request',
      `${row.requestCode} - ${row.title}: ${trimmedRemarks}`,
      'WARNING'
    );
  } else {
    await notify({
      eventId: 'ORG.APPROVAL_ADVANCED',
      title: 'Organization change ready for final HR approval',
      message: `${row.requestCode} - ${row.title} cleared manager review and now awaits final HR approval.`,
      type: 'WARNING',
      severity: 'MEDIUM',
      entityType: 'organizationChangeRequest',
      entityId: row.id,
      locationId: row.locationId || undefined,
      actionUrl: `/organization/approvals?id=${row.id}`,
      correlationId: `org_stage_${row.id}`,
      recipientRoles: policy.finalRoles,
      metadata: { requestCode: row.requestCode },
    });
    void requesterName;
  }

  emitOrganizationChanged({
    kind: `request.${row.status.toLowerCase()}`,
    locationId: row.locationId,
    requestId: row.id,
    requestCode: row.requestCode,
    status: row.status,
    actorId: user.id,
  });
  invalidateCaches();

  if (applyFailure) {
    const failure = applyFailure as { message: string };
    await pool
      .query('UPDATE orgchangerequest SET applyError = ?, updatedAt = NOW(3) WHERE id = ?', [
        failure.message,
        id,
      ])
      .catch(() => {});
    throw new OrgError(500, `The approval could not be applied: ${failure.message}`);
  }

  return row;
}

/**
 * Separately authorised emergency bypass of the approval chain.
 * Requires the override policy to be enabled, a mandatory justification and
 * writes an immutable audit record. Nothing is silently bypassed.
 */
export async function emergencyOverrideChangeRequest(
  id: string,
  justification: string,
  user: NonNullable<AuthRequest['user']>
): Promise<ChangeRequestRecord> {
  const row = await findById(id);
  if (!row) throw new OrgError(404, 'Change request not found');
  await assertCanOverride(user, row, justification);

  const result = await withTransaction(async (conn) => {
    const locked = await selectForUpdate(conn, id);
    if (!locked) throw new OrgError(404, 'Change request not found');
    await assertCanOverride(user, locked, justification);

    await applyChangeRequest(conn, locked, user.id);

    const [update]: any = await conn.query(
      `UPDATE orgchangerequest
          SET status = 'APPLIED', currentStage = 'COMPLETED', appliedAt = NOW(3), appliedById = ?,
              isEmergencyOverride = 1, overrideJustification = ?, overrideById = ?, overrideAt = NOW(3),
              dedupKey = NULL, applyError = NULL, updatedAt = NOW(3)
        WHERE id = ? AND status = 'PENDING'`,
      [user.id, justification.trim(), user.id, id]
    );
    if (update.affectedRows !== 1) {
      throw new OrgError(409, 'The request was processed by someone else - please refresh');
    }

    await conn.query(
      `INSERT INTO orgapprovaldecision
         (id, changeRequestId, stageSequence, stageName, status, reviewerId, reviewerRole, remarks, decidedAt, createdAt, updatedAt)
       VALUES (?, ?, 999, 'EMERGENCY_OVERRIDE', 'APPROVED', ?, ?, ?, NOW(3), NOW(3), NOW(3))`,
      [newId(), id, user.id, user.role, justification.trim()]
    );

    const fresh = await selectForUpdate(conn, id);
    if (!fresh) throw new OrgError(500, 'Failed to apply the override');
    return fresh;
  });

  await AuditService.log({
    userId: user.id,
    locationId: row.locationId || user.locationId,
    action: 'ORG_EMERGENCY_OVERRIDE',
    entityType: 'OrganizationChangeRequest',
    entityId: id,
    riskScore: 90,
    tags: ['organization', 'emergency-override', 'security-alert', 'immutable-audit'],
    before: { status: row.status, currentStage: row.currentStage },
    after: {
      status: 'APPLIED',
      justification: justification.trim(),
      requestCode: row.requestCode,
      overrideBy: user.email,
    },
  }).catch(() => {});

  await notify({
    eventId: 'ORG.EMERGENCY_OVERRIDE',
    title: 'Emergency override applied',
    message: `${row.requestCode} (${row.title}) bypassed the normal approval chain. Justification: ${justification.trim()}`,
    type: 'CRITICAL',
    severity: 'CRITICAL',
    entityType: 'organizationChangeRequest',
    entityId: row.id,
    locationId: row.locationId || undefined,
    actionUrl: `/organization/approvals?id=${row.id}`,
    correlationId: `org_override_${row.id}`,
    recipientRoles: ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE'],
    metadata: { justification: justification.trim() },
  });

  emitOrganizationChanged({
    kind: 'request.overridden',
    locationId: row.locationId,
    requestId: row.id,
    requestCode: row.requestCode,
    status: 'APPLIED',
    actorId: user.id,
  });
  invalidateCaches();

  const fresh = await findById(id);
  if (!fresh) throw new OrgError(500, 'Failed to reload the change request');
  return fresh;
}

/* ---------------------------------------------------------------------------------
 * Apply approved changes to the active organization
 * --------------------------------------------------------------------------------- */

async function applyChangeRequest(
  conn: PoolConnection,
  row: ChangeRequestRecord,
  actorId: string
): Promise<void> {
  const payload = parseJson(row.payload);

  switch (row.requestType) {
    case 'LOCATION':
      return applyLocation(conn, row, payload);
    case 'FLOOR':
      return applyFloor(conn, row, payload);
    case 'DEPARTMENT':
      return applyDepartment(conn, row, payload);
    case 'SECTION':
      return applySection(conn, row, payload);
    case 'WORK_AREA':
      return applyWorkArea(conn, row, payload);
    case 'EMPLOYEE_ALLOCATION':
    case 'EMPLOYEE_TRANSFER':
      return applyEmployeeAssignment(conn, row, payload, actorId);
    case 'MANAGER_ASSIGNMENT':
      return applyManagerAssignment(conn, row, payload, actorId);
    case 'ADMIN_ACCOUNT':
      return applyAdminAccount(conn, row, payload, actorId);
    default:
      throw new OrgError(400, `Unsupported request type: ${row.requestType}`);
  }
}

function buildUpdate(
  table: string,
  id: string,
  allowed: Record<string, any>,
  values: any
): { sql: string; params: any[] } {
  const sets: string[] = [];
  const params: any[] = [];
  for (const [column, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (!allowed.includes(column)) continue;
    sets.push(`\`${column}\` = ?`);
    params.push(value === '' ? null : value);
  }
  if (sets.length === 0) throw new OrgError(400, 'No updatable fields were supplied');
  params.push(id);
  return { sql: `UPDATE \`${table}\` SET ${sets.join(', ')}, updatedAt = NOW(3) WHERE id = ?`, params };
}

async function toggleStatus(
  conn: PoolConnection,
  table: string,
  row: ChangeRequestRecord,
  target: 'ACTIVE' | 'INACTIVE'
): Promise<void> {
  const [result]: any = await conn.query(
    `UPDATE \`${table}\` SET status = ?, updatedAt = NOW(3) WHERE id = ?`,
    [target, row.locationId]
  );
  if (result.affectedRows !== 1) throw new OrgError(404, `${table} record not found`);
}

async function applyLocation(conn: PoolConnection, row: ChangeRequestRecord, payload: any): Promise<void> {
  if (row.action === 'CREATE') {
    await conn.query(
      `INSERT INTO location
         (id, code, name, address, city, state, pin, phone, email, whatsapp, managerId, hrManagerId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3))`,
      [
        newId(),
        String(payload.code).toUpperCase(),
        payload.name,
        payload.address || null,
        payload.city || null,
        payload.state || null,
        payload.pin || null,
        payload.phone || null,
        payload.email || null,
        payload.whatsapp || null,
        payload.managerId || null,
        payload.hrManagerId || null,
      ]
    );
    return;
  }
  if (!row.locationId) throw new OrgError(400, 'Location request is missing its location reference');
  if (row.action === 'DEACTIVATE') return toggleStatus(conn, 'location', row, 'INACTIVE');
  if (row.action === 'ACTIVATE') return toggleStatus(conn, 'location', row, 'ACTIVE');

  const { sql, params } = buildUpdate(
    'location',
    row.locationId,
    ['name', 'address', 'city', 'state', 'pin', 'phone', 'email', 'whatsapp', 'managerId', 'hrManagerId'],
    payload
  );
  const [result]: any = await conn.query(sql, params);
  if (result.affectedRows < 1) throw new OrgError(404, 'Location not found');
}

async function applyFloor(conn: PoolConnection, row: ChangeRequestRecord, payload: any): Promise<void> {
  if (row.action === 'CREATE') {
    const locationId = payload.locationId || row.locationId;
    if (!locationId) throw new OrgError(400, 'Floor must belong to a store location');
    const [result]: any = await conn.query(
      `INSERT INTO floor (id, name, floorNumber, locationId, floorManagerId, assistantManagerId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3))`,
      [
        newId(),
        payload.name,
        Number(payload.floorNumber),
        locationId,
        payload.floorManagerId || null,
        payload.assistantManagerId || null,
      ]
    );
    if (result.affectedRows !== 1) throw new OrgError(500, 'Floor could not be created');
    return;
  }
  if (!row.floorId) throw new OrgError(400, 'Floor request is missing its floor reference');
  if (row.action === 'DEACTIVATE' || row.action === 'ACTIVATE') {
    const [result]: any = await conn.query(
      `UPDATE floor SET status = ?, updatedAt = NOW(3) WHERE id = ?`,
      [row.action === 'DEACTIVATE' ? 'INACTIVE' : 'ACTIVE', row.floorId]
    );
    if (result.affectedRows !== 1) throw new OrgError(404, 'Floor not found');
    return;
  }
  const { sql, params } = buildUpdate('floor', row.floorId, ['name', 'floorManagerId', 'assistantManagerId'], payload);
  const [result]: any = await conn.query(sql, params);
  if (result.affectedRows < 1) throw new OrgError(404, 'Floor not found');
}

async function applyDepartment(conn: PoolConnection, row: ChangeRequestRecord, payload: any): Promise<void> {
  if (row.action === 'CREATE') {
    const locationId = payload.locationId || row.locationId;
    if (!locationId) throw new OrgError(400, 'Department must belong to a store location');
    await conn.query(
      `INSERT INTO department (id, name, code, locationId, floorId, managerId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3))`,
      [
        newId(),
        payload.name,
        String(payload.code).toUpperCase(),
        locationId,
        payload.floorId || null,
        payload.managerId || null,
      ]
    );
    return;
  }
  if (!row.departmentId) throw new OrgError(400, 'Department request is missing its department reference');
  if (row.action === 'DEACTIVATE' || row.action === 'ACTIVATE') {
    const [result]: any = await conn.query(
      `UPDATE department SET status = ?, updatedAt = NOW(3) WHERE id = ?`,
      [row.action === 'DEACTIVATE' ? 'INACTIVE' : 'ACTIVE', row.departmentId]
    );
    if (result.affectedRows !== 1) throw new OrgError(404, 'Department not found');
    return;
  }
  const { sql, params } = buildUpdate(
    'department',
    row.departmentId,
    ['name', 'code', 'floorId', 'managerId'],
    payload
  );
  const [result]: any = await conn.query(sql, params);
  if (result.affectedRows < 1) throw new OrgError(404, 'Department not found');
}

async function applySection(conn: PoolConnection, row: ChangeRequestRecord, payload: any): Promise<void> {
  if (row.action === 'CREATE') {
    const locationId = payload.locationId || row.locationId;
    if (!locationId) throw new OrgError(400, 'Section must belong to a store location');
    if (!payload.floorId) throw new OrgError(400, 'Section must belong to a floor');
    await conn.query(
      `INSERT INTO section (id, name, code, locationId, floorId, departmentId, supervisorId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3))`,
      [
        newId(),
        payload.name,
        String(payload.code).toUpperCase(),
        locationId,
        payload.floorId,
        payload.departmentId || null,
        payload.supervisorId || null,
      ]
    );
    return;
  }
  if (!row.sectionId) throw new OrgError(400, 'Section request is missing its section reference');
  if (row.action === 'DEACTIVATE' || row.action === 'ACTIVATE') {
    const [result]: any = await conn.query(
      `UPDATE section SET status = ?, updatedAt = NOW(3) WHERE id = ?`,
      [row.action === 'DEACTIVATE' ? 'INACTIVE' : 'ACTIVE', row.sectionId]
    );
    if (result.affectedRows !== 1) throw new OrgError(404, 'Section not found');
    return;
  }
  const { sql, params } = buildUpdate(
    'section',
    row.sectionId,
    ['name', 'code', 'floorId', 'departmentId', 'supervisorId'],
    payload
  );
  const [result]: any = await conn.query(sql, params);
  if (result.affectedRows < 1) throw new OrgError(404, 'Section not found');
}

async function applyWorkArea(conn: PoolConnection, row: ChangeRequestRecord, payload: any): Promise<void> {
  if (row.action === 'CREATE') {
    const locationId = payload.locationId || row.locationId;
    if (!locationId || !payload.floorId || !payload.sectionId) {
      throw new OrgError(400, 'Work area must belong to a location, floor and section');
    }
    await conn.query(
      `INSERT INTO sellingpoint
         (id, name, code, locationId, floorId, sectionId, category, departmentId, managerId, targetAmount, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3))`,
      [
        newId(),
        payload.name,
        String(payload.code).toUpperCase(),
        locationId,
        payload.floorId,
        payload.sectionId,
        payload.category || null,
        payload.departmentId || null,
        payload.managerId || null,
        payload.targetAmount ?? null,
      ]
    );
    return;
  }
  if (!row.workAreaId) throw new OrgError(400, 'Work area request is missing its work area reference');
  if (row.action === 'DEACTIVATE' || row.action === 'ACTIVATE') {
    const [result]: any = await conn.query(
      `UPDATE sellingpoint SET status = ?, updatedAt = NOW(3) WHERE id = ?`,
      [row.action === 'DEACTIVATE' ? 0 : 1, row.workAreaId]
    );
    if (result.affectedRows !== 1) throw new OrgError(404, 'Work area not found');
    return;
  }
  const { sql, params } = buildUpdate(
    'sellingpoint',
    row.workAreaId,
    ['name', 'code', 'category', 'sectionId', 'floorId', 'departmentId', 'managerId', 'targetAmount'],
    payload
  );
  const [result]: any = await conn.query(sql, params);
  if (result.affectedRows < 1) throw new OrgError(404, 'Work area not found');
}

async function applyEmployeeAssignment(
  conn: PoolConnection,
  row: ChangeRequestRecord,
  payload: any,
  actorId: string
): Promise<void> {
  if (!row.employeeId) throw new OrgError(400, 'Employee assignment request is missing its employee');

  const [empRows]: any = await conn.query('SELECT * FROM employee WHERE id = ? FOR UPDATE', [
    row.employeeId,
  ]);
  const employee = empRows?.[0];
  if (!employee) throw new OrgError(400, 'The employee no longer exists');

  const [prevHistory]: any = await conn.query(
    `SELECT * FROM employeeassignmenthistory WHERE employeeId = ? AND isCurrent = 1 LIMIT 1 FOR UPDATE`,
    [row.employeeId]
  );
  const previous = prevHistory?.[0] || null;

  const targetLocationId = payload.locationId || employee.locationId;
  const targetFloorId = payload.floorId ?? employee.floorId ?? null;
  const targetDepartmentId = payload.departmentId ?? employee.departmentId ?? null;
  const targetSectionId = payload.sectionId ?? employee.sectionId ?? null;
  const targetManagerId = payload.reportingManagerId ?? previous?.reportingManagerId ?? null;

  // Keep `employee` (the roster source of truth used by the rest of the HRMS)
  // and the append-only assignment history perfectly in sync.
  const [update]: any = await conn.query(
    `UPDATE employee SET locationId = ?, floorId = ?, departmentId = ?, sectionId = ?, updatedAt = NOW(3)
      WHERE id = ?`,
    [targetLocationId, targetFloorId, targetDepartmentId, targetSectionId, row.employeeId]
  );
  if (update.affectedRows !== 1) throw new OrgError(500, 'Employee allocation could not be updated');

  await conn.query(
    `UPDATE employeeassignmenthistory SET isCurrent = 0, effectiveTo = NOW(3)
      WHERE employeeId = ? AND isCurrent = 1`,
    [row.employeeId]
  );

  const changeType =
    row.requestType === 'EMPLOYEE_TRANSFER'
      ? 'TRANSFER'
      : payload.reportingManagerId && !payload.locationId && !payload.departmentId && !payload.sectionId
        ? 'MANAGER_CHANGE'
        : 'REASSIGN';

  await conn.query(
    `INSERT INTO employeeassignmenthistory
       (id, employeeId, changeRequestId, changeType, locationId, floorId, departmentId, sectionId,
        sellingPointId, reportingManagerId, previousLocationId, previousFloorId, previousDepartmentId,
        previousSectionId, previousSellingPointId, previousReportingManagerId, isCurrent, effectiveFrom,
        remarks, changedById, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(3), ?, ?, NOW(3))`,
    [
      newId(),
      row.employeeId,
      row.id,
      changeType,
      targetLocationId,
      targetFloorId,
      targetDepartmentId,
      targetSectionId,
      payload.workAreaId || previous?.sellingPointId || null,
      targetManagerId,
      previous?.locationId ?? employee.locationId,
      previous?.floorId ?? employee.floorId,
      previous?.departmentId ?? employee.departmentId,
      previous?.sectionId ?? employee.sectionId,
      previous?.sellingPointId ?? null,
      previous?.reportingManagerId ?? null,
      row.reason,
      actorId,
    ]
  );

  if (payload.workAreaId) {
    await conn.query(
      `DELETE FROM employeesellingpoint WHERE employeeId = ? AND isPrimary = 1`,
      [row.employeeId]
    );
    await conn.query(
      `INSERT INTO employeesellingpoint (id, employeeId, sellingPointId, assignedDate, isPrimary, createdAt)
       VALUES (?, ?, ?, NOW(3), 1, NOW(3))
       ON DUPLICATE KEY UPDATE isPrimary = 1`,
      [newId(), row.employeeId, payload.workAreaId]
    );
  }
}

async function applyManagerAssignment(
  conn: PoolConnection,
  row: ChangeRequestRecord,
  payload: any,
  actorId: string
): Promise<void> {
  const scope = String(payload.scope || '').toUpperCase();
  const managerId = payload.managerId;
  if (!managerId) throw new OrgError(400, 'A manager must be selected');

  if (scope === 'LOCATION' && row.locationId) {
    await conn.query('UPDATE location SET managerId = ?, updatedAt = NOW(3) WHERE id = ?', [
      managerId,
      row.locationId,
    ]);
    return;
  }
  if (scope === 'FLOOR' && row.floorId) {
    await conn.query('UPDATE floor SET floorManagerId = ?, updatedAt = NOW(3) WHERE id = ?', [
      managerId,
      row.floorId,
    ]);
    return;
  }
  if (scope === 'DEPARTMENT' && row.departmentId) {
    await conn.query('UPDATE department SET managerId = ?, updatedAt = NOW(3) WHERE id = ?', [
      managerId,
      row.departmentId,
    ]);
    return;
  }
  if (scope === 'SECTION' && row.sectionId) {
    await conn.query('UPDATE section SET supervisorId = ?, updatedAt = NOW(3) WHERE id = ?', [
      managerId,
      row.sectionId,
    ]);
    return;
  }
  if (scope === 'EMPLOYEE' && row.employeeId) {
    await applyEmployeeAssignment(
      conn,
      row,
      { ...payload, reportingManagerId: managerId },
      actorId
    );
    return;
  }
  throw new OrgError(400, 'Manager assignment target could not be resolved');
}

async function applyAdminAccount(
  conn: PoolConnection,
  row: ChangeRequestRecord,
  payload: any,
  actorId: string
): Promise<void> {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw new OrgError(400, 'A work email is required to provision an account');

  const [dupe]: any = await conn.query('SELECT id FROM user WHERE LOWER(email) = ? FOR UPDATE', [email]);
  if (dupe && dupe.length > 0) {
    throw new OrgError(409, `A user with the email ${email} already exists`);
  }

  // No plaintext password is ever stored, logged or returned: a random secret
  // is hashed here and the new admin completes identity setup through the
  // existing secure password-reset / invitation flow.
  const bootstrapSecret = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(bootstrapSecret, 12);
  const permissions = JSON.stringify(Array.isArray(payload.permissions) ? payload.permissions : ['VIEW']);
  const locationIds: string[] = Array.isArray(payload.locationIds) ? payload.locationIds : [];
  const primaryLocationId = locationIds.length > 0 ? locationIds[0] : null;
  const role = String(payload.role || 'EMPLOYEE').toUpperCase();

  await conn.query(
    `INSERT INTO user
       (id, email, passwordHash, fullName, role, permissions, locationId, employeeId, isActive, status,
        emailVerifiedAt, mustChangePassword, approvedById, approvedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', NOW(3), 1, ?, NOW(3), NOW(3), NOW(3))`,
    [
      newId(),
      email,
      passwordHash,
      payload.fullName,
      role,
      permissions,
      primaryLocationId,
      payload.employeeId || null,
      actorId,
    ]
  );

  const [userRows]: any = await conn.query('SELECT id FROM user WHERE LOWER(email) = ?', [email]);
  const newUserId = userRows?.[0]?.id;
  if (!newUserId) throw new OrgError(500, 'The administrative account could not be provisioned');

  for (const locationId of locationIds) {
    await conn.query(
      `INSERT IGNORE INTO userorgscope (id, userId, locationId, grantedById, changeRequestId, createdAt)
       VALUES (?, ?, ?, ?, ?, NOW(3))`,
      [newId(), newUserId, locationId, actorId, row.id]
    );
  }
}

/* ---------------------------------------------------------------------------------
 * Queries: queue, list, detail
 * --------------------------------------------------------------------------------- */

export interface RequestListFilters {
  locationId?: string;
  requestType?: string;
  status?: string;
  stage?: string;
  requestedById?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  queueOnly?: boolean;
}

export async function listChangeRequests(
  user: NonNullable<AuthRequest['user']>,
  filters: RequestListFilters
): Promise<{ items: any[]; total: number; page: number; limit: number }> {
  const policy = await getApprovalPolicy();
  const orgScope = await resolveScope(user);
  // `buildScope` narrows locationIds to the requested location (or all accessible);
  // `orgScope` provides the `global` flag used for the inScope check.
  const scope = await buildScope(user, filters.locationId);
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: any[] = [];

  if (scope.locationIds && scope.locationIds.length > 0) {
    where.push(`cr.locationId IN (${scope.locationIds.map(() => '?').join(', ')})`);
    params.push(...scope.locationIds);
  }
  if (filters.queueOnly) {
    where.push(`cr.status IN ('PENDING','CHANGES_REQUESTED')`);
    where.push(`cr.currentStage IN ('LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER','HR')`);
  }
  if (filters.status) {
    where.push('cr.status = ?');
    params.push(filters.status);
  }
  if (filters.requestType) {
    where.push('cr.requestType = ?');
    params.push(filters.requestType);
  }
  if (filters.stage) {
    where.push('cr.currentStage = ?');
    params.push(filters.stage);
  }
  if (filters.requestedById) {
    where.push('cr.requestedById = ?');
    params.push(filters.requestedById);
  }
  if (filters.from) {
    where.push('COALESCE(cr.submittedAt, cr.createdAt) >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('COALESCE(cr.submittedAt, cr.createdAt) <= ?');
    params.push(filters.to);
  }
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    where.push(
      '(cr.requestCode LIKE ? OR cr.title LIKE ? OR cr.reason LIKE ? OR ru.fullName LIKE ? OR emp.fullName LIKE ?)'
    );
    params.push(term, term, term, term, term);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const [rowsResult, countResult]: any[] = await Promise.all([
    pool.query(
      `SELECT cr.id, cr.requestCode, cr.requestType, cr.action, cr.title, cr.reason, cr.status,
              cr.currentStage, cr.locationId, cr.floorId, cr.departmentId, cr.sectionId,
              cr.workAreaId, cr.employeeId, cr.effectiveDate, cr.requestedById, cr.submittedAt,
              cr.appliedAt, cr.isEmergencyOverride, cr.createdAt, cr.updatedAt, cr.applyError,
              ru.fullName AS requestedByName, ru.role AS requesterRole,
              l.name AS locationName, l.code AS locationCode,
              f.name AS floorName, d.name AS departmentName, s.name AS sectionName,
              emp.fullName AS employeeName, emp.employeeCode AS employeeCode,
              mr.fullName AS managerReviewerName, hr.fullName AS hrReviewerName
         FROM orgchangerequest cr
         JOIN user ru ON ru.id = cr.requestedById
         LEFT JOIN location l ON l.id = cr.locationId
         LEFT JOIN floor f ON f.id = cr.floorId
         LEFT JOIN department d ON d.id = cr.departmentId
         LEFT JOIN section s ON s.id = cr.sectionId
         LEFT JOIN employee emp ON emp.id = cr.employeeId
         LEFT JOIN user mr ON mr.id = cr.managerReviewerId
         LEFT JOIN user hr ON hr.id = cr.hrReviewerId
        ${whereSql}
        ORDER BY cr.updatedAt DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) AS total
         FROM orgchangerequest cr
         JOIN user ru ON ru.id = cr.requestedById
         LEFT JOIN employee emp ON emp.id = cr.employeeId
        ${whereSql}`,
      params
    ),
  ]);

  // mysql2 pool.query returns [rows, fields] tuples
  const rows: any[] = (rowsResult as any)?.[0] ?? [];
  const countRows: any[] = (countResult as any)?.[0] ?? [];

  const stageRolesCache = new Map<string, string[]>();
  const rolesFor = (stage: string): string[] => {
    if (!stageRolesCache.has(stage)) {
      stageRolesCache.set(stage, getStageRoles(policy, stage as OrgStageName));
    }
    return stageRolesCache.get(stage)!;
  };

  const items = (rows as any[]).map((r) => {
    const ownRequest = r.requestedById === user.id;
    const stageRoles = r.status === 'PENDING' ? rolesFor(r.currentStage) : [];
    const inScope = orgScope.global || !r.locationId || orgScope.locationIds.includes(r.locationId);
    const canDecide =
      r.status === 'PENDING' &&
      ['LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'HR'].includes(r.currentStage) &&
      !ownRequest &&
      inScope &&
      stageRoles.includes(user.role);

    return {
      ...r,
      payload: undefined,
      ownRequest,
      canDecide,
      stageLabel: stageLabel(r.currentStage),
      requiredRoles: r.status === 'PENDING' ? stageRoles : [],
    };
  });

  return { items, total: Number(countRows[0]?.total || 0), page, limit };
}

export async function getChangeRequestDetail(
  user: NonNullable<AuthRequest['user']>,
  id: string
): Promise<any> {
  const row = await findById(id);
  if (!row) throw new OrgError(404, 'Change request not found');
  await assertCanViewRequest(user, row);

  const policy = await getApprovalPolicy();
  const scope = await resolveScope(user);

  const [decisionsResult, contextResult]: any[] = await Promise.all([
    pool.query(
      `SELECT d.id, d.stageSequence, d.stageName, d.status, d.remarks, d.decidedAt, d.createdAt,
              u.fullName AS reviewerName, u.role AS reviewerRole
         FROM orgapprovaldecision d
         LEFT JOIN user u ON u.id = d.reviewerId
        WHERE d.changeRequestId = ?
        ORDER BY d.stageSequence ASC, d.createdAt ASC`,
      [id]
    ),
    pool.query(
      `SELECT ru.fullName AS requestedByName, ru.email AS requestedByEmail, ru.role AS requesterRole,
              l.name AS locationName, l.code AS locationCode,
              f.name AS floorName, d.name AS departmentName, s.name AS sectionName,
              emp.fullName AS employeeName, emp.employeeCode AS employeeCode, emp.designation AS employeeDesignation,
              mu.fullName AS managerReviewerName, hu.fullName AS hrReviewerName,
              au.fullName AS appliedByName, ov.fullName AS overrideByName
         FROM orgchangerequest cr
         JOIN user ru ON ru.id = cr.requestedById
         LEFT JOIN location l ON l.id = cr.locationId
         LEFT JOIN floor f ON f.id = cr.floorId
         LEFT JOIN department d ON d.id = cr.departmentId
         LEFT JOIN section s ON s.id = cr.sectionId
         LEFT JOIN employee emp ON emp.id = cr.employeeId
         LEFT JOIN user mu ON mu.id = cr.managerReviewerId
         LEFT JOIN user hu ON hu.id = cr.hrReviewerId
         LEFT JOIN user au ON au.id = cr.appliedById
         LEFT JOIN user ov ON ov.id = cr.overrideById
        WHERE cr.id = ?`,
      [id]
    ),
  ]);

  // mysql2 pool.query returns [rows, fields] tuples
  const decisions: any[] = (decisionsResult as any)?.[0] ?? [];
  const context: any = (contextResult as any)?.[0]?.[0] ?? {};

  const stageRoles = getStageRoles(policy, row.currentStage as OrgStageName);
  const ownRequest = row.requestedById === user.id;
  const inScope = scope.global || !row.locationId || scope.locationIds.includes(row.locationId);
  const canDecide =
    row.status === 'PENDING' &&
    ['LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'HR'].includes(row.currentStage) &&
    !ownRequest &&
    inScope &&
    stageRoles.includes(user.role);
  const canEdit =
    ownRequest && ['DRAFT', 'CHANGES_REQUESTED'].includes(row.status);
  const canCancel =
    (ownRequest || user.role === 'SUPER_ADMIN') &&
    ['DRAFT', 'PENDING', 'CHANGES_REQUESTED'].includes(row.status);

  return {
    ...row,
    payload: parseJson(row.payload),
    existingSnapshot: parseJson(row.existingSnapshot),
    context: context || {},
    decisions: decisions || [],
    stageLabel: stageLabel(row.currentStage),
    requiredRoles: row.status === 'PENDING' ? stageRoles : [],
    permissions: { canDecide, canEdit, canCancel, ownRequest },
  };
}
