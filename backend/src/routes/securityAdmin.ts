/**
 * Security operations API for Admin and Super Admin: the dashboard's data,
 * session control, IP rules, signing-key status and runtime settings.
 *
 * Everything here is gated on the SECURITY_MONITORING module, so the screens
 * can be handed to a role without also handing out credentials or roles.
 */
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { requireAction } from '../middleware/rbac.js';
import { clientIpOf, invalidateIpRuleCache, resetRateLimitState } from '../middleware/securityGuards.js';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { redisHealth } from '../services/redisStore.js';
import { listKeys, rotateNow, signingKeyHealth } from '../services/signingKeys.js';
import { SessionService } from '../services/sessionService.js';
import { AuditService } from '../services/auditService.js';
import { listSettings, setSetting, invalidateSecuritySettings } from '../services/systemSettings.js';
import { runRetentionPurge, listRetentionPolicies } from '../services/privacy.js';
import { revokeAllUserTokens } from '../services/tokenService.js';
import { forceUnlock } from '../services/loginProtection.js';
import { raiseSecurityAlert } from '../services/securityAlerts.js';

const router = Router();
router.use(authenticate);

const canRead = requireAction('SECURITY_MONITORING', 'view');
const canWrite = requireAction('SECURITY_MONITORING', 'edit');

function fail(res: Response, error: any, fallback = 'Request failed'): void {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error('[security-admin]', error);
  res.status(status).json({ error: fallback, message: error?.message || fallback, code: error?.code });
}

function actorOf(req: AuthRequest) {
  return { id: req.user!.id, email: req.user!.email, ip: clientIpOf(req) };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/dashboard', canRead, async (_req: AuthRequest, res: Response) => {
  try {
    const query = async (sql: string, params: any[] = []): Promise<any[]> => {
      const [rows]: any = await pool.query(sql, params);
      return rows || [];
    };

    const [failed, locked, active, blocked, events, spray, topIps, store, keys] = await Promise.all([
      query("SELECT COUNT(*) AS n FROM `login_attempt` WHERE `success` = 0 AND `createdAt` > DATE_SUB(NOW(3), INTERVAL 24 HOUR)"),
      query('SELECT COUNT(*) AS n FROM `user` WHERE `lockedUntil` > NOW(3)'),
      query('SELECT COUNT(*) AS n FROM `session` WHERE `revoked` = 0 AND `expiresAt` > NOW(3)'),
      query("SELECT COUNT(*) AS n FROM `ip_rules` WHERE `type` = 'deny' AND `enabled` = 1 AND (`expiresAt` IS NULL OR `expiresAt` > NOW(3))"),
      query(
        `SELECT \`id\`, \`type\`, \`severity\`, \`userId\`, \`ipAddress\`, \`riskScore\`, \`details\`, \`acknowledged\`, \`createdAt\`
           FROM \`security_event\` ORDER BY \`createdAt\` DESC LIMIT 25`
      ),
      query(
        `SELECT COUNT(DISTINCT COALESCE(\`loginId\`, \`email\`)) AS targets
           FROM \`login_attempt\`
          WHERE \`success\` = 0 AND \`createdAt\` > DATE_SUB(NOW(3), INTERVAL 15 MINUTE)`
      ),
      query(
        `SELECT \`ipAddress\`, COUNT(*) AS failures
           FROM \`login_attempt\`
          WHERE \`success\` = 0 AND \`createdAt\` > DATE_SUB(NOW(3), INTERVAL 15 MINUTE)
          GROUP BY \`ipAddress\` ORDER BY failures DESC LIMIT 10`
      ),
      redisHealth(),
      listKeys(),
    ]);

    res.json({
      window: {
        failedLogins24h: Number(failed[0]?.n || 0),
        lockedAccounts: Number(locked[0]?.n || 0),
      },
      activeSessions: Number(active[0]?.n || 0),
      blockedIps: Number(blocked[0]?.n || 0),
      passwordSprayTargets15m: Number(spray[0]?.targets || 0),
      topFailingIps: topIps,
      events: events.map((row: any) => ({
        ...row,
        details: typeof row.details === 'string' ? safeJson(row.details) : row.details,
      })),
      infrastructure: {
        store: store.driver,
        redisConfigured: Boolean(securityConfig.redis.url),
        signingAlgorithm: securityConfig.tokens.algorithm,
        activeKid: signingKeyHealth().kid,
        keyCount: keys.length,
      },
      policy: {
        maxAttempts: securityConfig.login.maxAttempts,
        lockoutSeconds: securityConfig.login.lockoutSeconds,
        captchaAfter: securityConfig.login.captchaAfter,
        globalRateLimitPerSecond: securityConfig.rateLimit.globalPerSecond,
        sensitiveRateLimit: securityConfig.rateLimit.sensitivePerWindow,
        accessTokenTtlSeconds: securityConfig.tokens.accessTtlSeconds,
        refreshTokenTtlSeconds: securityConfig.tokens.refreshTtlSeconds,
        idleTimeoutSeconds: securityConfig.session.idleTimeoutSeconds,
        absoluteTimeoutSeconds: securityConfig.session.absoluteTimeoutSeconds,
        passwordMinLength: securityConfig.password.minLength,
        passwordHistory: securityConfig.password.historyCount,
      },
    });
  } catch (error: any) {
    fail(res, error, 'Could not build the security dashboard');
  }
});

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

