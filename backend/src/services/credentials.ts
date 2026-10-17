/**
 * Credential management — the Admin's responsibility, and explicitly not the
 * Super Admin's.
 *
 * The rules this file enforces:
 *   * login IDs and passwords are created and changed only by an account that
 *     holds the USER_CREDENTIALS capability (`actor.canManageCredentials`)
 *   * a password leaves this module exactly once, in the response to the call
 *     that created it; it is never stored in plaintext, never logged, and never
 *     returned by any later read
 *   * a freshly issued credential forces a password change on first login
 *   * every action writes an audit entry with who, what, when, IP and the old
 *     versus new value — with the password itself absent from both snapshots
 *   * changing a credential invalidates the outstanding tokens and sessions, so
 *     a reset cannot be ignored by a token that is still in someone's memory
 */
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { AuditService } from './auditService.js';
import { PasswordService } from './passwordService.js';
import { EmailNotificationService } from './emailNotificationService.js';
import { raiseSecurityAlert } from './securityAlerts.js';
import { resolveUserAccess, invalidateAccessCaches } from './accessControl.js';
import { legacyTokensForAccess } from './rbacAdmin.js';
import { forceUnlock } from './loginProtection.js';
import { bumpTokenVersion, revokeAllUserTokens } from './tokenService.js';
import { passwordExpiryDays } from './systemSettings.js';
import { assertAcceptable, evaluate, generateTemporaryPassword, type PolicyContext } from './passwordPolicy.js';

export interface CredentialActor {
  id: string;
  email: string;
  role: string;
  ip: string;
  userAgent: string;
  canManageCredentials: boolean;
  canManageRoles: boolean;
}

export class CredentialError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const LOGIN_ID_PATTERN = /^[a-z][a-z0-9._-]{2,31}$/;

/** The legacy `user.role` enum a new credential falls back to when no role is chosen. */
const DEFAULT_LEGACY_ROLE = 'EMPLOYEE';

function normaliseLoginId(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function validateLoginIdShape(loginId: string): void {
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    throw new CredentialError(
      400,
      'INVALID_LOGIN_ID',
      'Login ID must be 3–32 characters, start with a letter, and contain only lowercase letters, numbers, dot, underscore or hyphen.'
    );
  }
}

async function assertLoginIdAvailable(loginId: string, exceptUserId?: string): Promise<void> {
  const [rows]: any = await pool.query(
    'SELECT `id` FROM `user` WHERE LOWER(`loginId`) = ? OR LOWER(`email`) = ? LIMIT 1',
    [loginId, `${loginId}@bsctextiles.com`]
  );
  const clash = (rows || []).find((r: any) => r.id !== exceptUserId);
  if (clash) throw new CredentialError(409, 'LOGIN_ID_TAKEN', `Login ID "${loginId}" is already in use.`);
}

async function assertEmailAvailable(email: string, exceptUserId?: string): Promise<void> {
  const [rows]: any = await pool.query('SELECT `id` FROM `user` WHERE LOWER(`email`) = ? LIMIT 1', [email.toLowerCase()]);
  if (rows?.length && rows[0].id !== exceptUserId) {
    throw new CredentialError(409, 'EMAIL_TAKEN', `Email "${email}" is already registered.`);
  }
}

function requireAdmin(actor: CredentialActor): void {
  if (!actor.canManageCredentials) {
    throw new CredentialError(
      403,
      'CREDENTIALS_ADMIN_ONLY',
      'Only an Admin may create or change login credentials. A Super Admin governs roles, not passwords.'
    );
  }
}

async function loadUser(userId: string): Promise<any> {
  const [rows]: any = await pool.query('SELECT * FROM `user` WHERE `id` = ? LIMIT 1', [userId]);
  if (!rows?.length) throw new CredentialError(404, 'USER_NOT_FOUND', 'User not found.');
  return rows[0];
}

