/**
 * Candidate Hiring — HR-facing routes (mounted at /api/v1/hiring).
 *
 * Every route is authenticated and guarded with RECRUITMENT module grants via
 * `requireAction`; location isolation is enforced inside the service by
 * `resolveHiringScope`, so even a valid RECRUITMENT grant cannot read another
 * showroom's candidates.
 */

import { Router } from 'express';
import { Response } from 'express';
import { AuthRequest, authenticate, requireRole } from '../middleware/auth.js';
import { requireAction } from '../middleware/rbac.js';
import { exportLimiter } from '../middleware/rateLimiting.js';
import { shardManager } from '../core/sharding/index.js';
import {
  createFolder,
  createForm,
  createTemplate,
  deleteFolder,
  deleteForm,
  deleteTemplate,
  duplicateForm,
  getActiveHiringLocations,
  getForm,
  getTemplate,
  getTemplateBySlug,
  listFolders,
  listForms,
  listTemplates,
  publishForm,
  closeForm,
  reopenForm,
  archiveForm,
  unarchiveForm,
  saveDraftVersion,
  saveFormAsTemplate,
  updateFolder,
  updateForm,
} from '../services/hiring/hiringFormService.js';
import {
  createLink,
  deleteLink,
  getFormLinkAnalytics,
  getLink,
  listLinks,
  regenerateLinkCode,
  updateLink,
} from '../services/hiring/hiringLinkService.js';
import {
  HiringError,
  HiringViewer,
  addApplicationNote,
  bulkUpdateApplicationStage,
  deleteApplication,
  deleteApplicationNote,
  exportApplications,
  getApplicationDetail,
  getCandidateProfile,
  getHiringDashboard,
  listApplications,
  listUpcomingInterviews,
  scheduleInterview,
  updateApplicationDetails,
  updateApplicationStage,
  updateInterview,
} from '../services/hiring/hiringApplicationService.js';
import { getAllSettings, updateSettings, HIRING_SETTING_DEFAULTS } from '../services/hiring/hiringSettings.js';
import { readHiringUpload } from '../services/hiring/hiringUploadService.js';
import {
  ensureHiringShardForLocation,
  ensureHiringShardsForAllLocations,
  getHiringShardOverview,
} from '../services/hiring/hiringShardProvisioner.js';
import {
  getHiringOutboxStats,
  requeueFailedHiringEvents,
} from '../services/hiring/hiringOutbox.js';

const router = Router();

router.use(authenticate);

function viewerOf(req: AuthRequest): HiringViewer {
  return {
    id: req.user!.id,
    role: req.user!.role,
    locationId: req.user!.locationId ?? null,
    fullName: req.user!.fullName,
  };
}

const BAD_REQUEST_CODES = new Set([
  'INVALID_LOCATIONS',
  'INVALID_TEMPLATE',
  'INVALID_SCHEMA',
  'INVALID_WINDOW',
  'INVALID_LOCATION',
  'INVALID_EXPIRY',
  'INVALID_STAGE',
  'INVALID_DATE',
  'INVALID_RATING',
  'INVALID_TRANSITION',
  'NO_DRAFT',
  'NO_SCHEMA',
  'NO_PUBLISHED_VERSION',
  'FORM_ARCHIVED',
  'SYSTEM_TEMPLATE',
  'LOCATION_NOT_ALLOWED',
  'LOCATION_HIRING_DISABLED',
  'EMPTY_NOTE',
  'NOTE_TOO_LONG',
  'UNSUPPORTED_FILE_TYPE',
  'EMPTY_FILE',
  'FILE_TOO_LARGE',
  'FILE_CONTENT_MISMATCH',
]);

