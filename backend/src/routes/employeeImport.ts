/**
 * Bulk Employee Import API — template, preview, execute, history, ID policy,
 * data-quality audit and the permission-aware workforce CSV export.
 *
 * Mounted at `/api/employees/import` (and `/api/employees/export`) — see
 * `api/v1/index.ts`, registered BEFORE the generic `/employees/:id` matcher.
 */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { uploadLimiter, exportLimiter } from '../middleware/rateLimiting.js';
import { AuditService } from '../services/auditService.js';
import { getUserModuleAccess, accessRank } from '../services/rbacService.js';
import {
  IMPORT_COLUMNS,
  ImportActor,
  ImportMode,
  buildTemplateCsv,
  buildEmployeeExportCsv,
  canImport,
  canViewSensitive,
  executeImport,
  getImportBatch,
  listImportHistory,
  runDataQualityAudit,
  validateAndPreview,
} from '../services/employeeImportService.js';
import {
  getIdAllocationInfo,
  getEmployeeIdPolicy,
  setEmployeeIdPolicy,
} from '../services/employeeIdService.js';

const router = Router();
router.use(authenticate);

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CSV_ROWS = 5000;

const HR_CAPABLE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER']);

function toActor(req: AuthRequest): ImportActor {
  return {
    userId: req.user!.id,
    userName: req.user!.fullName || req.user!.email,
    role: req.user!.role,
    locationId: req.user!.locationId ?? null,
    permissions: Array.isArray(req.user!.permissions) ? req.user!.permissions : [],
  };
}

/**
 * Bulk-import authorisation gate.
 *  - Super Admin / Admin: organisation-wide.
 *  - RBAC-restricted users: `USERS` (Workforce & Staff Directory) module access.
 *  - Legacy (non-RBAC) users: an HR-capable role plus ADD/EDIT permission.
 * Location restrictions are enforced again per-row on the backend.
 */
function importAccess(level: 'view' | 'edit') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const actor = toActor(req);
    try {
      const moduleAccess = await getUserModuleAccess(req.user.id, req.user.role);
      const moduleRank = accessRank(moduleAccess.access.USERS || 'none');
      const needed = accessRank(level);

      let allowed: boolean;
      if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
        allowed = true;
      } else if (moduleAccess.source === 'rbac') {
        allowed = moduleRank >= needed;
      } else {
        allowed = HR_CAPABLE_ROLES.has(actor.role) && canImport(actor);
      }

      if (!allowed) {
        AuditService.log({
          userId: req.user.id,
          locationId: req.user.locationId,
          action: 'UNAUTHORIZED_IMPORT_ATTEMPT',
          entityType: 'EmployeeImport',
          entityId: req.originalUrl,
          ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
          userAgent: (req.headers['user-agent'] as string) || 'Client',
          riskScore: 70,
          tags: ['bulk-import-denied', 'security-alert'],
          after: { requiredLevel: level, userRole: req.user.role, moduleAccess: moduleAccess.access.USERS },
        }).catch(() => {});

        return res.status(403).json({
          error: 'Forbidden: insufficient permissions',
          message:
            level === 'edit'
              ? 'You do not have permission to import or update employee records.'
              : 'You do not have permission to view the bulk import workspace.',
        });
      }
      return next();
    } catch (err: any) {
      console.error('Import access check error:', err);
      return res.status(500).json({ error: 'Failed to verify import permissions' });
    }
  };
}

const csvBodySchema = z.object({
  csv: z.string().min(1, 'CSV content is required').max(MAX_CSV_BYTES, 'CSV file is too large (max 5 MB)'),
  fileName: z.string().max(255).optional().default('employees.csv'),
  mode: z.enum(['new', 'update', 'upsert']),
});

function rejectUnsafeFile(fileName: string, res: Response): boolean {
  const name = String(fileName || '').trim();
  if (!/\.csv$/i.test(name)) {
    res.status(400).json({
      error: 'Unsupported file type',
      message: 'Only .csv files are accepted. Download the sample template and fill it in.',
    });
    return true;
  }
  return false;
}