router.get('/sessions', canRead, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : null;
    const params: any[] = [];
    let where = 's.`revoked` = 0';
    if (userId) {
      where += ' AND s.`userId` = ?';
      params.push(userId);
    }
    const [rows]: any = await pool.query(
      `SELECT s.\`id\`, s.\`userId\`, s.\`ipAddress\`, s.\`userAgent\`, s.\`authMethod\`, s.\`createdAt\`,
              s.\`lastActivityAt\`, s.\`idleExpiresAt\`, s.\`expiresAt\`,
              u.\`email\`, u.\`fullName\`, u.\`role\`, u.\`loginId\`
         FROM \`session\` s JOIN \`user\` u ON u.\`id\` = s.\`userId\`
        WHERE ${where} ORDER BY s.\`lastActivityAt\` DESC LIMIT 200`,
      params
    );
    res.json({ sessions: rows || [], currentSessionId: req.user?.sessionId ?? null });
  } catch (error: any) {
    fail(res, error, 'Could not list sessions');
  }
});

router.post('/sessions/:id/revoke', canWrite, async (req: AuthRequest, res: Response) => {
  try {
    await SessionService.revokeSession(req.params.id, 'ADMIN_REVOKE');
    await AuditService.log({
      userId: req.user!.id,
      action: 'REVOKE',
      entityType: 'Session',
      entityId: req.params.id,
      ipAddress: clientIpOf(req),
      riskScore: 60,
      tags: ['security', 'session'],
      after: { revokedBy: req.user!.email },
    }).catch(() => undefined);
    res.json({ message: 'Session revoked' });
  } catch (error: any) {
    fail(res, error, 'Could not revoke the session');
  }
});

router.post('/users/:id/sign-out', canWrite, async (req: AuthRequest, res: Response) => {
  try {
    await SessionService.revokeAllUserSessions(req.params.id, 'ADMIN_REVOKE');
    await revokeAllUserTokens(req.params.id, 'ADMIN_REVOKE');
    await raiseSecurityAlert({
      title: `All sessions ended for ${req.params.id}`,
      message: `${req.user!.email} force-signed-out user ${req.params.id}.`,
      event: { type: 'CONFIG_CHANGE', severity: 'MEDIUM', userId: req.params.id, ipAddress: clientIpOf(req), riskScore: 45, details: {} },
    });
    res.json({ message: 'User signed out everywhere' });
  } catch (error: any) {
    fail(res, error, 'Could not sign the user out');
  }
});

// ---------------------------------------------------------------------------
// IP rules
// ---------------------------------------------------------------------------

