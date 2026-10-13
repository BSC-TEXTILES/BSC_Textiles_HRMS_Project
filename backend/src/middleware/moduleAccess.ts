/**
 * Module-level RBAC enforcement middleware.
 *
 * requireModuleAccess('BIOMETRIC_POLICY', 'edit') rejects with 403 when the
 * authenticated user's merged RBAC matrix does not reach the required level.
 * Users with no RBAC role assignments fall through to the legacy
 * authorize()/requireRole() permission model (documented behaviour).
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { AuditService } from '../services/auditService.js';
import { getUserModuleAccess, accessRank, AccessLevel } from '../services/rbacService.js';

export function requireModuleAccess(module: string, minAccess: Exclude<AccessLevel, 'none'> = 'view') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const userAccess = await getUserModuleAccess(req.user.id, req.user.role);
      if (userAccess.source !== 'rbac') {
        // SUPER_ADMIN or unrestricted legacy user — legacy authorize() applies.
        return next();
      }
      const level = userAccess.access[module] || 'none';
      if (accessRank(level) < accessRank(minAccess)) {
        AuditService.log({
          userId: req.user.id,
          locationId: req.user.locationId,
          action: 'UNAUTHORIZED_MODULE_ATTEMPT',
          entityType: 'MODULE',
          entityId: module,
          ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
          userAgent: (req.headers['user-agent'] as string) || 'Client',
          riskScore: 60,
          tags: ['module-rbac-denied', 'security-alert'],
          after: { module, required: minAccess, actual: level, roles: userAccess.roles },
        }).catch(() => {});

        return res.status(403).json({
          error: 'Forbidden: insufficient module access',
          message: `Your role does not allow ${minAccess === 'edit' ? 'editing' : 'viewing'} ${module.replace(/_/g, ' ').toLowerCase()}.`,
          module,
          required: minAccess,
          actual: level,
        });
      }
      next();
    } catch (error) {
      console.error('Module access check error:', error);
      res.status(500).json({ error: 'Failed to verify module permissions' });
    }
  };
}

/**
 * Non-middleware variant for use inside route handlers (e.g. mixed-body
 * endpoints like PUT /settings where only some module groups are present).
 */
export async function canAccessModule(
  req: AuthRequest,
  module: string,
  minAccess: Exclude<AccessLevel, 'none'> = 'view'
): Promise<boolean> {
  if (!req.user) return false;
  const userAccess = await getUserModuleAccess(req.user.id, req.user.role);
  if (userAccess.source !== 'rbac') return true;
  return accessRank(userAccess.access[module] || 'none') >= accessRank(minAccess);
}