/** Shape-check the uploaded text before parsing (structure, size, row count). */
function checkCsvStructure(csv: string, res: Response): boolean {
  if (!csv || !csv.trim()) {
    res.status(400).json({ error: 'Empty file', message: 'The uploaded file contains no data.' });
    return true;
  }
  // Reject control characters (excluding tab/CR/LF) — a reliable signal that
  // the file is binary (e.g. an .xlsx renamed to .csv) rather than UTF-8 text.
  const controlCount = (csv.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  if (controlCount > 0) {
    res.status(400).json({
      error: 'Binary or corrupt file',
      message: 'The file does not look like a UTF-8 CSV document. Re-save it as CSV (UTF-8).',
    });
    return true;
  }
  const lines = csv.split(/\r\n|\n|\r/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length - 1 > MAX_CSV_ROWS) {
    res.status(400).json({
      error: 'Too many rows',
      message: `The importer accepts up to ${MAX_CSV_ROWS} employee rows per file. Split this file into smaller batches.`,
    });
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /template — sample CSV generated from the live import schema
// ─────────────────────────────────────────────────────────────────────────────
router.get('/template', exportLimiter, authorize('VIEW'), importAccess('view'), async (_req: AuthRequest, res: Response) => {
  try {
    const csv = await buildTemplateCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bsc_textiles_employee_import_template.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send('\uFEFF' + csv); // BOM so Excel opens Unicode names correctly
  } catch (err: any) {
    console.error('Template download error:', err);
    res.status(500).json({ error: 'Failed to generate the sample CSV template' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /preview — validate without touching production data
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/preview',
  uploadLimiter,
  authorize('VIEW'),
  importAccess('view'),
  async (req: AuthRequest, res: Response) => {
    const parsedBody = csvBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'Invalid request',
        message: parsedBody.error.issues[0]?.message || 'Invalid upload payload',
      });
    }
    const { csv, fileName, mode } = parsedBody.data;
    if (rejectUnsafeFile(fileName, res)) return;
    if (checkCsvStructure(csv, res)) return;

    try {
      const actor = toActor(req);
      if (!canImport(actor)) {
        return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      }
      const preview = await validateAndPreview(csv, { mode: mode as ImportMode, fileName, actor });
      return res.json(preview);
    } catch (err: any) {
      console.error('Import preview error:', err);
      return res.status(500).json({ error: 'Failed to validate the CSV file', message: err?.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /execute — commit a confirmed import (single transaction)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/execute',
  uploadLimiter,
  authorize('EDIT'),
  importAccess('edit'),
  async (req: AuthRequest, res: Response) => {
    const parsedBody = csvBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'Invalid request',
        message: parsedBody.error.issues[0]?.message || 'Invalid import payload',
      });
    }
    const { csv, fileName, mode } = parsedBody.data;
    if (rejectUnsafeFile(fileName, res)) return;
    if (checkCsvStructure(csv, res)) return;

    try {
      const actor = toActor(req);
      if (!canImport(actor)) {
        return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      }

      // Re-validate immediately before writing so the executed rows always
      // reflect the live database state (retry-safe, no stale previews).
      const preview = await validateAndPreview(csv, { mode: mode as ImportMode, fileName, actor });

      if (preview.fileErrors.length > 0) {
        return res.status(400).json({
          error: 'The file could not be imported',
          message: preview.fileErrors.join(' '),
          preview,
        });
      }

      const writable = preview.rows.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE');
      if (writable.length === 0) {
        return res.status(400).json({
          error: 'Nothing to import',
          message:
            'Every row either failed validation or was skipped. Review the preview and correct the reported errors.',
          preview,
        });
      }

      const result = await executeImport(preview, actor);

      AuditService.log({
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'EMPLOYEE_BULK_IMPORT',
        entityType: 'EmployeeImportBatch',
        entityId: result.batchRef,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
        riskScore: 30,
        tags: ['bulk-import', 'employee-mutation'],
        after: {
          fileName,
          mode,
          totalRows: result.totalRows,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
          status: result.status,
          idFormatUsed: result.idFormatUsed,
          // Employee IDs only — no personal or statutory values are logged.
          assignedEmployeeIds: result.assignedIds,
        },
      }).catch(() => {});

      return res.json({ ...result, preview });
    } catch (err: any) {
      const executeResult = err?.executeResult;
      if (executeResult) {
        return res.status(400).json({
          error: 'The import failed and was rolled back',
          message: executeResult.failureDetails,
          result: executeResult,
        });
      }
      console.error('Import execute error:', err);
      return res.status(500).json({ error: 'Failed to import employees', message: err?.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /history — import batches
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', authorize('VIEW'), importAccess('view'), async (req: AuthRequest, res: Response) => {
  try {
    const actor = toActor(req);
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const history = await listImportHistory(actor, page, limit);
    res.json(history);
  } catch (err: any) {
    console.error('Import history error:', err);
    res.status(500).json({ error: 'Failed to load import history' });
  }
});

router.get('/history/:batchRef', authorize('VIEW'), importAccess('view'), async (req: AuthRequest, res: Response) => {
  try {
    const actor = toActor(req);
    const batch = await getImportBatch(String(req.params.batchRef), actor);
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });
    res.json(batch);
  } catch (err: any) {
    console.error('Import batch error:', err);
    res.status(500).json({ error: 'Failed to load the import batch' });
  }
});

router.get(
  '/history/:batchRef/error-report',
  authorize('VIEW'),
  importAccess('view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const actor = toActor(req);
      const batch = await getImportBatch(String(req.params.batchRef), actor);
      if (!batch) return res.status(404).json({ error: 'Import batch not found' });

      const { buildErrorReportCsv } = await import('../services/employeeImportService.js');
      const previewLike = {
        rows: (batch.rows || []).map((r: any) => ({
          rowNumber: r.rowNumber,
          employeeId: r.employeeId,
          employeeName: r.name,
          mobile: r.mobile,
          email: r.email,
          locationCode: r.locationCode,
          action: r.action,
          errors: r.errors || [],
          warnings: r.warnings || [],
        })),
      } as any;
      const csv = buildErrorReportCsv(previewLike);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bsc_textiles_import_errors_${String(req.params.batchRef).replace(/[^A-Za-z0-9_-]/g, '')}.csv"`
      );
      res.send('\uFEFF' + csv);
    } catch (err: any) {
      console.error('Error report download error:', err);
      res.status(500).json({ error: 'Failed to build the error report' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Employee ID policy & allocation
// ─────────────────────────────────────────────────────────────────────────────
router.get('/id-policy', authorize('VIEW'), importAccess('view'), async (_req: AuthRequest, res: Response) => {
  try {
    const info = await getIdAllocationInfo();
    res.json(info);
  } catch (err: any) {
    console.error('ID policy error:', err);
    res.status(500).json({ error: 'Failed to load the Employee ID policy' });
  }
});

router.put('/id-policy', authorize('CONFIGURE'), async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only a Super Admin may change the Employee ID format.',
    });
  }
  const schema = z.object({
    prefix: z.string().min(2).max(16).regex(/^[A-Za-z0-9-]+$/, 'Prefix may only contain letters, digits and dashes'),
    padding: z.number().int().min(2).max(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid Employee ID format', message: parsed.error.issues[0]?.message });
  }
  try {
    const before = await getEmployeeIdPolicy();
    const policy = await setEmployeeIdPolicy(parsed.data);
    await AuditService.log({
      userId: req.user!.id,
      locationId: req.user!.locationId,
      action: 'CONFIGURE',
      entityType: 'EmployeeIdPolicy',
      entityId: policy.formatKey,
      ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'Client',
      riskScore: 40,
      tags: ['employee-id-policy'],
      before,
      after: policy,
    });
    res.json({ message: 'Employee ID format updated', policy });
  } catch (err: any) {
    console.error('ID policy update error:', err);
    res.status(500).json({ error: 'Failed to update the Employee ID format' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /data-quality — directory integrity report
// ─────────────────────────────────────────────────────────────────────────────
router.get('/data-quality', authorize('VIEW'), importAccess('view'), async (req: AuthRequest, res: Response) => {
  try {
    const actor = toActor(req);
    const report = await runDataQualityAudit(actor);
    res.json(report);
  } catch (err: any) {
    console.error('Data quality audit error:', err);
    res.status(500).json({ error: 'Failed to run the data-quality audit' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /columns — schema documentation for the UI
// ─────────────────────────────────────────────────────────────────────────────
router.get('/columns', authorize('VIEW'), importAccess('view'), async (_req: AuthRequest, res: Response) => {
  res.json({ columns: IMPORT_COLUMNS });
});

// ─────────────────────────────────────────────────────────────────────────────
// Workforce CSV export (mounted separately at /api/employees/export)
// ─────────────────────────────────────────────────────────────────────────────
export const employeeExportRouter = Router();
employeeExportRouter.use(authenticate);

employeeExportRouter.get(
  '/csv',
  exportLimiter,
  authorize('VIEW'),
  async (req: AuthRequest, res: Response) => {
    try {
      const actor = toActor(req);
      const unmask = String(req.query.unmask || '') === 'true';
      const result = await buildEmployeeExportCsv({
        actor,
        locationId: req.query.locationId ? String(req.query.locationId) : undefined,
        departmentId: req.query.departmentId ? String(req.query.departmentId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        unmaskSensitive: unmask,
      });

      AuditService.log({
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'EMPLOYEE_CSV_EXPORT',
        entityType: 'Employee',
        entityId: result.fileName,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
        riskScore: 25,
        tags: ['data-export'],
        after: { count: result.count, unmaskedSensitive: unmask && canViewSensitive(actor) },
      }).catch(() => {});

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send('\uFEFF' + result.csv);
    } catch (err: any) {
      console.error('Employee export error:', err);
      res.status(500).json({ error: 'Failed to export employee records' });
    }
  }
);

export default router;