router.get('/ip-rules', canRead, async (_req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.query(
    'SELECT `id`, `type`, `ipAddress`, `cidr`, `label`, `reason`, `source`, `enabled`, `hits`, `expiresAt`, `createdAt` FROM `ip_rules` ORDER BY `createdAt` DESC LIMIT 200'
  );
  res.json({ rules: rows || [] });
});

router.post('/ip-rules', canWrite, async (req: AuthRequest, res: Response) => {
  try {
    const type = String(req.body?.type || '').toLowerCase();
    const ip = String(req.body?.ipAddress || '').trim();
    const cidr = String(req.body?.cidr || '').trim();
    if (!['allow', 'deny'].includes(type)) return void res.status(400).json({ error: 'type must be allow or deny' });
    if (!ip && !cidr) return void res.status(400).json({ error: 'Provide an IP address or a CIDR range' });
    if (cidr && !/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(cidr)) {
      return void res.status(400).json({ error: 'CIDR must look like 10.0.0.0/24' });
    }

    const id = `ipr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = Number(req.body?.ttlSeconds) > 0 ? new Date(Date.now() + Number(req.body.ttlSeconds) * 1000) : null;
    await pool.query(
      `INSERT INTO \`ip_rules\` (\`id\`, \`type\`, \`ipAddress\`, \`cidr\`, \`label\`, \`reason\`, \`source\`, \`enabled\`, \`expiresAt\`, \`createdById\`, \`createdAt\`)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', 1, ?, ?, NOW(3))`,
      [id, type, ip || null, cidr || null, String(req.body?.label || '').slice(0, 120), String(req.body?.reason || '').slice(0, 255), expiresAt, req.user!.id]
    );
    invalidateIpRuleCache();
    await AuditService.log({
      userId: req.user!.id,
      action: 'CREATE',
      entityType: 'IpRule',
      entityId: id,
      ipAddress: clientIpOf(req),
      riskScore: type === 'allow' ? 75 : 45,
      tags: ['security', 'ip-rule'],
      after: { type, ip: ip || null, cidr: cidr || null, reason: req.body?.reason },
    }).catch(() => undefined);
    res.status(201).json({ message: 'Rule added', id });
  } catch (error: any) {
    fail(res, error, 'Could not add the rule');
  }
});

router.delete('/ip-rules/:id', canWrite, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM `ip_rules` WHERE `id` = ?', [req.params.id]);
    invalidateIpRuleCache();
    await AuditService.log({
      userId: req.user!.id,
      action: 'DELETE',
      entityType: 'IpRule',
      entityId: req.params.id,
      ipAddress: clientIpOf(req),
      riskScore: 50,
      tags: ['security', 'ip-rule'],
    }).catch(() => undefined);
    res.json({ message: 'Rule removed' });
  } catch (error: any) {
    fail(res, error, 'Could not remove the rule');
  }
});

// ---------------------------------------------------------------------------
// Lockouts, limiter state, keys, settings, retention
// ---------------------------------------------------------------------------

router.get('/lockouts', canRead, async (_req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.query(
    `SELECT u.\`id\`, u.\`email\`, u.\`loginId\`, u.\`fullName\`, u.\`lockedUntil\`, u.\`failedLoginAttempts\`, u.\`consecutiveLockouts\`, u.\`lastFailedLoginAt\`
       FROM \`user\` u WHERE u.\`lockedUntil\` > NOW(3) OR u.\`consecutiveLockouts\` > 0 ORDER BY u.\`consecutiveLockouts\` DESC LIMIT 100`
  );
  res.json({ locked: rows || [] });
});

router.post('/lockouts/:userId/unlock', canWrite, async (req: AuthRequest, res: Response) => {
  try {
    await forceUnlock(req.params.userId, actorOf(req));
    res.json({ message: 'Account unlocked' });
  } catch (error: any) {
    fail(res, error, 'Could not unlock the account');
  }
});

