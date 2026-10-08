import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { JWT_SECRET, JWT_ISSUER, TOKEN_TTL } from '../config/env.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
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

export const authorize = (...permissions: string[]) => {
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
};

export const authorizeLocation = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  const locationId = req.params.locationId || req.body.locationId || req.query.locationId;
  
  if (locationId && req.user.locationId !== locationId) {
    return res.status(403).json({ error: 'Access denied to this location' });
  }

  next();
};

export const generateToken = (user: { id: string; email: string; role: string; permissions: unknown; locationId?: string | null; employeeId?: string | null }) => {
  // Only the subject is carried. Permissions and location scope are re-read from
  // MySQL on every request by `authenticate`, so revoking access takes effect
  // immediately rather than when a 7-day token happens to expire.
  return jwt.sign(
    { userId: user.id, iss: JWT_ISSUER },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, JWT_SECRET);
};