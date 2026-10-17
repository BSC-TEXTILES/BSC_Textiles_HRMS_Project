/**
 * Live Activities API.
 *
 * Reads are gated on ATTENDANCE:view (anyone who can see the dashboard can see
 * the feed). The HR actions inside the detail drawer are gated individually —
 * regularising a punch, waiving a fine, approving overtime — because "can see
 * the exception" and "can decide the exception" are different permissions in
 * this product, and the brief requires the check on the server, not in the UI.
 *
 * Every response is location-scoped unless the caller can see the whole
 * organisation, so a floor manager's feed cannot leak another showroom's data.
 */
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { requireAction } from '../middleware/rbac.js';
import { canAccess } from '../services/accessControl.js';
import {
  summarize, listEvents, eventDetail, decideEvent, availableDates,
  businessDateOf, sweepDay,
} from '../services/workforceEvents.js';
import { pool } from '../nativeDb.js';

const router = Router();

/** Sweep at most once per caller-per-window; the feed is polled, not hammered. */
const lastSweep = new Map<string, number>();
const SWEEP_INTERVAL_MS = 15_000;

async function ensureFresh(date: string, scopeKey: string): Promise<void> {
  const key = `${scopeKey}|${date}`;
  const since = lastSweep.get(key) || 0;
  if (Date.now() - since < SWEEP_INTERVAL_MS) return;
  lastSweep.set(key, Date.now());
  try {
    await sweepDay(date);
  } catch (err: any) {
    // A projection failure must not take the feed down: the previous journal
    // rows are still valid and better than an error screen.
    console.warn('[live] sweep failed for', date, err?.code || err?.message);
  }
}

/**
 * null means "all locations" — granted only to unrestricted roles. Everyone
 * else is pinned to their own location, and an explicit ?locationId= outside
 * that set is ignored rather than trusted.
 */
function scopeOf(req: AuthRequest): { ids: string[] | null; key: string } {
  const access = (req as any).access;
  const unrestricted = Boolean(access?.unrestricted) ||
    ['SUPER_ADMIN', 'ADMIN'].includes(String(req.user?.role || '').toUpperCase());
  if (unrestricted) {
    const requested = String(req.query.locationId || '').trim();
    if (requested) return { ids: [requested.slice(0, 64)], key: requested };
    return { ids: null, key: 'all' };
  }
  const own = req.user?.locationId ? String(req.user.locationId) : '__none__';
  return { ids: req.user?.locationId ? [own] : [], key: own };
}

function dateOf(req: any): string {
  const raw = String(req.query.date || '').trim();
  // Only an ISO calendar date is accepted; anything else falls back to today
  // rather than reaching the query.
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : businessDateOf();
}

function csvList(req: any, name: string): string[] {
  const raw = String(req.query[name] || '').trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
}

function fail(res: Response, err: any, fallback: string, status = 500) {
  console.error('[live]', err?.stack || err?.message || err);
  res.status(err?.status || status).json({
    error: err?.code || fallback,
    message: err?.message || fallback,
  });
}

router.use(authenticate);

// ─── Counters ───────────────────────────────────────────────────────────────
router.get('/summary', requireAction('ATTENDANCE', 'view'), async (req: AuthRequest, res: Response) => {
  try {
    const date = dateOf(req);
    const scope = scopeOf(req);
    await ensureFresh(date, scope.key);
    const summary = await summarize(date, scope.ids);

    // The permission flags the drawer needs, resolved through the RBAC engine
    // itself rather than by reading the grant shape here — `canAccess` is the
    // only function that knows about unrestricted roles, the 'ALL' wildcard and
    // the legacy fallback. (An earlier version did `access.grants.find(...)`;
    // grants is a keyed Record, so the optional-call silently returned
    // undefined and every action button vanished for users who did have the
    // permission. That is why this calls the engine instead of the data.)
    const access = (req as any).access;
    const can = (action: 'update' | 'approve' | 'edit') => canAccess(access, 'ATTENDANCE', action);

    res.json({
      ...summary,
      permissions: {
        canRegularize: can('update'),
        canWaiveFine: can('approve'),
        canApproveOvertime: can('approve'),
        canRemark: can('edit') || can('update'),
      },
    });
  } catch (err) {
    fail(res, err, 'Could not load the live summary');
  }
});