/** Never let the last working Super Admin be disabled or locked out. */
async function assertNotLastSuperAdmin(user: any, action: string): Promise<void> {
  if (String(user.role).toUpperCase() !== 'SUPER_ADMIN') return;
  const [rows]: any = await pool.query(
    "SELECT COUNT(*) AS n FROM `user` WHERE `role` = 'SUPER_ADMIN' AND `isActive` = 1 AND `status` = 'ACTIVE'"
  );
  if (Number(rows?.[0]?.n || 0) <= 1 && user.isActive) {
    throw new CredentialError(400, 'LAST_SUPER_ADMIN', `Cannot ${action} the only active Super Admin — the system would have no way to manage roles.`);
  }
}

async function audit(
  actor: CredentialActor,
  action: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  riskScore = 55
): Promise<void> {
  await AuditService.log({
    userId: actor.id,
    action,
    entityType: 'UserCredential',
    entityId,
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    riskScore,
    tags: ['credential', action.toLowerCase()],
    before,
    after,
  }).catch((err) => console.error('[credentials] audit failed:', err?.message || err));
}

/**
 * Hashes and stores a new password with its history row, expiry and the
 * first-login flag. Returns nothing secret.
 */
async function applyPassword(
  userId: string,
  password: string,
  options: { mustChange: boolean; reason: string; actorId: string }
): Promise<void> {
  const hash = await PasswordService.hashPassword(password);
  const expiryDays = await passwordExpiryDays();
  const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400_000) : null;

  await pool.query(
    `UPDATE \`user\`
        SET \`passwordHash\` = ?, \`mustChangePassword\` = ?, \`mustChangePasswordReason\` = ?,
            \`passwordChangedAt\` = NOW(3), \`passwordExpiresAt\` = ?, \`temporaryPasswordIssuedAt\` = ?,
            \`credentialUpdatedById\` = ?, \`credentialUpdatedAt\` = NOW(3), \`updatedAt\` = NOW(3)
      WHERE \`id\` = ?`,
    [hash, options.mustChange ? 1 : 0, options.reason, expiresAt, options.mustChange ? new Date() : null, options.actorId, userId]
  );

  await PasswordService.recordPasswordHistory(userId, hash);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface CredentialRow {
  id: string;
  loginId: string | null;
  email: string;
  fullName: string;
  legacyRole: string;
  roles: Array<{ roleId: string; name: string }>;
  isActive: boolean;
  status: string;
  mustChangePassword: boolean;
  passwordExpiresAt: Date | null;
  passwordExpired: boolean;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  consecutiveLockouts: number;
  lastLoginAt: Date | null;
  mfaEnabled: boolean;
  createdAt: Date;
}

