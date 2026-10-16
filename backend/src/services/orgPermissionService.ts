import type { AuthRequest } from '../middleware/auth.js';
import { AuditService } from './auditService.js';
import { cacheService } from './cacheService.js';
import { pool } from '../db.js';

/**
 * Organization module authorization rules.
 *
 * Every decision made here runs on the server for every protected organization
 * API, mutation and approval action. Hiding a button in the frontend is only
 * defence in depth - never the gate.
 *
 * Scope model:
 *   - SUPER_ADMIN                      -> organization-wide
 *   - ADMIN with no primary location   -> explicitly authorized for all locations
 *   - ADMIN with a primary location    -> only its authorized locations
 *   - HR roles                         -> organization-wide while `hrGlobalScope`
 *                                         is enabled by policy, else its locations
 *   - everyone else                    -> primary location + userorgscope rows
 *
 * An Admin therefore never receives unrestricted access implicitly.
 */

export type OrgRequestType =
  | 'LOCATION'
  | 'FLOOR'
  | 'DEPARTMENT'
  | 'SECTION'
  | 'WORK_AREA'
  | 'EMPLOYEE_ALLOCATION'
  | 'EMPLOYEE_TRANSFER'
  | 'MANAGER_ASSIGNMENT'
  | 'ADMIN_ACCOUNT';

export type OrgRequestAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DEACTIVATE'
  | 'ACTIVATE'
  | 'ASSIGN'
  | 'TRANSFER'
  | 'REASSIGN'
  | 'PROVISION';

export type OrgStageName =
  | 'LOCATION_MANAGER'
  | 'FLOOR_MANAGER'
  | 'DEPARTMENT_MANAGER'
  | 'HR'
  | 'EMERGENCY_OVERRIDE';

export interface ApprovalPolicy {
  requirePreliminary: Record<string, boolean>;
  preliminaryRoles: string[];
  finalRoles: string[];
  creatorRoles: string[];
  hrGlobalScope: boolean;
}

export interface EmergencyOverridePolicy {
  enabled: boolean;
  roles: string[];
  minJustificationLength: number;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  requirePreliminary: {
    LOCATION: true,
    FLOOR: true,
    DEPARTMENT: true,
    SECTION: true,
    WORK_AREA: true,
    EMPLOYEE_ALLOCATION: true,
    EMPLOYEE_TRANSFER: true,
    MANAGER_ASSIGNMENT: true,
    ADMIN_ACCOUNT: false,
  },
  preliminaryRoles: [
    'LOCATION_MANAGER',
    'FLOOR_MANAGER',
    'DEPARTMENT_MANAGER',
    'HR_MANAGER',
    'HR_EXECUTIVE',
    'ADMIN',
  ],
  finalRoles: ['HR_MANAGER', 'HR_EXECUTIVE', 'HR'],
  creatorRoles: [
    'SUPER_ADMIN',
    'ADMIN',
    'HR_MANAGER',
    'HR_EXECUTIVE',
    'LOCATION_MANAGER',
    'FLOOR_MANAGER',
    'DEPARTMENT_MANAGER',
  ],
  hrGlobalScope: true,
};

export const DEFAULT_OVERRIDE_POLICY: EmergencyOverridePolicy = {
  enabled: false,
  roles: ['SUPER_ADMIN'],
  minJustificationLength: 20,
};

export const FINAL_HR_ROLES = ['HR_MANAGER', 'HR_EXECUTIVE', 'HR'];

const POLICY_CACHE_KEY = 'org:policy';
const SCOPE_CACHE_PREFIX = 'org:scope:';
const POLICY_CACHE_TTL_MS = 30_000;

/** Typed error so routes can translate it into a consistent HTTP response. */
export class OrgError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'OrgError';
  }
}

export interface OrgScope {
  global: boolean;
  locationIds: string[];
}

function coerceStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return list.length > 0 ? list : fallback;
}

function normalizePolicy(raw: any): ApprovalPolicy {
  const base = DEFAULT_APPROVAL_POLICY;
  if (!raw || typeof raw !== 'object') return base;
  return {
    requirePreliminary: { ...base.requirePreliminary, ...(raw.requirePreliminary || {}) },
    preliminaryRoles: coerceStringArray(raw.preliminaryRoles, base.preliminaryRoles),
    finalRoles: coerceStringArray(raw.finalRoles, base.finalRoles),
    creatorRoles: coerceStringArray(raw.creatorRoles, base.creatorRoles),
    hrGlobalScope: raw.hrGlobalScope === undefined ? base.hrGlobalScope : Boolean(raw.hrGlobalScope),
  };
}

function normalizeOverride(raw: any): EmergencyOverridePolicy {
  const base = DEFAULT_OVERRIDE_POLICY;
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: Boolean(raw.enabled),
    roles: coerceStringArray(raw.roles, base.roles),
    minJustificationLength:
      typeof raw.minJustificationLength === 'number'
        ? raw.minJustificationLength
        : base.minJustificationLength,
  };
}