// ─── Feed ───────────────────────────────────────────────────────────────────
router.get('/events', requireAction('ATTENDANCE', 'view'), async (req: AuthRequest, res: Response) => {
  try {
    const date = dateOf(req);
    const scope = scopeOf(req);
    await ensureFresh(date, scope.key);

    const page = await listEvents({
      businessDate: date,
      types: csvList(req, 'types'),
      departmentIds: csvList(req, 'departments'),
      locationIds: scope.ids,
      search: String(req.query.search || '').slice(0, 64),
      limit: Number(req.query.limit) || 50,
      cursor: req.query.cursor ? String(req.query.cursor).slice(0, 128) : null,
    });

    res.json(page);
  } catch (err) {
    fail(res, err, 'Could not load live activities');
  }
});

/** Which past dates actually have events (drives the date picker). */
router.get('/dates', requireAction('ATTENDANCE', 'view'), async (req: AuthRequest, res: Response) => {
  try {
    res.json({ dates: await availableDates(scopeOf(req).ids) });
  } catch (err) {
    fail(res, err, 'Could not load activity dates');
  }
});

// ─── Detail ─────────────────────────────────────────────────────────────────
router.get('/events/:id', requireAction('ATTENDANCE', 'view'), async (req: AuthRequest, res: Response) => {
  try {
    const detail = await eventDetail(String(req.params.id).slice(0, 191));
    if (!detail) return res.status(404).json({ error: 'NOT_FOUND', message: 'No such activity' });

    // Object-level authorisation: an event belonging to another showroom is a
    // 404 here, not a 200 with redacted fields.
    const scope = scopeOf(req);
    if (scope.ids && detail.event.locationId && !scope.ids.includes(detail.event.locationId)) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'No such activity' });
    }
    res.json(detail);
  } catch (err) {
    fail(res, err, 'Could not open this activity');
  }
});

// ─── HR decisions ───────────────────────────────────────────────────────────
const ACTION_PERMISSIONS: Record<string, { module: string; action: 'update' | 'approve' }> = {
  APPROVE: { module: 'ATTENDANCE', action: 'approve' },
  REJECT: { module: 'ATTENDANCE', action: 'approve' },
  REGULARIZE: { module: 'ATTENDANCE', action: 'update' },
  REMARK: { module: 'ATTENDANCE', action: 'update' },
  WAIVE: { module: 'PENALTIES', action: 'approve' },
  APPLY_FINE: { module: 'PENALTIES', action: 'approve' },
  APPROVE_OVERTIME: { module: 'ATTENDANCE', action: 'approve' },
};

router.post('/events/:id/action', async (req: AuthRequest, res: Response) => {
  const action = String(req.body?.action || '').toUpperCase();
  const needed = ACTION_PERMISSIONS[action];
  if (!needed) {
    return res.status(400).json({ error: 'UNSUPPORTED_ACTION', message: `Unknown action "${action}"` });
  }

  // Resolved per action, so a user with ATTENDANCE update but not PENALTIES
  // approve cannot waive a fine through this endpoint.
  return requireAction(needed.module, needed.action)(req, res, async () => {
    try {
      const scope = scopeOf(req);
      const existing = await eventDetail(String(req.params.id).slice(0, 191));
      if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'No such activity' });
      if (scope.ids && existing.event.locationId && !scope.ids.includes(existing.event.locationId)) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'No such activity' });
      }

      const result = await decideEvent({
        id: String(req.params.id),
        action,
        actorId: String(req.user!.id),
        note: String(req.body?.note || '').slice(0, 500),
        ip: (req as any).clientIp,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
      });

      if (!result.ok) return res.status(400).json({ error: 'REJECTED', message: result.reason });
      res.json({ ok: true, event: result.event });
    } catch (err) {
      fail(res, err, 'Could not record this decision');
    }
  });
});

/** Departments present in the journal — the filter list, not a separate lookup. */
router.get('/filters', requireAction('ATTENDANCE', 'view'), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeOf(req);
    const where = scope.ids ? `AND w.locationId IN (${scope.ids.map(() => '?').join(',')})` : '';
    const [rows]: any = await pool.query(
      `SELECT DISTINCT d.\`id\`, d.\`name\`
         FROM \`workforce_event\` w
         JOIN \`department\` d ON d.\`id\` = w.\`departmentId\`
        WHERE w.\`businessDate\` >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)${where}
        ORDER BY d.\`name\` ASC`,
      scope.ids || []
    );
    res.json({ departments: rows || [] });
  } catch (err) {
    fail(res, err, 'Could not load filters');
  }
});

export default router;
