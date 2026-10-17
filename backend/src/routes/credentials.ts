/**
 * Credential administration API — the "User Credentials" screen's backend.
 *
 * Reads are gated on the USER_CREDENTIALS view grant (so HR can see account
 * status for their team); every write additionally requires the Admin
 * capability, which a Super Admin deliberately does not have.
 */
import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { requireAction, requireCredentialAdmin } from '../middleware/rbac.js';
import { sensitiveRateLimit, clientIpOf } from '../middleware/securityGuards.js';
import {
  changeLoginId,
  createCredential,
  credentialSummary,
  getCredentialRow,
  listCredentials,
  listRolesForCredentialPicker,
  resetPassword,
  setAccountActive,
  setMustChangePassword,
  unlockAccount,
  type CredentialActor,
} from '../services/credentials.js';
import { evaluate } from '../services/passwordPolicy.js';
import { securityConfig } from '../config/security.js';
import { buildDataExport } from '../services/privacy.js';

const router = Router();
router.use(authenticate);

function actor(req: AuthRequest): CredentialActor {
  return {
    id: req.user!.id,
    email: req.user!.email,
    role: req.user!.role,
    ip: clientIpOf(req),
    userAgent: String(req.headers['user-agent'] || 'Client').slice(0, 255),
    canManageCredentials: Boolean(req.access?.canManageCredentials),
    canManageRoles: Boolean(req.access?.canManageRoles),
  };
}

/** The service throws typed errors with a status; map them to responses. */
function fail(res: Response, error: any, fallback = 'Request failed'): void {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error('[credentials]', error);
  res.status(status).json({
    error: status === 403 ? 'Forbidden' : fallback,
    message: error?.message || fallback,
    code: error?.code,
    details: error?.details,
  });
}

/** Reads need the USER_CREDENTIALS view grant; writes need the Admin capability. */
const canRead = requireAction('USER_CREDENTIALS', 'view');

router.get('/summary', canRead, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await credentialSummary());
  } catch (error: any) {
    fail(res, error, 'Could not load the credential summary');
  }
});

router.get('/roles', canRead, async (_req: AuthRequest, res: Response) => {
  try {
    res.json({ roles: await listRolesForCredentialPicker() });
  } catch (error: any) {
    fail(res, error, 'Could not load roles');
  }
});

router.get('/', canRead, async (req: AuthRequest, res: Response) => {
  try {
    const users = await listCredentials({
      q: req.query.q ? String(req.query.q) : undefined,
      roleId: req.query.roleId ? String(req.query.roleId) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      flag: (req.query.flag ? String(req.query.flag) : 'all') as any,
    });
    res.json({ users, total: users.length });
  } catch (error: any) {
    fail(res, error, 'Could not load credentials');
  }
});

router.get('/:id', canRead, async (req: AuthRequest, res: Response) => {
  try {
    res.json({ user: await getCredentialRow(req.params.id) });
  } catch (error: any) {
    fail(res, error, 'Could not load this account');
  }
});

/**
 * Strength pre-check for the Admin's meter. Evaluates policy only — no hash, no
 * write — and never echoes the password back.
 */
router.post('/password/evaluate', requireCredentialAdmin, async (req: AuthRequest, res: Response) => {
  const target = {
    loginId: String(req.body?.loginId || ''),
    fullName: String(req.body?.fullName || ''),
    email: String(req.body?.email || ''),
  };
  const result = evaluate(String(req.body?.password || ''), target);
  res.json({
    ...result,
    minLength: securityConfig.password.minLength,
    historyCount: securityConfig.password.historyCount,
    expiryDays: securityConfig.password.expiryDays,
  });
});

router.post('/', requireCredentialAdmin, sensitiveRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const created = await createCredential(req.body || {}, actor(req));
    res.status(201).json({
      message: `Credential created for ${created.user.loginId}`,
      user: created.user,
      // Returned exactly once, in this response only. Nothing else in the API
      // ever reads the hash back out.
      temporaryPassword: created.temporaryPassword,
      generated: created.generated,
      mustChangePassword: created.user.mustChangePassword,
    });
  } catch (error: any) {
    fail(res, error, 'Could not create the credential');
  }
});

router.patch('/:id/login-id', requireCredentialAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await changeLoginId(req.params.id, String(req.body?.loginId || ''), actor(req));
    res.json({ message: 'Login ID updated', user: await getCredentialRow(req.params.id) });
  } catch (error: any) {
    fail(res, error, 'Could not change the login ID');
  }
});

router.post('/:id/password/reset', requireCredentialAdmin, sensitiveRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const result = await resetPassword(
      req.params.id,
      {
        password: req.body?.password ? String(req.body.password) : undefined,
        mustChangePassword: req.body?.mustChangePassword !== false,
        reason: req.body?.reason ? String(req.body.reason).slice(0, 60) : 'ADMIN_RESET',
        notifyUser: req.body?.notifyUser !== false,
      },
      actor(req)
    );
    res.json({
      message: result.generated ? 'A temporary password was generated' : 'Password reset',
      // Once-only disclosure, same rule as creation.
      temporaryPassword: result.temporaryPassword,
      generated: result.generated,
      mustChangePassword: result.mustChangePassword,
    });
  } catch (error: any) {
    fail(res, error, 'Could not reset the password');
  }
});

router.post('/:id/must-change', requireCredentialAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await setMustChangePassword(req.params.id, req.body?.mustChange !== false, actor(req));
    res.json({ message: 'Flag updated', user: await getCredentialRow(req.params.id) });
  } catch (error: any) {
    fail(res, error, 'Could not update the password-change flag');
  }
});

router.post('/:id/status', requireCredentialAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const active = req.body?.isActive === true;
    await setAccountActive(req.params.id, active, actor(req), req.body?.reason ? String(req.body.reason) : undefined);
    res.json({ message: active ? 'Account activated' : 'Account deactivated', user: await getCredentialRow(req.params.id) });
  } catch (error: any) {
    fail(res, error, 'Could not change the account status');
  }
});

router.post('/:id/unlock', requireCredentialAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await unlockAccount(req.params.id, actor(req));
    res.json({ message: 'Account unlocked', user: await getCredentialRow(req.params.id) });
  } catch (error: any) {
    fail(res, error, 'Could not unlock the account');
  }
});

/** Admin-initiated subject export (also reachable by the subject themselves). */
router.get('/:id/data-export', requireCredentialAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const payload = await buildDataExport(req.params.id);
    res.setHeader('Content-Disposition', `attachment; filename="subject-export-${req.params.id}.json"`);
    res.json(payload);
  } catch (error: any) {
    fail(res, error, 'Could not build the export');
  }
});

export default router;
