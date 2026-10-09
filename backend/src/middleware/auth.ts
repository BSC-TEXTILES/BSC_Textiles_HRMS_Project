import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { JWT_SECRET, JWT_ISSUER, TOKEN_TTL } from '../config/env.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        locationId: true,
        employeeId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      permissions: Array.isArray(user.permissions) ? (user.permissions as string[]) : [],
      locationId: user.locationId ?? undefined,
      employeeId: user.employeeId ?? undefined,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export function authorize(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Every listed permission is required. The previous `some` check meant
    // authorize('EDIT','DELETE') was satisfied by EDIT alone.
    const hasPermission = permissions.every((permission) => req.user!.permissions.includes(permission));
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!hasPermission && !isSuperAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions' });
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
      return res.status(403).json({ error: 'Forbidden: insufficient role privileges' });
    }

    next();
  };
}

export function isElevatedRole(role?: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function resolveLocationCodeToId(val?: any): string | undefined {
  if (!val || val === 'all' || val === 'ALL') return undefined;
  const s = String(val).toLowerCase();
  const map: Record<string, string> = {
    bel: 'loc_bel',
    belagavi: 'loc_bel',
    dav: 'loc_dav',
    davanagere: 'loc_dav',
    shi: 'loc_shi',
    shivamogga: 'loc_shi',
  };
  return map[s] || String(val);
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
  
  if (locationId && req.user.locationId !== locationId) {
    return res.status(403).json({ error: 'Access denied to this location' });
  }

  next();
}

export function generateToken(user: { id: string; email: string; role: string; permissions: unknown; locationId?: string | null; employeeId?: string | null }) {
  // Only the subject is carried. Permissions and location scope are re-read from
  // MySQL on every request by `authenticate`, so revoking access takes effect
  // immediately rather than when a 7-day token happens to expire.
  return jwt.sign(
    { userId: user.id, iss: JWT_ISSUER },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET);
}