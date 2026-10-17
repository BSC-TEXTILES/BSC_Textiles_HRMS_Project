import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { JWT_SECRET, JWT_ISSUER, TOKEN_TTL } from '../config/env.js';
import { SessionService } from '../services/sessionService.js';
import { AuditService } from '../services/auditService.js';
import { cacheService } from '../services/cacheService.js';
import { resolveLocationAlias } from '../services/locationRegistry.js';
import type { EffectiveAccess } from '../services/accessControl.js';
import { readAccessToken, verifyCsrfBinding } from '../services/authCookies.js';
import { verifyAccessToken, issueAccessToken, type AccessTokenClaims } from '../services/tokenService.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    loginId?: string | null;
    fullName: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
    databaseId?: string;
    database_id?: string;
    sessionId?: string;
    mfaVerified?: boolean;
    mustChangePassword?: boolean;
    passwordExpiresAt?: Date | null;
    tokenVersion?: number;
    jti?: string;
    accessExpiresAt?: Date | null;
  };
  shardDatabaseId?: string;
  /** Resolved action-level grants, populated by the rbac guards. */
  access?: EffectiveAccess;
}

/**
 * Authenticates a request from an access token.
 *
 * The token may arrive as an HttpOnly cookie (the browser) or an Authorization
 * bearer header (mobile app, device connector). Either way it is verified with
 * the server's asymmetric key through `tokenService`, which also covers the
 * revocation list and the permission version — so a credential or role change
 * takes effect on the victim's very next request, not when the token expires.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = readAccessToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let claims: AccessTokenClaims;
    try {
      claims = await verifyAccessToken(token);
    } catch (error: any) {
      const expired = /expired/i.test(error?.message || '');
      return res.status(401).json({
        error: expired ? 'Token expired' : 'Invalid or expired token',
        message: expired ? 'Access token has expired; refresh or sign in again.' : 'Invalid credentials.',
        code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      });
    }

    const cacheKey = `auth:user:${claims.sub}`;
    let user = cacheService.get<any>(cacheKey)?.data;

    if (!user || Number(user.tokenVersion || 0) !== Number(claims.ptv || 0)) {
      if (claims.sid) {
        const sessionValidation = await SessionService.validateSession(claims.sid);
        if (!sessionValidation.valid) {
          return res.status(401).json({
            error: 'Session ended',
            message: sessionValidation.reason || 'Your session is no longer valid.',
            code: 'SESSION_INVALID',
          });
        }
      }

      user = await prisma.user.findUnique({
        where: { id: claims.sub },
        select: {
          id: true,
          email: true,
          loginId: true,
          fullName: true,
          role: true,
          permissions: true,
          locationId: true,
          employeeId: true,
          database_id: true,
          isActive: true,
          status: true,
          lockedUntil: true,
          mustChangePassword: true,
          passwordExpiresAt: true,
          tokenVersion: true,
          mfaEnabled: true,
        },
      });

      if (user && user.isActive && (!user.status || user.status === 'ACTIVE')) {
        cacheService.set(cacheKey, user, 15_000);
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Cookie-authenticated writes carry a session-bound CSRF token. Bearer
    // clients are exempt: a cross-site attacker cannot set an Authorization
    // header, which is exactly the property double-submit cookies imitate.
    const usedCookie = !req.headers.authorization && Boolean(readAccessToken(req));
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (usedCookie && mutating && claims.sid) {
      const headerToken = req.headers['x-csrf-token'] as string | undefined;
      const bound = await verifyCsrfBinding(claims.sid, headerToken);
      if (!bound || !headerToken) {
        return res.status(403).json({
          error: 'CSRF token validation failed',
          code: 'CSRF_FAILED',
          message: 'This request could not be verified as coming from your session.',
        });
      }
    }

    // A token minted before the current permission version is dead: this is how
    // an Admin's credential reset or role change invalidates live sessions
    // immediately instead of waiting for `exp`.
    if (Number(user.tokenVersion || 0) !== Number(claims.ptv || 0)) {
      cacheService.delete(cacheKey);
      return res.status(401).json({
        error: 'Session revoked',
        message: 'Your access was changed or your credentials were updated. Please sign in again.',
        code: 'TOKEN_STALE',
      });
    }

    // Check account status: only ACTIVE accounts may access protected application modules
    if (user.status && user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Account not active',
        status: user.status,
        message:
          user.status === 'PENDING_APPROVAL'
            ? 'Your account is currently awaiting HR approval'
            : user.status === 'PENDING_EMAIL_VERIFICATION'
            ? 'Please verify your email address to continue'
            : 'Your account has been suspended or deactivated. Please contact HR.',
      });
    }

    // Check account lockout
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      return res.status(403).json({
        error: 'Account temporarily locked',
        message: 'Too many failed login attempts. Please try again later or contact support.',
      });
    }

    const resolvedDatabaseId =
      user.database_id ||
      (user.locationId
        ? user.locationId.includes('cmuwszr8t')
          ? 'BSC-SHARD-BEL-001'
          : user.locationId.includes('cmuwszr95')
          ? 'BSC-SHARD-DAV-001'
          : user.locationId.includes('cmuwszr9s')
          ? 'BSC-SHARD-SHI-001'
          : 'BSC-SHARD-HQ-001'
        : 'BSC-SHARD-HQ-001');

    req.user = {
      id: user.id,
      email: user.email,
      loginId: user.loginId ?? undefined,
      fullName: user.fullName,
      role: user.role,
      permissions: Array.isArray(user.permissions) ? (user.permissions as string[]) : [],
      locationId: user.locationId ?? undefined,
      employeeId: user.employeeId ?? undefined,
      databaseId: resolvedDatabaseId,
      database_id: resolvedDatabaseId,
      sessionId: claims.sid ?? undefined,
      mfaVerified: claims.amr?.includes('mfa') ?? false,
      mustChangePassword: Boolean(user.mustChangePassword),
      passwordExpiresAt: user.passwordExpiresAt ?? null,
      tokenVersion: Number(user.tokenVersion || 0),
      jti: claims.jti,
      accessExpiresAt: claims.exp ? new Date(claims.exp * 1000) : null,
    };
    req.shardDatabaseId = resolvedDatabaseId;

    // A temporary or expired password restricts the session to the handful of
    // endpoints needed to replace it, so an Admin-issued credential can never
    // become a permanent full-access login.
    if (req.user.mustChangePassword && !PASSWORD_CHANGE_EXEMPT.some((prefix) => fullPathOf(req).startsWith(prefix))) {
      return res.status(403).json({
        error: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Set a new password before using the rest of the system.',
        redirect: '/change-password',
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Prefixes reachable while a password change is outstanding. */
const PASSWORD_CHANGE_EXEMPT = [
  '/api/session/password',
  '/api/session/logout',
  '/api/session/status',
  '/api/session/refresh',
  '/api/session/exchange',
  '/api/session/consent',
  '/api/session/captcha',
  // The pre-session-rename mobile path. Without this an old client on a forced
  // change gets 403 from the gate and 403 from nowhere else to go.
  '/api/auth/change-password',
  '/api/auth/session/password',
  '/api/auth/session/logout',
  '/api/auth/session/status',
  '/api/auth/session/refresh',
  '/api/auth/session/exchange',
  '/api/auth/session/consent',
  '/api/auth/session/captcha',
  '/api/auth/me',
  '/api/access/me',
];