async function readSetting(key: string): Promise<any> {
  try {
    const [rows]: any = await pool.query('SELECT `value` FROM orgsettings WHERE `key` = ?', [key]);
    if (!rows || rows.length === 0) return null;
    const value = rows[0].value;
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  } catch (error) {
    console.error(`[orgPermissionService] Failed to read setting ${key}:`, error);
    return null;
  }
}

/** Approval routing policy (configurable by authorized users, enforced here). */
export async function getApprovalPolicy(): Promise<ApprovalPolicy> {
  const cached = cacheService.get<ApprovalPolicy>(POLICY_CACHE_KEY);
  if (cached?.data) return cached.data;
  const policy = normalizePolicy(await readSetting('approvalPolicy'));
  cacheService.set(POLICY_CACHE_KEY, policy, POLICY_CACHE_TTL_MS);
  return policy;
}

export async function getEmergencyOverridePolicy(): Promise<EmergencyOverridePolicy> {
  const key = `${POLICY_CACHE_KEY}:override`;
  const cached = cacheService.get<EmergencyOverridePolicy>(key);
  if (cached?.data) return cached.data;
  const policy = normalizeOverride(await readSetting('emergencyOverride'));
  cacheService.set(key, policy, POLICY_CACHE_TTL_MS);
  return policy;
}

export function invalidateOrganizationPolicyCache(): void {
  cacheService.delete(POLICY_CACHE_KEY);
  cacheService.delete(`${POLICY_CACHE_KEY}:override`);
}

export function invalidateUserOrgScope(userId: string): void {
  cacheService.delete(`${SCOPE_CACHE_PREFIX}${userId}`);
}