function fail(res: Response, err: any, context: string) {
  if (err instanceof HiringError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  const code = err?.code;
  if (code === 'NOT_FOUND') {
    return res.status(404).json({ error: err.message, code });
  }
  if (BAD_REQUEST_CODES.has(code)) {
    return res.status(code === 'NO_DRAFT' || code === 'NO_PUBLISHED_VERSION' ? 409 : 400).json({
      error: err.message,
      code,
      details: err.details,
    });
  }
  console.error(`[hiringRoutes] ${context}:`, err);
  return res.status(500).json({ error: 'Hiring request failed' });
}

const adminOnly = requireRole('ADMIN', 'SUPER_ADMIN');

// ---------------------------------------------------------------------------
// Meta: locations, folders, templates, settings, shards, outbox
// ---------------------------------------------------------------------------

router.get('/locations', requireAction('RECRUITMENT', 'view'), async (_req, res) => {
  try {
    res.json(await getActiveHiringLocations());
  } catch (err) {
    fail(res, err, 'list locations');
  }
});

router.get('/folders', requireAction('RECRUITMENT', 'view'), async (_req, res) => {
  try {
    res.json(await listFolders());
  } catch (err) {
    fail(res, err, 'list folders');
  }
});

router.post('/folders', requireAction('RECRUITMENT', 'create'), async (req: AuthRequest, res) => {
  try {
    const folder = await createFolder(req.body ?? {}, viewerOf(req));
    res.status(201).json(folder);
  } catch (err) {
    fail(res, err, 'create folder');
  }
});

router.patch('/folders/:id', requireAction('RECRUITMENT', 'edit'), async (req, res) => {
  try {
    res.json(await updateFolder(req.params.id, req.body ?? {}));
  } catch (err) {
    fail(res, err, 'update folder');
  }
});

router.delete('/folders/:id', requireAction('RECRUITMENT', 'delete'), async (req, res) => {
  try {
    await deleteFolder(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 'delete folder');
  }
});

router.get('/templates', requireAction('RECRUITMENT', 'view'), async (_req, res) => {
  try {
    res.json(await listTemplates());
  } catch (err) {
    fail(res, err, 'list templates');
  }
});

// Accepts either a template id or a slug, so the builder can link to
// /hiring/templates/retail-store-staff without resolving the id first.
router.get('/templates/:idOrSlug', requireAction('RECRUITMENT', 'view'), async (req, res) => {
  try {
    const template = (await getTemplate(req.params.idOrSlug)) ?? (await getTemplateBySlug(req.params.idOrSlug));
    if (!template) return res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND' });
    res.json(template);
  } catch (err) {
    fail(res, err, 'get template');
  }
});

router.post('/templates', requireAction('RECRUITMENT', 'create'), async (req: AuthRequest, res) => {
  try {
    const template = await createTemplate(req.body ?? {}, viewerOf(req));
    res.status(201).json(template);
  } catch (err) {
    fail(res, err, 'create template');
  }
});

router.delete('/templates/:id', requireAction('RECRUITMENT', 'delete'), async (req, res) => {
  try {
    await deleteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 'delete template');
  }
});

router.get('/settings', requireAction('RECRUITMENT', 'view'), async (_req, res) => {
  try {
    res.json(await getAllSettings());
  } catch (err) {
    fail(res, err, 'get settings');
  }
});

router.patch('/settings/:key', requireAction('RECRUITMENT', 'edit'), async (req: AuthRequest, res) => {
  const key = req.params.key as keyof typeof HIRING_SETTING_DEFAULTS;
  if (!(key in HIRING_SETTING_DEFAULTS)) {
    return res.status(400).json({ error: 'Unknown settings key', code: 'INVALID_SETTING_KEY' });
  }
  try {
    res.json(await updateSettings(key, req.body ?? {}, req.user!.id));
  } catch (err) {
    fail(res, err, 'update settings');
  }
});

router.get('/shards', requireAction('RECRUITMENT', 'view'), async (_req, res) => {
  try {
    res.json(await getHiringShardOverview());
  } catch (err) {
    fail(res, err, 'shard overview');
  }
});