function fullPathOf(req: Request): string {
  return req.originalUrl || req.url || '';
}

export function authorize(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 'ALL' is the legacy wildcard token. It used to be compared as an ordinary
    // permission, so every account carrying ["ALL"] was rejected by the 141
    // authorize('VIEW') routes.
    const tokens = req.user.permissions;
    const unrestricted = tokens.includes('ALL');
    const hasPermission = unrestricted || permissions.every((permission) => tokens.includes(permission));
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!hasPermission && !isSuperAdmin) {
      // Audit log the authorization violation attempt
      AuditService.log({
        userId: req.user.id,
        locationId: req.user.locationId,
        action: 'UNAUTHORIZED_PERMISSION_ATTEMPT',
        entityType: 'API_ENDPOINT',
        entityId: req.originalUrl,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
        riskScore: 60,
        tags: ['authorization-failure', 'security-alert'],
        after: { requiredPermissions: permissions, userPermissions: req.user.permissions },
      }).catch(() => {});

      return res.status(403).json({
        error: 'Forbidden: insufficient permissions',
        message: 'You do not have permission to perform this action.',
      });
    }

    next();
  };
}

export const requireAuth = authenticate;

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const hasRole = roles.includes(req.user.role);

    if (!hasRole && !isSuperAdmin) {
      AuditService.log({
        userId: req.user.id,
        locationId: req.user.locationId,
        action: 'UNAUTHORIZED_ROLE_ATTEMPT',
        entityType: 'API_ENDPOINT',
        entityId: req.originalUrl,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
        riskScore: 65,
        tags: ['role-violation', 'security-alert'],
        after: { requiredRoles: roles, userRole: req.user.role },
      }).catch(() => {});

      return res.status(403).json({
        error: 'Forbidden: insufficient role privileges',
        message: 'You do not have permission to perform this action.',
      });
    }

    next();
  };
}