function isElevated(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

function isHrRole(role: string): boolean {
  return role === 'HR_MANAGER' || role === 'HR_EXECUTIVE' || role === 'HR' || role === 'HR_AUDITOR';
}

async function getExtraLocationIds(userId: string): Promise<string[]> {
  const key = `${SCOPE_CACHE_PREFIX}${userId}`;
  const cached = cacheService.get<string[]>(key);
  if (cached?.data) return cached.data;
  try {
    const [rows]: any = await pool.query(
      'SELECT locationId FROM userorgscope WHERE userId = ? ORDER BY createdAt',
      [userId]
    );
    const ids: string[] = (rows || []).map((r: any) => r.locationId).filter(Boolean);
    cacheService.set(key, ids, POLICY_CACHE_TTL_MS);
    return ids;
  } catch (error) {
    console.error('[orgPermissionService] Failed to read user org scope:', error);
    return [];
  }
}

/** Location visibility for the signed-in user (see module doc block). */
export async function resolveScope(user: AuthRequest['user']): Promise<OrgScope> {
  if (!user) return { global: false, locationIds: [] };
  if (user.role === 'SUPER_ADMIN') return { global: true, locationIds: [] };

  const policy = await getApprovalPolicy();
  if (isHrRole(user.role) && policy.hrGlobalScope) return { global: true, locationIds: [] };
  if (isElevated(user.role) && !user.locationId) return { global: true, locationIds: [] };
  if (!user.locationId) return { global: true, locationIds: [] };

  const extras = await getExtraLocationIds(user.id);
  const locationIds = [user.locationId, ...extras.filter((id) => id !== user.locationId)];
  return { global: false, locationIds };
}

export function canAccessLocation(scope: OrgScope, locationId?: string | null): boolean {
  if (scope.global) return true;
  if (!locationId) return true;
  return scope.locationIds.includes(locationId);
}

export async function assertCanAccessLocation(
  user: AuthRequest['user'],
  locationId?: string | null
): Promise<OrgScope> {
  const scope = await resolveScope(user);
  if (!canAccessLocation(scope, locationId)) {
    throw new OrgError(403, 'You do not have access to this location');
  }
  return scope;
}

/** Roles allowed to raise a change request of the given type. */
export async function assertCanCreateRequest(
  user: AuthRequest['user'],
  requestType: OrgRequestType,
  locationId?: string | null,
  policy?: ApprovalPolicy
): Promise<OrgScope> {
  if (!user) throw new OrgError(401, 'Authentication required');
  const effectivePolicy = policy || (await getApprovalPolicy());
  if (!effectivePolicy.creatorRoles.includes(user.role) && user.role !== 'SUPER_ADMIN') {
    auditScopeViolation(user, 'ORG_CREATE_DENIED', requestType, locationId);
    throw new OrgError(403, 'Your role is not permitted to raise organization change requests');
  }
  if (requestType === 'ADMIN_ACCOUNT' && !isElevated(user.role)) {
    auditScopeViolation(user, 'ORG_CREATE_DENIED', requestType, locationId);
    throw new OrgError(
      403,
      'Only a Super Admin or Admin account may request new administrative accounts'
    );
  }
  return assertCanAccessLocation(user, locationId);
}

export async function assertCanViewRequest(
  user: AuthRequest['user'],
  request: { locationId?: string | null; requestType: OrgRequestType }
): Promise<OrgScope> {
  if (!user) throw new OrgError(401, 'Authentication required');
  if (request.requestType === 'ADMIN_ACCOUNT' && !isElevated(user.role) && !isHrRole(user.role)) {
    throw new OrgError(403, 'You do not have access to administrative account requests');
  }
  return assertCanAccessLocation(user, request.locationId);
}

/**
 * Can `user` act on the given approval stage of `request`?
 *
 * Enforced rules:
 *  - a requester can never approve their own submission;
 *  - the reviewer role must belong to the stage's authorized role list;
 *  - the reviewer must be inside the request's location scope;
 *  - the request must actually be waiting on that exact stage (no replay);
 *  - the mandatory final HR stage can only be decided by HR roles.
 */
export function assertStageReviewer(
  user: AuthRequest['user'],
  request: {
    id: string;
    requestedById: string;
    locationId?: string | null;
    status: string;
    currentStage: string;
    requestType: OrgRequestType;
  },
  stage: OrgStageName,
  stageRoles: string[],
  scope: OrgScope
): void {
  if (!user) throw new OrgError(401, 'Authentication required');

  if (request.status !== 'PENDING') {
    throw new OrgError(
      409,
      `This request is ${request.status.toLowerCase()} and can no longer be reviewed`
    );
  }
  if (request.currentStage !== stage) {
    throw new OrgError(
      409,
      `This request is currently waiting on the ${request.currentStage} stage, not ${stage}`
    );
  }
  if (request.requestedById === user.id) {
    auditScopeViolation(user, 'ORG_SELF_APPROVAL_BLOCKED', request.id, request.locationId);
    throw new OrgError(403, 'You cannot approve or reject a request you submitted yourself');
  }
  if (stage === 'HR' && !stageRoles.includes(user.role)) {
    auditScopeViolation(user, 'ORG_HR_STAGE_DENIED', request.id, request.locationId);
    throw new OrgError(403, 'Final approval must be completed by an authorized HR reviewer');
  }
  if (!stageRoles.includes(user.role) && user.role !== 'SUPER_ADMIN') {
    auditScopeViolation(user, 'ORG_STAGE_ROLE_DENIED', request.id, request.locationId);
    throw new OrgError(403, `Your role is not authorized to decide the ${stage} approval stage`);
  }
  if (!canAccessLocation(scope, request.locationId)) {
    auditScopeViolation(user, 'ORG_SCOPE_VIOLATION', request.id, request.locationId);
    throw new OrgError(403, 'This request is outside your authorized location scope');
  }
}

export async function assertCanOverride(
  user: AuthRequest['user'],
  request: { id: string; locationId?: string | null; status: string },
  justification: string
): Promise<EmergencyOverridePolicy> {
  if (!user) throw new OrgError(401, 'Authentication required');
  const policy = await getEmergencyOverridePolicy();
  if (!policy.enabled) {
    throw new OrgError(403, 'Emergency override is disabled by organization policy');
  }
  if (!policy.roles.includes(user.role)) {
    auditScopeViolation(user, 'ORG_OVERRIDE_DENIED', request.id, request.locationId);
    throw new OrgError(403, 'Your role is not authorized to perform an emergency override');
  }
  if (!justification || justification.trim().length < policy.minJustificationLength) {
    throw new OrgError(
      400,
      `An emergency override requires a justification of at least ${policy.minJustificationLength} characters`
    );
  }
  if (request.status !== 'PENDING') {
    throw new OrgError(409, `This request is ${request.status.toLowerCase()} and cannot be overridden`);
  }
  const scope = await resolveScope(user);
  if (!canAccessLocation(scope, request.locationId)) {
    throw new OrgError(403, 'This request is outside your authorized location scope');
  }
  return policy;
}

/** Roles allowed to decide a stage for the given request under current policy. */
export function getStageRoles(policy: ApprovalPolicy, stage: OrgStageName): string[] {
  if (stage === 'HR') return policy.finalRoles;
  return policy.preliminaryRoles;
}

export function stageRequiresPreliminary(
  policy: ApprovalPolicy,
  requestType: OrgRequestType
): boolean {
  return policy.requirePreliminary[requestType] !== false;
}

export function stageLabel(stage: string): string {
  switch (stage) {
    case 'LOCATION_MANAGER':
      return 'Location Manager review';
    case 'FLOOR_MANAGER':
      return 'Floor Manager review';
    case 'DEPARTMENT_MANAGER':
      return 'Department Manager review';
    case 'HR':
      return 'Final HR approval';
    case 'EMERGENCY_OVERRIDE':
      return 'Emergency override';
    case 'COMPLETED':
      return 'Completed';
    default:
      return stage;
  }
}

function auditScopeViolation(
  user: NonNullable<AuthRequest['user']>,
  action: string,
  targetId: string,
  locationId?: string | null
): void {
  AuditService.log({
    userId: user.id,
    locationId: locationId || user.locationId,
    action,
    entityType: 'OrganizationChangeRequest',
    entityId: targetId,
    riskScore: 70,
    tags: ['organization', 'authorization-failure', 'security-alert'],
  }).catch(() => {});
}