router.post('/shards/provision', adminOnly, requireAction('RECRUITMENT', 'edit'), async (req, res) => {
  try {
    const locationId = req.body?.locationId as string | undefined;
    if (locationId) {
      const [rows]: any = await shardManager
        .getControlPool()
        .query('SELECT id, code, name FROM location WHERE id = ? LIMIT 1', [locationId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Location not found', code: 'NOT_FOUND' });
      return res.json(await ensureHiringShardForLocation(rows[0]));
    }
    res.json(await ensureHiringShardsForAllLocations());
  } catch (err) {
    fail(res, err, 'provision shards');
  }
});

router.get('/outbox/stats', adminOnly, requireAction('RECRUITMENT', 'view'), async (_req, res) => {
  try {
    res.json(await getHiringOutboxStats());
  } catch (err) {
    fail(res, err, 'outbox stats');
  }
});

router.post('/outbox/requeue', adminOnly, requireAction('RECRUITMENT', 'edit'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : undefined;
    res.json({ requeued: await requeueFailedHiringEvents(ids) });
  } catch (err) {
    fail(res, err, 'outbox requeue');
  }
});

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

router.get('/forms', requireAction('RECRUITMENT', 'view'), async (req, res) => {
  try {
    const { search, status, folderId, locationId, page, limit } = req.query as Record<string, string | undefined>;
    res.json(
      await listForms({
        search,
        status,
        folderId,
        locationId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      })
    );
  } catch (err) {
    fail(res, err, 'list forms');
  }
});

router.post('/forms', requireAction('RECRUITMENT', 'create'), async (req: AuthRequest, res) => {
  try {
    const form = await createForm(req.body ?? {}, viewerOf(req));
    res.status(201).json(form);
  } catch (err) {
    fail(res, err, 'create form');
  }
});

router.get('/forms/:id', requireAction('RECRUITMENT', 'view'), async (req, res) => {
  try {
    const form = await getForm(req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found', code: 'NOT_FOUND' });
    res.json(form);
  } catch (err) {
    fail(res, err, 'get form');
  }
});

router.put('/forms/:id', requireAction('RECRUITMENT', 'edit'), async (req: AuthRequest, res) => {
  try {
    res.json(await updateForm(req.params.id, req.body ?? {}, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'update form');
  }
});

router.delete('/forms/:id', requireAction('RECRUITMENT', 'delete'), async (req, res) => {
  try {
    await deleteForm(req.params.id, viewerOf(req));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 'delete form');
  }
});

router.post('/forms/:id/versions', requireAction('RECRUITMENT', 'edit'), async (req: AuthRequest, res) => {
  try {
    const { schema, changelog } = req.body ?? {};
    if (!schema || typeof schema !== 'object') {
      return res.status(400).json({ error: 'Form schema is required', code: 'INVALID_SCHEMA' });
    }
    res.status(201).json(await saveDraftVersion(req.params.id, schema, changelog, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'save draft version');
  }
});

router.post('/forms/:id/publish', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    res.json(await publishForm(req.params.id, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'publish form');
  }
});

router.post('/forms/:id/close', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    res.json(await closeForm(req.params.id, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'close form');
  }
});

router.post('/forms/:id/reopen', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    res.json(await reopenForm(req.params.id, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'reopen form');
  }
});

router.post('/forms/:id/archive', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    res.json(await archiveForm(req.params.id, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'archive form');
  }
});

router.post('/forms/:id/unarchive', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    res.json(await unarchiveForm(req.params.id, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'unarchive form');
  }
});

router.post('/forms/:id/duplicate', requireAction('RECRUITMENT', 'create'), async (req: AuthRequest, res) => {
  try {
    res.status(201).json(await duplicateForm(req.params.id, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'duplicate form');
  }
});

router.post('/forms/:id/save-as-template', requireAction('RECRUITMENT', 'create'), async (req: AuthRequest, res) => {
  try {
    res.status(201).json(await saveFormAsTemplate(req.params.id, req.body ?? {}, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'save as template');
  }
});

// ---------------------------------------------------------------------------
// Share links & analytics
// ---------------------------------------------------------------------------

router.get('/forms/:formId/links', requireAction('RECRUITMENT', 'view'), async (req, res) => {
  try {
    res.json(await listLinks(req.params.formId));
  } catch (err) {
    fail(res, err, 'list links');
  }
});

router.post('/forms/:formId/links', requireAction('RECRUITMENT', 'create'), async (req: AuthRequest, res) => {
  try {
    res.status(201).json(await createLink(req.params.formId, req.body ?? {}, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'create link');
  }
});

router.get('/links/:id', requireAction('RECRUITMENT', 'view'), async (req, res) => {
  try {
    const link = await getLink(req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });
    res.json(link);
  } catch (err) {
    fail(res, err, 'get link');
  }
});

router.patch('/links/:id', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    res.json(await updateLink(req.params.id, req.body ?? {}, viewerOf(req)));
  } catch (err) {
    fail(res, err, 'update link');
  }
});