router.post('/rate-limit/reset', canWrite, async (req: AuthRequest, res: Response) => {
  const cleared = await resetRateLimitState();
  await AuditService.log({
    userId: req.user!.id,
    action: 'RESET',
    entityType: 'RateLimit',
    entityId: 'all',
    ipAddress: clientIpOf(req),
    riskScore: 55,
    tags: ['security'],
    after: { clearedKeys: cleared },
  }).catch(() => undefined);
  res.json({ message: 'Rate-limit counters cleared', clearedKeys: cleared });
});

router.get('/keys', canRead, async (_req: AuthRequest, res: Response) => {
  const keys = await listKeys();
  // Public material only; the private PEM never leaves the service layer.
  res.json({
    algorithm: securityConfig.tokens.algorithm,
    activeKid: signingKeyHealth().kid,
    rotationDays: securityConfig.tokens.keyRotationDays,
    keys: keys.map(({ publicKeyPem, ...rest }) => rest),
  });
});

router.post('/keys/rotate', canWrite, async (req: AuthRequest, res: Response) => {
  try {
    const result = await rotateNow(req.user!.id);
    await AuditService.log({
      userId: req.user!.id,
      action: 'ROTATE',
      entityType: 'SigningKey',
      entityId: result.kid,
      ipAddress: clientIpOf(req),
      riskScore: 80,
      tags: ['security', 'key-rotation'],
      before: { kid: result.previousKid },
      after: { kid: result.kid },
    }).catch(() => undefined);
    res.json({ message: 'Signing key rotated', ...result });
  } catch (error: any) {
    fail(res, error, 'Could not rotate the signing key');
  }
});

router.get('/settings', canRead, async (_req: AuthRequest, res: Response) => {
  res.json({ settings: await listSettings(), retention: await listRetentionPolicies() });
});

router.put('/settings', canWrite, async (req: AuthRequest, res: Response) => {
  try {
    const updates = Array.isArray(req.body?.settings) ? req.body.settings : [];
    for (const item of updates.slice(0, 20)) {
      if (!item?.key) continue;
      await setSetting(String(item.key), String(item.value), req.user!.id);
    }
    await AuditService.log({
      userId: req.user!.id,
      action: 'UPDATE',
      entityType: 'SecurityConfig',
      entityId: 'settings',
      ipAddress: clientIpOf(req),
      riskScore: 70,
      tags: ['security', 'config'],
      after: { settings: updates },
    }).catch(() => undefined);
    res.json({ message: 'Settings updated', settings: await listSettings() });
  } catch (error: any) {
    fail(res, error, error?.message || 'Could not update settings');
  }
});

router.post('/retention/run', canWrite, async (req: AuthRequest, res: Response) => {
  const results = await runRetentionPurge({ force: true });
  await AuditService.log({
    userId: req.user!.id,
    action: 'PURGE',
    entityType: 'RetentionPolicy',
    entityId: 'manual',
    ipAddress: clientIpOf(req),
    riskScore: 85,
    tags: ['security', 'retention'],
    after: { results },
  }).catch(() => undefined);
  res.json({ results });
});

router.get('/events', canRead, async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.query(
    `SELECT \`id\`, \`type\`, \`severity\`, \`userId\`, \`ipAddress\`, \`riskScore\`, \`details\`, \`acknowledged\`, \`resolved\`, \`createdAt\`
       FROM \`security_event\` ORDER BY \`createdAt\` DESC LIMIT 200`
  );
  void req;
  res.json({ events: (rows || []).map((r: any) => ({ ...r, details: typeof r.details === 'string' ? safeJson(r.details) : r.details })) });
});

router.post('/events/:id/acknowledge', canWrite, async (req: AuthRequest, res: Response) => {
  await pool.query('UPDATE `security_event` SET `acknowledged` = 1, `acknowledgedById` = ?, `acknowledgedAt` = NOW(3) WHERE `id` = ?', [
    req.user!.id,
    req.params.id,
  ]);
  res.json({ message: 'Acknowledged' });
});

export default router;
