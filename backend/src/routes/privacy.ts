/**
 * Privacy self-service and the Admin's request queue.
 *
 * A signed-in person can read the policy documents, see and change their cookie
 * consent, export everything the system holds about them, and raise an erasure
 * request. Erasure is executed by an Admin/Super Admin after identity
 * verification — a self-service hard delete would be a data-loss vector
 * (someone with a stolen session could erase a payroll history).
 */
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { requireAction } from '../middleware/rbac.js';
import { clientIpOf } from '../middleware/securityGuards.js';
import { visitorId, issueCsrfToken } from '../services/authCookies.js';
import {
  CONSENT_POLICY_VERSION,
  buildDataExport,
  createDataRequest,
  listDataRequests,
  readConsent,
  saveConsent,
  transitionDataRequest,
  type DataRequestType,
} from '../services/privacy.js';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';

const router = Router();

function fail(res: Response, error: any, fallback = 'Request failed'): void {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error('[privacy]', error);
  res.status(status).json({ error: fallback, message: error?.message || fallback });
}

// ---------------------------------------------------------------------------
// Public: policy documents (no auth — they must be readable from the login page)
// ---------------------------------------------------------------------------

router.get('/policies', async (_req: AuthRequest, res: Response) => {
  res.json({
    policyVersion: CONSENT_POLICY_VERSION,
    retention: securityConfig.privacy.retentionDays,
    purgeIntervalHours: securityConfig.privacy.purgeIntervalHours,
  });
});

// ---------------------------------------------------------------------------
// Subject self-service
//
// Cookie consent lives on /api/auth/session/consent so the banner can record a
// choice from the signed-out login page.
// ---------------------------------------------------------------------------

router.get('/me/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const payload = await buildDataExport(req.user!.id);
    await pool.query(
      `INSERT INTO \`data_request\` (\`id\`, \`userId\`, \`type\`, \`status\`, \`requestedAt\`, \`completedAt\`, \`updatedAt\`)
       VALUES (?, ?, 'EXPORT', 'COMPLETED', NOW(3), NOW(3), NOW(3))`,
      [`drq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, req.user!.id]
    );
    res.setHeader('Content-Disposition', 'attachment; filename="my-data-export.json"');
    res.json(payload);
  } catch (error: any) {
    fail(res, error, 'Could not prepare your export');
  }
});

router.get('/me/requests', authenticate, async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.query(
    'SELECT `id`, `type`, `status`, `requestedAt`, `completedAt`, `note` FROM `data_request` WHERE `userId` = ? ORDER BY `requestedAt` DESC LIMIT 50',
    [req.user!.id]
  );
  res.json({ requests: rows || [] });
});

router.post('/me/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const type = String(req.body?.type || '').toUpperCase();
    if (!['ERASURE', 'RESTRICTION', 'CORRECTION'].includes(type)) {
      return void res.status(400).json({ error: 'Unsupported request type', message: 'Choose ERASURE, RESTRICTION or CORRECTION.' });
    }
    const created = await createDataRequest({
      userId: req.user!.id,
      type: type as DataRequestType,
      note: req.body?.note ? String(req.body.note).slice(0, 2000) : undefined,
      requestedBy: req.user!.id,
    });
    res.status(202).json({
      ...created,
      message: 'We have logged your request. HR will verify your identity and act within the period stated in the Data Retention Policy.',
    });
  } catch (error: any) {
    fail(res, error, 'Could not raise your request');
  }
});

// ---------------------------------------------------------------------------
// Admin queue
// ---------------------------------------------------------------------------

const canManage = requireAction('PRIVACY_REQUESTS', 'view');
const canDecide = requireAction('PRIVACY_REQUESTS', 'approve');

router.get('/requests', authenticate, canManage, async (_req: AuthRequest, res: Response) => {
  res.json({ requests: await listDataRequests() });
});

router.post('/requests/:id/transition', authenticate, canDecide, async (req: AuthRequest, res: Response) => {
  try {
    const to = String(req.body?.status || '').toUpperCase();
    if (!['IN_REVIEW', 'COMPLETED', 'REJECTED'].includes(to)) {
      return void res.status(400).json({ error: 'Unsupported status' });
    }
    const result = await transitionDataRequest(
      req.params.id,
      to as 'IN_REVIEW' | 'COMPLETED' | 'REJECTED',
      { id: req.user!.id, email: req.user!.email, ip: clientIpOf(req) },
      req.body?.note ? String(req.body.note) : undefined
    );
    res.json(result);
  } catch (error: any) {
    fail(res, error, 'Could not update the request');
  }
});

/** Hands out the CSRF token alongside consent state on first paint. */
router.get('/bootstrap', async (req: AuthRequest, res: Response) => {
  const csrf = await issueCsrfToken(res, req, null);
  res.json({ csrfToken: csrf, consent: await readConsent(req, visitorId(req, res)) });
});

export default router;