export async function listCredentials(filters: {
  q?: string;
  roleId?: string;
  status?: string;
  flag?: 'all' | 'locked' | 'pending-change' | 'expired' | 'inactive';
}): Promise<CredentialRow[]> {
  const params: any[] = [];
  let where = '1 = 1';
  if (filters.q) {
    where += ' AND (LOWER(u.email) LIKE ? OR LOWER(u.loginId) LIKE ? OR LOWER(u.fullName) LIKE ?)';
    const needle = `%${String(filters.q).toLowerCase().trim()}%`;
    params.push(needle, needle, needle);
  }
  if (filters.roleId) {
    where += ' AND EXISTS (SELECT 1 FROM `userrole` f WHERE f.`userId` = u.`id` AND f.`roleId` = ?)';
    params.push(filters.roleId);
  }
  if (filters.status && filters.status !== 'ALL') {
    where += ' AND u.`status` = ?';
    params.push(filters.status);
  }
  switch (filters.flag) {
    case 'locked':
      where += ' AND u.`lockedUntil` > NOW(3)';
      break;
    case 'pending-change':
      where += ' AND u.`mustChangePassword` = 1';
      break;
    case 'expired':
      where += ' AND u.`passwordExpiresAt` IS NOT NULL AND u.`passwordExpiresAt` < NOW(3)';
      break;
    case 'inactive':
      where += ' AND (u.`isActive` = 0 OR u.`status` <> "ACTIVE")';
      break;
    default:
      break;
  }

  const [rows]: any = await pool.query(
    `SELECT u.\`id\`, u.\`loginId\`, u.\`email\`, u.\`fullName\`, u.\`role\`, u.\`isActive\`, u.\`status\`,
            u.\`mustChangePassword\`, u.\`passwordExpiresAt\`, u.\`lockedUntil\`, u.\`failedLoginAttempts\`,
            u.\`consecutiveLockouts\`, u.\`lastLoginAt\`, u.\`mfaEnabled\`, u.\`createdAt\`
       FROM \`user\` u WHERE ${where} ORDER BY u.\`fullName\` ASC LIMIT 300`,
    params
  );

  const [assignments]: any = await pool.query(
    'SELECT ur.`userId`, ur.`roleId`, r.`name` FROM `userrole` ur JOIN `role` r ON r.`id` = ur.`roleId`'
  );
  const byUser = new Map<string, Array<{ roleId: string; name: string }>>();
  for (const row of assignments || []) {
    const list = byUser.get(row.userId) || [];
    list.push({ roleId: row.roleId, name: row.name });
    byUser.set(row.userId, list);
  }

  const now = Date.now();
  return (rows || []).map((u: any) => ({
    id: u.id,
    loginId: u.loginId ?? null,
    email: u.email,
    fullName: u.fullName,
    legacyRole: u.role,
    roles: byUser.get(u.id) || [],
    isActive: Boolean(u.isActive),
    status: u.status,
    mustChangePassword: Boolean(u.mustChangePassword),
    passwordExpiresAt: u.passwordExpiresAt ?? null,
    passwordExpired: Boolean(u.passwordExpiresAt && new Date(u.passwordExpiresAt).getTime() < now),
    lockedUntil: u.lockedUntil ?? null,
    failedLoginAttempts: Number(u.failedLoginAttempts || 0),
    consecutiveLockouts: Number(u.consecutiveLockouts || 0),
    lastLoginAt: u.lastLoginAt ?? null,
    mfaEnabled: Boolean(u.mfaEnabled),
    createdAt: u.createdAt,
  }));
}