export function isElevatedRole(role?: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function resolveLocationCodeToId(val?: any): string | undefined {
  // Backed by `locationRegistry`, which reads the `location` table. This
  // replaces the previous hard-coded BEL/DAV/SHI literal map: a location
  // created through /api/locations is now resolvable by every module —
  // attendance, payroll, analysis, organisation — without a code change.
  return resolveLocationAlias(val);
}

export function getScopedLocationId(user?: AuthRequest['user'], requestedLocationId?: any): string | undefined {
  if (!user) return undefined;
  const resolvedRequested = resolveLocationCodeToId(requestedLocationId);
  if (resolvedRequested) {
    if (isElevatedRole(user.role)) return resolvedRequested;
    if (user.locationId && user.locationId === resolvedRequested) return user.locationId;
    return user.locationId ?? undefined;
  }
  if (isElevatedRole(user.role)) return undefined;
  return user.locationId ?? undefined;
}

export function authorizeLocation(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (isElevatedRole(req.user.role)) {
    return next();
  }

  const locationId = req.params.locationId || req.body.locationId || req.query.locationId;
  const resolvedLocation = resolveLocationCodeToId(locationId);

  if (resolvedLocation && req.user.locationId && req.user.locationId !== resolvedLocation) {
    AuditService.log({
      userId: req.user.id,
      locationId: req.user.locationId,
      action: 'UNAUTHORIZED_LOCATION_ATTEMPT',
      entityType: 'Location',
      entityId: resolvedLocation,
      ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
      riskScore: 70,
      tags: ['location-violation', 'security-alert'],
    }).catch(() => {});

    return res.status(403).json({
      error: 'Access denied to this location',
      message: 'You do not have permission to perform this action.',
    });
  }

  next();
}

/**
 * Issues an access token for the given user.
 *
 * Kept as the single helper the auth routes call, but it now delegates to the
 * asymmetric token service, so every token in circulation is ES256-signed with
 * a `kid` and carries the permission version. It is async because key lookup and
 * version reads are.
 */
export async function generateToken(
  user: {
    id: string;
    email: string;
    role: string;
    permissions: unknown;
    locationId?: string | null;
    employeeId?: string | null;
    tokenVersion?: number;
  },
  options?: {
    sessionId?: string;
    mfaVerified?: boolean;
    expiresIn?: string;
    tokenVersion?: number;
  }
): Promise<string> {
  const { token } = await issueAccessToken(
    { id: user.id, email: user.email, role: user.role, tokenVersion: options?.tokenVersion ?? user.tokenVersion ?? 0 },
    { sessionId: options?.sessionId ?? null, authMethod: options?.mfaVerified ? 'pwd+mfa' : 'pwd' }
  );
  return token;
}

export function verifyToken(token: string): Promise<AccessTokenClaims> {
  return verifyAccessToken(token);
}

export function enforceShardAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const requestedLocationId =
    (req.params?.locationId as string) ||
    (req.query?.locationId as string) ||
    (req.body?.locationId as string) ||
    undefined;

  const requestedDatabaseId =
    (req.params?.databaseId as string) ||
    (req.query?.databaseId as string) ||
    (req.body?.databaseId as string) ||
    (req.headers['x-shard-id'] as string) ||
    undefined;

  const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
  const userDbId = req.user.database_id || req.user.databaseId || 'BSC-SHARD-HQ-001';

  if (!isSuperAdmin) {
    if (requestedDatabaseId && requestedDatabaseId !== userDbId) {
      AuditService.log({
        userId: req.user.id,
        locationId: req.user.locationId,
        action: 'CROSS_SHARD_ACCESS_VIOLATION',
        entityType: 'SHARD_ROUTER',
        entityId: requestedDatabaseId,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
        riskScore: 75,
        tags: ['sharding-security', 'cross-shard-violation', 'tamper-detected'],
        after: {
          requestedDatabaseId,
          userDatabaseId: userDbId,
        },
      }).catch(() => {});

      return res.status(403).json({
        error: 'Forbidden: Cross-shard access violation',
        message: `User with role '${req.user.role}' is restricted to assigned shard '${userDbId}'. Cannot route to '${requestedDatabaseId}'.`,
      });
    }

    if (requestedLocationId && req.user.locationId && requestedLocationId !== req.user.locationId) {
      AuditService.log({
        userId: req.user.id,
        locationId: req.user.locationId,
        action: 'CROSS_LOCATION_ACCESS_VIOLATION',
        entityType: 'SHARD_ROUTER',
        entityId: requestedLocationId,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
        riskScore: 75,
        tags: ['sharding-security', 'cross-location-violation'],
        after: {
          requestedLocationId,
          userLocationId: req.user.locationId,
        },
      }).catch(() => {});

      return res.status(403).json({
        error: 'Forbidden: Location access violation',
        message: `User is restricted to assigned location '${req.user.locationId}'. Cannot access '${requestedLocationId}'.`,
      });
    }
  }

  req.shardDatabaseId = requestedDatabaseId || userDbId;
  next();
}