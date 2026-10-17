/**
 * Action-level RBAC guards.
 *
 * `authorize()` (middleware/auth.ts) is the legacy flat-token check and stays
 * untouched for the ~300 routes that already use it. These guards are the
 * replacement for the module surfaces: they consult the resolved role grants,
 * so hiding a button in the UI is no longer what protects an endpoint.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { AuditService } from '../services/auditService.js';
import {
  RbacAction,
  canAccess,
  resolveUserAccess,
} from '../services/accessControl.js';

function humanize(moduleKey: string): string {
  return moduleKey.replace(/_/g, ' ').toLowerCase();
}

function deny(
  req: AuthRequest,
  res: Response,
  opts: { module: string; required: string; message: string; riskScore?: number; tags: string[] }
): void {
  AuditService.log({
    userId: req.user?.id,
    locationId: req.user?.locationId,
    action: 'UNAUTHORIZED_MODULE_ACTION',
    entityType: 'MODULE',
    entityId: opts.module,
    ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
    userAgent: (req.headers['user-agent'] as string) || 'Client',
    riskScore: opts.riskScore ?? 60,
    tags: opts.tags,
    after: {
      route: req.originalUrl,
      method: req.method,
      module: opts.module,
      required: opts.required,
      roles: req.access?.roles ?? [],
    },
  }).catch(() => {});

  res.status(403).json({
    error: 'Forbidden',
    message: opts.message,
    module: opts.module,
    required: opts.required,
  });
}

/** Resolves and attaches the caller's effective access. Safe to stack. */
export async function attachAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.access = await resolveUserAccess(req.user.id, req.user.role, req.user.permissions);
    next();
  } catch (error) {
    console.error('[rbac] access resolution failed:', error);
    res.status(500).json({ error: 'Failed to resolve permissions' });
  }
}

/** Require one action on one module. */
export function requireAction(moduleKey: string, action: RbacAction = 'view') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    try {
      const access = req.access || (await resolveUserAccess(req.user.id, req.user.role, req.user.permissions));
      req.access = access;
      if (canAccess(access, moduleKey, action)) return next();
      return deny(req, res, {
        module: moduleKey,
        required: action,
        riskScore: action === 'view' ? 60 : 75,
        tags: ['module-rbac-denied', 'security-alert'],
        message: `Your role does not allow ${action} on ${humanize(moduleKey)}.`,
      });
    } catch (error) {
      console.error('[rbac] requireAction failed:', error);
      return res.status(500).json({ error: 'Failed to verify module permissions' });
    }
  };
}

/** Require at least one of the listed actions on the module. */
export function requireAnyAction(moduleKey: string, actions: RbacAction[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    try {
      const access = req.access || (await resolveUserAccess(req.user.id, req.user.role, req.user.permissions));
      req.access = access;
      if (actions.some((action) => canAccess(access, moduleKey, action))) return next();
      return deny(req, res, {
        module: moduleKey,
        required: actions.join('|'),
        tags: ['module-rbac-denied', 'security-alert'],
        message: `Your role does not allow ${actions.join(' or ')} on ${humanize(moduleKey)}.`,
      });
    } catch (error) {
      console.error('[rbac] requireAnyAction failed:', error);
      return res.status(500).json({ error: 'Failed to verify module permissions' });
    }
  };
}

/**
 * Role lifecycle — create / edit / deactivate / delete roles.
 * Super Admin only, per the governance split: an Admin who can assign modules
 * must not be able to invent a role and grant it everything.
 */
export function requireRoleLifecycle(req: AuthRequest, res: Response, next: NextFunction) {
  void resolveUserAccess(req.user!.id, req.user!.role, req.user!.permissions)
    .then((access) => {
      req.access = access;
      if (access.canManageRoles) return next();
      deny(req, res, {
        module: 'ROLES_PERMISSIONS',
        required: 'role-lifecycle',
        riskScore: 85,
        tags: ['role-lifecycle-denied', 'security-alert'],
        message: 'Only a Super Admin can create, edit, deactivate or delete roles.',
      });
    })
    .catch((error) => {
      console.error('[rbac] role lifecycle check failed:', error);
      res.status(500).json({ error: 'Failed to verify role administration rights' });
    });
}

/** Module-access assignment — Admin (and Super Admin) only. */
export function requireModuleAssignment(req: AuthRequest, res: Response, next: NextFunction) {
  void resolveUserAccess(req.user!.id, req.user!.role, req.user!.permissions)
    .then((access) => {
      req.access = access;
      if (access.canAssignModuleAccess) return next();
      deny(req, res, {
        module: 'MODULE_ACCESS',
        required: 'assign',
        riskScore: 80,
        tags: ['module-assignment-denied', 'security-alert'],
        message: 'Only an Admin can assign module access to roles.',
      });
    })
    .catch((error) => {
      console.error('[rbac] module assignment check failed:', error);
      res.status(500).json({ error: 'Failed to verify assignment rights' });
    });
}

/**
 * Credential management — Admin only, and pointedly not the Super Admin.
 *
 * This cannot be expressed as a module grant, because a Super Admin is
 * unrestricted on every module by design; it is the one capability where
 * holding the top role must not imply the right.
 */
export function requireCredentialAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  void resolveUserAccess(req.user!.id, req.user!.role, req.user!.permissions)
    .then((access) => {
      req.access = access;
      if (access.canManageCredentials) return next();
      deny(req, res, {
        module: 'USER_CREDENTIALS',
        required: 'manage',
        riskScore: 85,
        tags: ['credential-denied', 'security-alert'],
        message: access.canManageRoles
          ? 'A Super Admin governs roles but cannot issue or change passwords. Sign in as an Admin, or grant the USER_CREDENTIALS module to an Admin role.'
          : 'Only an Admin can create or change login credentials.',
      });
    })
    .catch((error) => {
      console.error('[rbac] credential check failed:', error);
      res.status(500).json({ error: 'Failed to verify credential rights' });
    });
}

/** Endpoints a user with a pending password change may still reach. */
const PASSWORD_CHANGE_ALLOWLIST = [
  '/api/auth/session/password',
  '/api/auth/session/logout',
  '/api/auth/session/status',
  '/api/auth/session/refresh',
  '/api/auth/session/exchange',
  '/api/auth/session/consent',
  '/api/auth/me',
  '/api/access/me',
];

/**
 * Until a temporary or expired password is replaced, the session may only be
 * used to change that password, read status, or sign out. Without this an
 * Admin-issued temporary credential would be a full, permanent login.
 */
export function requirePasswordChange(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.mustChangePassword) return next();
  const path = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
  if (PASSWORD_CHANGE_ALLOWLIST.some((allowed) => path.startsWith(allowed))) return next();
  return res.status(403).json({
    error: 'Password change required',
    code: 'PASSWORD_CHANGE_REQUIRED',
    message: 'Set a new password before using the rest of the system.',
    redirect: '/change-password',
  });
}