export async function listRolesForCredentialPicker(): Promise<Array<{ id: string; name: string; isActive: boolean }>> {
  const [rows]: any = await pool.query('SELECT `id`, `name`, `isActive` FROM `role` ORDER BY `name` ASC');
  return (rows || []).map((r: any) => ({ id: r.id, name: r.name, isActive: Boolean(r.isActive) }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateCredentialInput {
  fullName: string;
  loginId: string;
  email?: string;
  roleId?: string;
  password?: string;
  locationId?: string | null;
  employeeId?: string | null;
  mustChangePassword?: boolean;
  note?: string;
}

export interface CreatedCredential {
  user: CredentialRow;
  /** Present exactly once, in this response only. */
  temporaryPassword: string | null;
  generated: boolean;
}

export async function createCredential(input: CreateCredentialInput, actor: CredentialActor): Promise<CreatedCredential> {
  requireAdmin(actor);

  const loginId = normaliseLoginId(input.loginId);
  validateLoginIdShape(loginId);
  await assertLoginIdAvailable(loginId);

  const fullName = String(input.fullName || '').trim();
  if (fullName.length < 2) throw new CredentialError(400, 'INVALID_NAME', 'A full name is required.');

  const email = String(input.email || `${loginId}@bsctextiles.com`).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CredentialError(400, 'INVALID_EMAIL', 'A valid email address is required.');
  await assertEmailAvailable(email);

  const policyContext: PolicyContext = { loginId, fullName, email };
  let password = input.password || '';
  const generated = password.length === 0;
  if (generated) {
    // Retry a few times: the generator is random, and a collision with the
    // identity rules is possible.
    for (let attempt = 0; attempt < 5; attempt++) {
      password = generateTemporaryPassword();
      if (evaluate(password, policyContext).valid) break;
    }
  }
  assertAcceptable(password, policyContext);

  if (input.roleId) {
    const [roleRows]: any = await pool.query('SELECT `id`, `name`, `isActive` FROM `role` WHERE `id` = ? LIMIT 1', [input.roleId]);
    if (!roleRows?.length) throw new CredentialError(400, 'UNKNOWN_ROLE', 'Choose a valid role.');
    if (!roleRows[0].isActive) throw new CredentialError(400, 'INACTIVE_ROLE', `"${roleRows[0].name}" is deactivated. Reactivate it or choose another role.`);
    if (roleRows[0].name === 'SUPER_ADMIN' && !actor.canManageRoles) {
      throw new CredentialError(403, 'SUPER_ADMIN_ASSIGNMENT', 'Only a Super Admin may issue a SUPER_ADMIN account.');
    }
  }

  const id = `usr_${crypto.randomUUID()}`;
  const hash = await PasswordService.hashPassword(password);
  const expiryDays = await passwordExpiryDays();
  const mustChange = input.mustChangePassword !== false;

  await pool.query(
    `INSERT INTO \`user\`
       (\`id\`, \`email\`, \`loginId\`, \`passwordHash\`, \`fullName\`, \`role\`, \`permissions\`,
        \`locationId\`, \`employeeId\`, \`isActive\`, \`status\`, \`accessStatus\`,
        \`mustChangePassword\`, \`mustChangePasswordReason\`, \`temporaryPasswordIssuedAt\`,
        \`passwordChangedAt\`, \`passwordExpiresAt\`, \`credentialCreatedById\`, \`credentialUpdatedById\`,
        \`credentialUpdatedAt\`, \`createdAt\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, 1, 'ACTIVE', 'ACTIVE', ?, 'ADMIN_ISSUED', NOW(3), NOW(3), ?, ?, ?, NOW(3), NOW(3), NOW(3))`,
    [
      id,
      email,
      loginId,
      hash,
      fullName,
      DEFAULT_LEGACY_ROLE,
      input.locationId || null,
      input.employeeId || null,
      mustChange ? 1 : 0,
      expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400_000) : null,
      actor.id,
      actor.id,
    ]
  );

  await PasswordService.recordPasswordHistory(id, hash);

  if (input.roleId) {
    await pool.query('INSERT INTO `userrole` (`id`, `userId`, `roleId`, `createdAt`) VALUES (?, ?, ?, NOW(3))', [
      `ur_${crypto.randomUUID()}`,
      id,
      input.roleId,
    ]);
    await syncLegacyFields(id);
  }

  await audit(
    actor,
    'CREATE',
    id,
    null,
    {
      email,
      loginId,
      fullName,
      roleId: input.roleId || null,
      password: generated ? '<auto-generated, shown once>' : '<admin-supplied, never stored>',
      mustChangePassword: mustChange,
      note: input.note || null,
    },
    70
  );

  await raiseSecurityAlert({
    title: `Credential created for ${loginId}`,
    message: `${actor.email} created login "${loginId}" (${email})${generated ? ' with an auto-generated temporary password' : ''}.`,
    event: {
      type: 'CONFIG_CHANGE',
      severity: 'LOW',
      userId: id,
      ipAddress: actor.ip,
      riskScore: 25,
      details: { loginId, email, createdBy: actor.email, roleId: input.roleId || null },
    },
  });

  invalidateAccessCaches(id);
  const created = await getCredentialRow(id);
  return { user: created, temporaryPassword: password, generated };
}

/** Single row in list shape, so a create response matches the table. */
export async function getCredentialRow(userId: string): Promise<CredentialRow> {
  const [rows]: any = await pool.query(
    `SELECT \`id\`, \`loginId\`, \`email\`, \`fullName\`, \`role\`, \`isActive\`, \`status\`,
            \`mustChangePassword\`, \`passwordExpiresAt\`, \`lockedUntil\`, \`failedLoginAttempts\`,
            \`consecutiveLockouts\`, \`lastLoginAt\`, \`mfaEnabled\`, \`createdAt\`
       FROM \`user\` WHERE \`id\` = ? LIMIT 1`,
    [userId]
  );
  const u = rows?.[0];
  if (!u) throw new CredentialError(404, 'USER_NOT_FOUND', 'User not found.');
  const [assigned]: any = await pool.query(
    'SELECT ur.`roleId`, r.`name` FROM `userrole` ur JOIN `role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = ?',
    [userId]
  );
  const now = Date.now();
  return {
    id: u.id,
    loginId: u.loginId ?? null,
    email: u.email,
    fullName: u.fullName,
    legacyRole: u.role,
    roles: (assigned || []).map((r: any) => ({ roleId: r.roleId, name: r.name })),
    isActive: Boolean(u.isActive),
    status: u.status,
    mustChangePassword: Boolean(u.mustChangePassword),
    passwordExpiresAt: u.passwordExpiresAt ?? null,
    passwordExpired: Boolean(u.passwordExpiresAt && new Date(u.passwordExpiresAt).getTime() < now),
    lockedUntil: u.lockedUntil ?? null,
    failedLoginAttempts: Number(u.failedLoginAttempts || 0),
    consecutiveLockouts: Number(u.consecutiveLockouts || 0),
    lastLoginAt: u.lastLoginAt ?? null,
    mfaEnabled: Boolean(u.mfaEnabled),
    createdAt: u.createdAt,
  };
}

/**
 * Keeps the legacy columns consistent with the RBAC role: `user.role` is a fixed
 * enum and `user.permissions` still gates the older authorize() routes, so both
 * are re-derived from what the assigned roles actually grant.
 */
async function syncLegacyFields(userId: string): Promise<void> {
  const access = await resolveUserAccess(userId);
  const entries = Object.values(access.grants).map((grant) => ({
    module: grant.module,
    enabled: grant.enabled,
    actions: grant.actions,
  }));
  const tokens = legacyTokensForAccess(entries);
  const names = access.roles.map((name) => String(name).toUpperCase());
  const legacy = names.includes('SUPER_ADMIN')
    ? 'SUPER_ADMIN'
    : names.includes('ADMIN')
      ? 'ADMIN'
      : names.includes('HR')
        ? 'HR_MANAGER'
        : names.includes('FLOOR_MANAGER')
          ? 'FLOOR_MANAGER'
          : DEFAULT_LEGACY_ROLE;
  await pool.query('UPDATE `user` SET `role` = ?, `permissions` = ? WHERE `id` = ?', [legacy, JSON.stringify(tokens), userId]);
}

export async function changeLoginId(userId: string, loginId: string, actor: CredentialActor): Promise<void> {
  requireAdmin(actor);
  const user = await loadUser(userId);
  const next = normaliseLoginId(loginId);
  validateLoginIdShape(next);
  await assertLoginIdAvailable(next, userId);

  await pool.query('UPDATE `user` SET `loginId` = ?, `credentialUpdatedById` = ?, `credentialUpdatedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?', [
    next,
    actor.id,
    userId,
  ]);

  await audit(actor, 'UPDATE', userId, { loginId: user.loginId }, { loginId: next });
  // The old identifier must stop working immediately, including for a session
  // that is already open.
  await bumpTokenVersion(userId);
  invalidateAccessCaches(userId);
}

export interface ResetPasswordResult {
  temporaryPassword: string;
  generated: boolean;
  mustChangePassword: boolean;
}

export async function resetPassword(
  userId: string,
  input: { password?: string; mustChangePassword?: boolean; reason?: string; notifyUser?: boolean },
  actor: CredentialActor
): Promise<ResetPasswordResult> {
  requireAdmin(actor);
  const user = await loadUser(userId);

  const policyContext: PolicyContext = { loginId: user.loginId, fullName: user.fullName, email: user.email };
  let password = input.password || '';
  const generated = password.length === 0;
  if (generated) {
    for (let attempt = 0; attempt < 5; attempt++) {
      password = generateTemporaryPassword();
      if (evaluate(password, policyContext).valid) break;
    }
  } else {
    if (await PasswordService.isPasswordInHistory(userId, password)) {
      throw new CredentialError(400, 'PASSWORD_REUSED', `That password was used recently. Choose one that is new to this system.`);
    }
    assertAcceptable(password, policyContext);
  }

  const mustChange = input.mustChangePassword !== false;
  await applyPassword(userId, password, {
    mustChange,
    reason: input.reason || 'ADMIN_RESET',
    actorId: actor.id,
  });

  // A reset is the moment to assume the previous credential is compromised.
  await bumpTokenVersion(userId);
  await revokeAllUserTokens(userId, 'PASSWORD_CHANGE');
  const { SessionService } = await import('./sessionService.js');
  await SessionService.revokeAllUserSessions(userId, 'PASSWORD_CHANGE').catch(() => undefined);

  await audit(
    actor,
    'UPDATE',
    userId,
    { password: '<redacted>', mustChangePassword: Boolean(user.mustChangePassword) },
    {
      password: generated ? '<auto-generated, shown once>' : '<admin-supplied, never stored>',
      mustChangePassword: mustChange,
      reason: input.reason || 'ADMIN_RESET',
      sessionsRevoked: true,
    },
    80
  );

  if (input.notifyUser !== false) {
    await EmailNotificationService.sendPasswordChangedAlert({
      to: user.email,
      fullName: user.fullName,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    }).catch(() => undefined);
  }

  await raiseSecurityAlert({
    title: `Password reset for ${user.loginId || user.email}`,
    message: `${actor.email} reset the password for ${user.email}${generated ? ' to an auto-generated temporary value' : ''}. Outstanding sessions were revoked.`,
    alsoEmail: [user.email],
    event: {
      type: 'CONFIG_CHANGE',
      severity: 'MEDIUM',
      userId,
      ipAddress: actor.ip,
      riskScore: 55,
      details: { targetEmail: user.email, generated, mustChange, reason: input.reason || 'ADMIN_RESET' },
    },
  });

  return { temporaryPassword: password, generated, mustChangePassword: mustChange };
}

export async function setMustChangePassword(userId: string, mustChange: boolean, actor: CredentialActor): Promise<void> {
  requireAdmin(actor);
  const user = await loadUser(userId);
  await pool.query(
    'UPDATE `user` SET `mustChangePassword` = ?, `mustChangePasswordReason` = ?, `credentialUpdatedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?',
    [mustChange ? 1 : 0, mustChange ? 'ADMIN_REQUESTED' : null, userId]
  );
  await audit(actor, 'UPDATE', userId, { mustChangePassword: Boolean(user.mustChangePassword) }, { mustChange });
}

export async function setAccountActive(
  userId: string,
  active: boolean,
  actor: CredentialActor,
  reason?: string
): Promise<void> {
  requireAdmin(actor);
  const user = await loadUser(userId);
  if (userId === actor.id && !active) {
    throw new CredentialError(400, 'SELF_DEACTIVATION', 'You cannot deactivate your own account.');
  }
  if (!active) await assertNotLastSuperAdmin(user, 'deactivate');

  await pool.query(
    'UPDATE `user` SET `isActive` = ?, `status` = ?, `accessStatus` = ?, `disabledAt` = ?, `disabledById` = ?, `disableReason` = ?, `updatedAt` = NOW(3) WHERE `id` = ?',
    [
      active ? 1 : 0,
      active ? 'ACTIVE' : 'DISABLED',
      active ? 'ACTIVE' : 'DISABLED',
      active ? null : new Date(),
      active ? null : actor.id,
      active ? null : String(reason || '').slice(0, 500),
      userId,
    ]
  );

  if (!active) {
    await bumpTokenVersion(userId);
    await revokeAllUserTokens(userId, 'ADMIN_REVOKE');
    const { SessionService } = await import('./sessionService.js');
    await SessionService.revokeAllUserSessions(userId, 'ADMIN_REVOKE').catch(() => undefined);
  }

  await audit(
    actor,
    'UPDATE',
    userId,
    { isActive: Boolean(user.isActive), status: user.status },
    { isActive: active, status: active ? 'ACTIVE' : 'DISABLED', reason: reason || null },
    75
  );
}

export async function unlockAccount(userId: string, actor: CredentialActor): Promise<void> {
  requireAdmin(actor);
  const user = await loadUser(userId);
  await forceUnlock(userId, { id: actor.id, email: actor.email, ip: actor.ip });
  await audit(actor, 'UNLOCK', userId, { lockedUntil: user.lockedUntil, consecutiveLockouts: user.consecutiveLockouts }, { lockedUntil: null, consecutiveLockouts: 0 });
}

export interface OwnPasswordChangeContext {
  sessionId?: string | null;
  ip: string;
  userAgent: string;
}

/**
 * The user's own change: the current password must verify, the new one must
 * satisfy the policy against *their* identity, and the last N hashes are
 * rejected. Both the user and the Admins are told.
 */
export async function changeOwnPassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  context: OwnPasswordChangeContext
): Promise<{ mustChangePassword: false }> {
  const user = await loadUser(userId);
  const check = await PasswordService.verifyPassword(input.currentPassword, user.passwordHash);
  if (!check.valid) {
    throw new CredentialError(401, 'CURRENT_PASSWORD_INVALID', 'Your current password is incorrect.');
  }
  if (await PasswordService.isPasswordInHistory(userId, input.newPassword)) {
    throw new CredentialError(
      400,
      'PASSWORD_REUSED',
      `You have used this password before. Choose a new one (the last ${securityConfig.password.historyCount} are remembered).`
    );
  }
  assertAcceptable(input.newPassword, { loginId: user.loginId, fullName: user.fullName, email: user.email });

  if (await PasswordService.checkCompromised(input.newPassword)) {
    throw new CredentialError(400, 'PASSWORD_BREACHED', 'That password appears in a known breach list. Choose another.');
  }

  await applyPassword(userId, input.newPassword, { mustChange: false, reason: 'SELF_CHANGED', actorId: userId });

  await bumpTokenVersion(userId);
  await revokeAllUserTokens(userId, 'PASSWORD_CHANGE');
  const { SessionService } = await import('./sessionService.js');
  // Sign the caller out everywhere, including this device.
  await SessionService.revokeAllUserSessions(userId, 'PASSWORD_CHANGE').catch(() => undefined);

  await audit(
    { ...adminActorFromUser(user, context), canManageCredentials: true } as CredentialActor,
    'UPDATE',
    userId,
    { password: '<redacted>' },
    { password: '<changed by owner>', mustChangePassword: false, selfService: true },
    60
  );

  await EmailNotificationService.sendPasswordChangedAlert({
    to: user.email,
    fullName: user.fullName,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  }).catch(() => undefined);

  await raiseSecurityAlert({
    title: `Password changed by ${user.loginId || user.email}`,
    message: `${user.email} changed their own password from ${context.ip}. All sessions were signed out.`,
    event: {
      type: 'CONFIG_CHANGE',
      severity: 'LOW',
      userId,
      ipAddress: context.ip,
      riskScore: 20,
      details: { email: user.email, selfService: true },
    },
  });

  return { mustChangePassword: false };
}

function adminActorFromUser(user: any, context: OwnPasswordChangeContext): Omit<CredentialActor, 'canManageCredentials'> {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    ip: context.ip,
    userAgent: context.userAgent,
    canManageRoles: false,
  };
}

/** The pending-action counts the credential screen and dashboard show. */
export async function credentialSummary(): Promise<{
  total: number;
  pendingPasswordChange: number;
  expired: number;
  locked: number;
  inactive: number;
  withoutRole: number;
}> {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN \`mustChangePassword\` = 1 THEN 1 ELSE 0 END) AS pendingChange,
            SUM(CASE WHEN \`passwordExpiresAt\` IS NOT NULL AND \`passwordExpiresAt\` < NOW(3) THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN \`lockedUntil\` > NOW(3) THEN 1 ELSE 0 END) AS locked,
            SUM(CASE WHEN \`isActive\` = 0 OR \`status\` <> 'ACTIVE' THEN 1 ELSE 0 END) AS inactive,
            SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM \`userrole\` ur WHERE ur.\`userId\` = \`user\`.\`id\`) THEN 1 ELSE 0 END) AS withoutRole
       FROM \`user\``
  );
  const row = rows?.[0] || {};
  return {
    total: Number(row.total || 0),
    pendingPasswordChange: Number(row.pendingChange || 0),
    expired: Number(row.expired || 0),
    locked: Number(row.locked || 0),
    inactive: Number(row.inactive || 0),
    withoutRole: Number(row.withoutRole || 0),
  };
}