router.delete('/links/:id', requireAction('RECRUITMENT', 'delete'), async (req, res) => {
  try {
    await deleteLink(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 'delete link');
  }
});

router.post('/links/:id/regenerate', requireAction('RECRUITMENT', 'update'), async (req, res) => {
  try {
    res.json(await regenerateLinkCode(req.params.id));
  } catch (err) {
    fail(res, err, 'regenerate link');
  }
});

router.get('/forms/:formId/analytics', requireAction('RECRUITMENT', 'view'), async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    res.json(await getFormLinkAnalytics(req.params.formId, days));
  } catch (err) {
    fail(res, err, 'link analytics');
  }
});

// ---------------------------------------------------------------------------
// Applications (candidates)
// ---------------------------------------------------------------------------

function applicationListFilters(req: AuthRequest) {
  const q = req.query as Record<string, string | undefined>;
  return {
    locationId: q.locationId,
    formId: q.formId,
    stages: q.stages ? q.stages.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    search: q.search,
    starred: q.starred === 'true' ? true : q.starred === 'false' ? false : undefined,
    rating: q.rating ? Number(q.rating) : undefined,
    source: q.source,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    duplicatesOnly: q.duplicatesOnly === 'true',
    sortBy: q.sortBy as any,
    sortOrder: q.sortOrder as any,
    page: q.page ? Number(q.page) : undefined,
    limit: q.limit ? Number(q.limit) : undefined,
  };
}

router.get('/applications', requireAction('RECRUITMENT', 'view'), async (req: AuthRequest, res) => {
  try {
    res.json(await listApplications(viewerOf(req), applicationListFilters(req)));
  } catch (err) {
    fail(res, err, 'list applications');
  }
});

router.get('/applications/:id', requireAction('RECRUITMENT', 'view'), async (req: AuthRequest, res) => {
  try {
    const { locationId, shard } = req.query as Record<string, string | undefined>;
    res.json(await getApplicationDetail(viewerOf(req), req.params.id, { locationId, shard }));
  } catch (err) {
    fail(res, err, 'get application');
  }
});

router.patch('/applications/:id/stage', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    const { toStage, note, rejectionReason, locationId, shard } = req.body ?? {};
    res.json(
      await updateApplicationStage(viewerOf(req), req.params.id, {
        toStage,
        note,
        rejectionReason,
        locationId,
        shard,
      })
    );
  } catch (err) {
    fail(res, err, 'update application stage');
  }
});

router.patch('/applications/:id', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    const { rating, starred, expectedSalary, availableFrom, locationId, shard } = req.body ?? {};
    res.json(
      await updateApplicationDetails(
        viewerOf(req),
        req.params.id,
        { rating, starred, expectedSalary, availableFrom },
        { locationId, shard }
      )
    );
  } catch (err) {
    fail(res, err, 'update application');
  }
});

router.post('/applications/bulk-stage', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    const { applicationIds, toStage, note, locationId, shard } = req.body ?? {};
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({ error: 'applicationIds is required', code: 'INVALID_REQUEST' });
    }
    if (applicationIds.length > 200) {
      return res.status(400).json({ error: 'Too many applications in one batch (max 200)', code: 'INVALID_REQUEST' });
    }
    res.json(await bulkUpdateApplicationStage(viewerOf(req), applicationIds, toStage, { note, locationId, shard }));
  } catch (err) {
    fail(res, err, 'bulk stage update');
  }
});

router.delete('/applications/:id', requireAction('RECRUITMENT', 'delete'), async (req: AuthRequest, res) => {
  try {
    const { locationId, shard } = req.query as Record<string, string | undefined>;
    await deleteApplication(viewerOf(req), req.params.id, { locationId, shard });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 'delete application');
  }
});

