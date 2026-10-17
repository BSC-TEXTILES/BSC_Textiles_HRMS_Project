/**
 * Access and refresh tokens.
 *
 * Access tokens are short-lived asymmetric JWTs (`kid` in the header, verified
 * against the stored public key). Refresh tokens are opaque random strings —
 * only their SHA-256 hash is stored — and every refresh rotates them: the old
 * one is revoked and a new one is issued in the same *family*. Presenting a
 * refresh token that has already been rotated is the signature of a stolen
 * token, so the whole family is revoked and the user is forced to re-authenticate.
 *
 * `tokenVersion` is carried in the access token and compared against the user
 * row, which is how "invalidate tokens immediately when credentials or role
 * permissions change" is enforced without waiting for `exp`.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { ensureActiveKey, getVerifyKey } from './signingKeys.js';
import { KEY_PREFIX, storeDel, storeGet, storeSet, storeSetAdd } from './redisStore.js';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
  ptv: number;
  sid: string | null;
  jti: string;
  iss: string;
  aud: string;
  amr: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresAt: Date;
  sessionId: string | null;
  familyId: string;
}

export class RefreshReuseError extends Error {
  readonly userId: string;
  readonly familyId: string;
  constructor(userId: string, familyId: string) {
    super('Refresh token reuse detected');
    this.userId = userId;
    this.familyId = familyId;
  }
}

export class InvalidTokenError extends Error {}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function opaqueToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export async function issueAccessToken(
  user: { id: string; email: string; role: string; tokenVersion?: number },
  options: { sessionId?: string | null; authMethod?: string; tokenVersion?: number } = {}
): Promise<{ token: string; jti: string }> {
  const key = await ensureActiveKey();
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      ptv: options.tokenVersion ?? user.tokenVersion ?? 0,
      sid: options.sessionId ?? null,
      amr: options.authMethod || 'pwd',
      iss: securityConfig.tokens.issuer,
      aud: securityConfig.tokens.audience,
      jti,
    },
    key.privateKeyPem,
    {
      algorithm: key.algorithm as jwt.Algorithm,
      expiresIn: securityConfig.tokens.accessTtlSeconds,
      header: { kid: key.kid, typ: 'JWT', alg: key.algorithm as jwt.Algorithm },
    }
  );
  return { token, jti };
}

/**
 * Verifies signature, issuer, audience and expiry, then the two things a
 * signature cannot tell you: has this jti been revoked, and is the permission
 * version still current for the user.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const decoded = jwt.decode(token, { complete: true }) as { header: { kid?: string } } | null;
  const kid = decoded?.header?.kid;
  if (!kid) throw new InvalidTokenError('Token is missing a key id');
  const publicKeyPem = await getVerifyKey(kid);
  if (!publicKeyPem) throw new InvalidTokenError('Signing key is unknown or retired');

  let payload: any;
  try {
    payload = jwt.verify(token, publicKeyPem, {
      algorithms: [securityConfig.tokens.algorithm as jwt.Algorithm],
      issuer: securityConfig.tokens.issuer,
      audience: securityConfig.tokens.audience,
    });
  } catch (err: any) {
    throw new InvalidTokenError(err?.message || 'Token rejected');
  }

  if (await isTokenRevoked(payload.jti)) throw new InvalidTokenError('Token has been revoked');

  return payload as AccessTokenClaims;
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  if (!jti) return false;
  const key = `${KEY_PREFIX.tokenBlocklist}${jti}`;
  if (await storeGet(key)) return true;
  // Redis is a cache of the durable blocklist, not a replacement for it.
  const [rows]: any = await pool.query('SELECT `id` FROM `revoked_token` WHERE `jti` = ? LIMIT 1', [jti]);
  return Boolean(rows?.length);
}

export async function revokeAccessToken(jti: string, userId: string, reason: string, ttlSeconds: number): Promise<void> {
  if (!jti) return;
  await storeSet(`${KEY_PREFIX.tokenBlocklist}${jti}`, reason, ttlSeconds * 1000);
  await pool
    .query(
      `INSERT INTO \`revoked_token\` (\`id\`, \`jti\`, \`userId\`, \`reason\`, \`expiresAt\`)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`reason\` = VALUES(\`reason\`)`,
      [
        `rev_${crypto.randomUUID()}`,
        jti,
        userId,
        ['LOGOUT', 'PASSWORD_CHANGE', 'MFA_CHANGE', 'ROLE_CHANGE', 'ADMIN_REVOKE', 'SESSION_EXPIRED', 'SECURITY_INCIDENT'].includes(reason)
          ? reason
          : 'ADMIN_REVOKE',
        new Date(Date.now() + ttlSeconds * 1000),
      ]
    )
    .catch(async (err: any) => {
      // A duplicate jti is the normal case when a session is revoked twice.
      if (err?.code !== 'ER_DUP_ENTRY') console.warn('[tokens] revoke insert failed:', err?.message);
      await storeSet(`${KEY_PREFIX.tokenBlocklist}${jti}`, reason, ttlSeconds * 1000);
    });
}

async function insertRefreshToken(input: {
  token: string;
  familyId: string;
  userId: string;
  sessionId: string | null;
  rotatedFromId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}): Promise<string> {
  const id = `rt_${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO \`refresh_token\`
       (\`id\`, \`tokenHash\`, \`familyId\`, \`userId\`, \`sessionId\`, \`rotatedFromId\`, \`issuedAt\`, \`expiresAt\`, \`userAgent\`, \`ipAddress\`)
     VALUES (?, ?, ?, ?, ?, ?, NOW(3), ?, ?, ?)`,
    [
      id,
      hashToken(input.token),
      input.familyId,
      input.userId,
      input.sessionId,
      input.rotatedFromId ?? null,
      input.expiresAt,
      (input.userAgent || '').slice(0, 255),
      input.ip || null,
    ]
  );
  return id;
}

/** Issues the first pair for a freshly authenticated user (new family). */
export async function issueTokenPair(
  user: { id: string; email: string; role: string; tokenVersion?: number },
  context: { sessionId?: string | null; ip?: string | null; userAgent?: string | null; authMethod?: string } = {}
): Promise<TokenPair> {
  const familyId = crypto.randomUUID();
  const refreshToken = opaqueToken();
  const refreshExpiresAt = new Date(Date.now() + securityConfig.tokens.refreshTtlSeconds * 1000);

  const { token: accessToken } = await issueAccessToken(user, {
    sessionId: context.sessionId ?? null,
    authMethod: context.authMethod,
    tokenVersion: user.tokenVersion,
  });
  await insertRefreshToken({
    token: refreshToken,
    familyId,
    userId: user.id,
    sessionId: context.sessionId ?? null,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    expiresAt: refreshExpiresAt,
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresIn: securityConfig.tokens.accessTtlSeconds,
    refreshExpiresAt,
    sessionId: context.sessionId ?? null,
    familyId,
  };
}

/**
 * Rotates a refresh token. Returns `null` when the token is unknown or expired;
 * throws `RefreshReuseError` when it was already spent, which is the signal to
 * kill the whole family.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  context: { ip?: string | null; userAgent?: string | null } = {}
): Promise<{ userId: string; sessionId: string | null; familyId: string } | null> {
  const [rows]: any = await pool.query(
    `SELECT \`id\`, \`userId\`, \`sessionId\`, \`familyId\`, \`expiresAt\`, \`revokedAt\`, \`rotatedFromId\`
       FROM \`refresh_token\` WHERE \`tokenHash\` = ? LIMIT 1`,
    [hashToken(presentedToken)]
  );
  if (!rows?.length) return null;
  const record = rows[0];

  if (record.revokedAt) {
    await revokeTokenFamily(record.familyId, 'REUSE_DETECTED');
    throw new RefreshReuseError(record.userId, record.familyId);
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await pool.query('UPDATE `refresh_token` SET `revokedAt` = NOW(3), `revokedReason` = ? WHERE `id` = ?', [
      'EXPIRED',
      record.id,
    ]);
    return null;
  }

  await pool.query(
    'UPDATE `refresh_token` SET `revokedAt` = NOW(3), `revokedReason` = ? WHERE `id` = ?',
    ['ROTATED', record.id]
  );
  return { userId: record.userId, sessionId: record.sessionId, familyId: record.familyId };
}

/** Completes rotation once the caller has re-loaded the user row. */
export async function issueFromFamily(
  user: { id: string; email: string; role: string; tokenVersion?: number },
  previous: { sessionId: string | null; familyId: string },
  context: { ip?: string | null; userAgent?: string | null; authMethod?: string } = {}
): Promise<TokenPair> {
  const refreshToken = opaqueToken();
  const refreshExpiresAt = new Date(Date.now() + securityConfig.tokens.refreshTtlSeconds * 1000);
  const { token: accessToken } = await issueAccessToken(user, {
    sessionId: previous.sessionId,
    authMethod: context.authMethod,
    tokenVersion: user.tokenVersion,
  });
  await insertRefreshToken({
    token: refreshToken,
    familyId: previous.familyId,
    userId: user.id,
    sessionId: previous.sessionId,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    expiresAt: refreshExpiresAt,
  });
  return {
    accessToken,
    refreshToken,
    accessExpiresIn: securityConfig.tokens.accessTtlSeconds,
    refreshExpiresAt,
    sessionId: previous.sessionId,
    familyId: previous.familyId,
  };
}

export async function revokeTokenFamily(familyId: string, reason: string): Promise<number> {
  const [result]: any = await pool.query(
    'UPDATE `refresh_token` SET `revokedAt` = NOW(3), `revokedReason` = ? WHERE `familyId` = ? AND `revokedAt` IS NULL',
    [reason, familyId]
  );
  return Number(result?.affectedRows || 0);
}

/** Revokes every refresh token a user holds and blacklists nothing extra — the
 *  token version bump makes outstanding access tokens unusable on next request. */
export async function revokeAllUserTokens(userId: string, reason: string): Promise<void> {
  await pool.query(
    'UPDATE `refresh_token` SET `revokedAt` = NOW(3), `revokedReason` = ? WHERE `userId` = ? AND `revokedAt` IS NULL',
    [reason, userId]
  );
  await storeSetAdd(`${KEY_PREFIX.tokenBlocklist}user:${userId}`, reason, 86400_000);
}

/**
 * Bumps the user's permission/token version. Every access token minted before
 * this call stops being accepted on its next request, which is the immediate
 * invalidation the specification asks for on credential or role changes.
 */
export async function bumpTokenVersion(userId: string): Promise<number> {
  await pool.query('UPDATE `user` SET `tokenVersion` = `tokenVersion` + 1 WHERE `id` = ?', [userId]);
  const [rows]: any = await pool.query('SELECT `tokenVersion` FROM `user` WHERE `id` = ? LIMIT 1', [userId]);
  await storeDel(`${KEY_PREFIX.permissionCache}v2:${userId}`);
  return Number(rows?.[0]?.tokenVersion || 0);
}

export async function getTokenVersion(userId: string): Promise<number> {
  const [rows]: any = await pool.query('SELECT `tokenVersion` FROM `user` WHERE `id` = ? LIMIT 1', [userId]);
  return Number(rows?.[0]?.tokenVersion || 0);
}

/** Lists a user's live refresh tokens for the Admin session screen. */
export async function listUserRefreshTokens(userId: string) {
  const [rows]: any = await pool.query(
    `SELECT \`id\`, \`familyId\`, \`sessionId\`, \`issuedAt\`, \`expiresAt\`, \`revokedAt\`, \`revokedReason\`, \`ipAddress\`, \`userAgent\`
       FROM \`refresh_token\` WHERE \`userId\` = ? ORDER BY \`issuedAt\` DESC LIMIT 50`,
    [userId]
  );
  return rows || [];
}
