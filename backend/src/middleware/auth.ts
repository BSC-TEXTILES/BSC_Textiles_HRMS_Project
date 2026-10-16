import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { JWT_SECRET, JWT_ISSUER, TOKEN_TTL } from '../config/env.js';
import { SessionService } from '../services/sessionService.js';
import { AuditService } from '../services/auditService.js';
import { cacheService } from '../services/cacheService.js';
import { resolveLocationAlias } from '../services/locationRegistry.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
    databaseId?: string;
    database_id?: string;
    sessionId?: string;
    mfaVerified?: boolean;
  };
  shardDatabaseId?: string;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization?.replace('Bearer ', '');
    const token = authHeader || req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Explicitly restrict algorithm to HS256 to prevent algorithm confusion attacks
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // Fast-path: Check authenticated user cache (15s TTL) to eliminate repeated DB queries on every HTTP request
    const cacheKey = `auth:user:${decoded.userId}`;
    let user = cacheService.get<any>(cacheKey)?.data;

    if (!user) {
      // Check token revocation blocklist
      if (decoded.jti && (await SessionService.isRevoked(decoded.jti))) {
        return res.status(401).json({ error: 'Token has been revoked' });
      }

      // If session ID is present, validate active session in database
      if (decoded.sessionId) {
        const sessionValidation = await SessionService.validateSession(decoded.sessionId);
        if (!sessionValidation.valid) {
          return res.status(401).json({ error: sessionValidation.reason || 'Session expired or invalidated' });
        }
      }

      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          permissions: true,
          locationId: true,
          employeeId: true,
          database_id: true,
          isActive: true,
          status: true,
          lockedUntil: true,
        },
      });

      if (user && user.isActive && (!user.status || user.status === 'ACTIVE')) {
        cacheService.set(cacheKey, user, 15_000);
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
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
      fullName: user.fullName,
      role: user.role,
      permissions: Array.isArray(user.permissions) ? (user.permissions as string[]) : [],
      locationId: user.locationId ?? undefined,
      employeeId: user.employeeId ?? undefined,
      databaseId: resolvedDatabaseId,
      database_id: resolvedDatabaseId,
      sessionId: decoded.sessionId ?? undefined,
      mfaVerified: decoded.mfaVerified ?? false,
    };
    req.shardDatabaseId = resolvedDatabaseId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPermission = permissions.every((permission) => req.user!.permissions.includes(permission));
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

export function generateToken(
  user: {
    id: string;
    email: string;
    role: string;
    permissions: unknown;
    locationId?: string | null;
    employeeId?: string | null;
  },
  options?: {
    sessionId?: string;
    mfaVerified?: boolean;
    expiresIn?: string;
  }
) {
  const payload: Record<string, any> = {
    userId: user.id,
    iss: JWT_ISSUER,
  };

  if (options?.sessionId) {
    payload.sessionId = options.sessionId;
    payload.jti = options.sessionId;
  }

  if (options?.mfaVerified !== undefined) {
    payload.mfaVerified = options.mfaVerified;
  }

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: options?.expiresIn || TOKEN_TTL,
  } as any);
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
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