router.post('/applications/:id/notes', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    const { body, locationId, shard } = req.body ?? {};
    res.status(201).json(await addApplicationNote(viewerOf(req), req.params.id, body, { locationId, shard }));
  } catch (err) {
    fail(res, err, 'add note');
  }
});

router.delete('/applications/:id/notes/:noteId', requireAction('RECRUITMENT', 'delete'), async (req: AuthRequest, res) => {
  try {
    const { locationId, shard } = req.query as Record<string, string | undefined>;
    await deleteApplicationNote(viewerOf(req), req.params.id, req.params.noteId, { locationId, shard });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 'delete note');
  }
});

router.get(
  '/applications/:id/documents/:documentId/download',
  requireAction('RECRUITMENT', 'view'),
  async (req: AuthRequest, res) => {
    try {
      const { locationId, shard } = req.query as Record<string, string | undefined>;
      const detail = await getApplicationDetail(viewerOf(req), req.params.id, { locationId, shard });
      const document = (detail.documents as any[]).find((d) => d.id === req.params.documentId);
      if (!document) return res.status(404).json({ error: 'Document not found', code: 'NOT_FOUND' });

      const file = readHiringUpload(document.storageKey);
      if (!file) return res.status(404).json({ error: 'File no longer available', code: 'NOT_FOUND' });

      const fileName = String(document.fileName || file.fileName).replace(/[^\w.\- ]/g, '_');
      res.setHeader('Content-Type', document.mimeType || file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(file.buffer);
    } catch (err) {
      fail(res, err, 'download document');
    }
  }
);

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

router.get('/interviews/upcoming', requireAction('RECRUITMENT', 'view'), async (req: AuthRequest, res) => {
  try {
    const { locationId, days } = req.query as Record<string, string | undefined>;
    res.json(await listUpcomingInterviews(viewerOf(req), { locationId, days: days ? Number(days) : undefined }));
  } catch (err) {
    fail(res, err, 'upcoming interviews');
  }
});

router.post('/applications/:id/interviews', requireAction('RECRUITMENT', 'update'), async (req: AuthRequest, res) => {
  try {
    const { locationId, shard, ...input } = req.body ?? {};
    res.status(201).json(await scheduleInterview(viewerOf(req), req.params.id, input, { locationId, shard }));
  } catch (err) {
    fail(res, err, 'schedule interview');
  }
});

router.patch(
  '/applications/:id/interviews/:interviewId',
  requireAction('RECRUITMENT', 'update'),
  async (req: AuthRequest, res) => {
    try {
      const { locationId, shard, ...patch } = req.body ?? {};
      res.json(await updateInterview(viewerOf(req), req.params.id, req.params.interviewId, patch, { locationId, shard }));
    } catch (err) {
      fail(res, err, 'update interview');
    }
  }
);

// ---------------------------------------------------------------------------
// Candidates, dashboard, export
// ---------------------------------------------------------------------------

router.get('/candidates/:candidateId', requireAction('RECRUITMENT', 'view'), async (req: AuthRequest, res) => {
  try {
    const { locationId, shard } = req.query as Record<string, string | undefined>;
    res.json(await getCandidateProfile(viewerOf(req), req.params.candidateId, { locationId, shard }));
  } catch (err) {
    fail(res, err, 'candidate profile');
  }
});

router.get('/dashboard', requireAction('RECRUITMENT', 'view'), async (req: AuthRequest, res) => {
  try {
    const { locationId, days } = req.query as Record<string, string | undefined>;
    res.json(await getHiringDashboard(viewerOf(req), { locationId, days: days ? Number(days) : undefined }));
  } catch (err) {
    fail(res, err, 'dashboard');
  }
});

router.get('/export', exportLimiter, requireAction('RECRUITMENT', 'export'), async (req: AuthRequest, res) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const result = await exportApplications(viewerOf(req), applicationListFilters(req), format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('X-Export-Row-Count', String(result.rowCount));
    res.send(result.buffer);
  } catch (err) {
    fail(res, err, 'export applications');
  }
});

export default router;
