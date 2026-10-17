/**
 * Candidate Hiring — form service (control DB).
 *
 * Owns the hiring STRUCTURE: folders, forms, immutable form versions,
 * reusable templates and the public resolution of a form by token.
 *
 * Lifecycle rules:
 *   * A form always has at least one version. The newest version is the draft
 *     while `isDraft = 1`; publishing freezes it and points
 *     `hiring_form.currentVersionId` at it.
 *   * Editing a published form never mutates what candidates already saw —
 *     schema edits land in a NEW draft version until HR publishes again.
 *   * Submissions are validated against `currentVersionId`'s schema and each
 *     application row stores the exact `formVersionId` it was built from.
 */

import crypto from 'node:crypto';
import { shardManager } from '../../core/sharding/index.js';
import {
  HiringFormSchema,
  HiringFormStep,
  validateHiringFormSchema,
} from '../../validation/hiringValidators.js';
import { getSettings } from './hiringSettings.js';
import { randomToken } from './hiringCrypto.js';

export const HIRING_FORM_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export type HiringFormStatus = (typeof HIRING_FORM_STATUSES)[number];

export interface HiringActor {
  id: string;
  fullName?: string | null;
}

export interface HiringFormInput {
  title: string;
  jobTitle?: string | null;
  jobDescription?: string | null;
  employmentType?: string;
  experienceLevel?: string | null;
  qualification?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  openings?: number;
  locationIds: string[];
  allowOtherLocations?: boolean;
  shiftDetails?: string | null;
  openAt?: string | null;
  closeAt?: string | null;
  folderId?: string | null;
  templateSlug?: string | null;
  settings?: Record<string, unknown> | null;
  schema?: HiringFormSchema | null;
}

export interface HiringFormListOptions {
  search?: string;
  status?: string;
  folderId?: string;
  locationId?: string;
  page?: number;
  limit?: number;
}

function controlPool() {
  return shardManager.getControlPool();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapFormRow(row: any) {
  if (!row) return null;
  return {
    ...row,
    locationIds: parseJson<string[]>(row.locationIds, []),
    settings: parseJson<Record<string, unknown> | null>(row.settings, null),
    salaryMin: row.salaryMin !== null && row.salaryMin !== undefined ? Number(row.salaryMin) : null,
    salaryMax: row.salaryMax !== null && row.salaryMax !== undefined ? Number(row.salaryMax) : null,
    submissions: row.submissions !== undefined ? Number(row.submissions) : undefined,
    views: row.views !== undefined ? Number(row.views) : undefined,
    linkCount: row.linkCount !== undefined ? Number(row.linkCount) : undefined,
    versionCount: row.versionCount !== undefined ? Number(row.versionCount) : undefined,
  };
}

/** Built-in fallback schema when no template is selected and none supplied. */
export function minimalFormSchema(): HiringFormSchema {
  return {
    version: 1,
    steps: [
      {
        key: 'personal',
        title: 'Personal Details',
        fields: [
          { key: 'fullName', type: 'TEXT', label: 'Full Name', required: true, width: 'half', validation: { minLength: 2, maxLength: 120, pattern: 'name' } },
          { key: 'phone', type: 'PHONE', label: 'Mobile Number', required: true, width: 'half' },
          { key: 'email', type: 'EMAIL', label: 'Email', required: false, width: 'half' },
          { key: 'city', type: 'TEXT', label: 'Current City', required: false, width: 'half' },
          { key: 'consent', type: 'CHECKBOX', label: 'I agree to the processing of my personal data for recruitment', required: true, width: 'full' },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function getActiveHiringLocations(): Promise<Array<{ id: string; code: string; name: string }>> {
  const [rows]: any = await controlPool().query(
    `SELECT id, code, name FROM location
     WHERE status = 'ACTIVE' AND hiringEnabled = 1
     ORDER BY hiringSortOrder ASC, name ASC`
  );
  return rows;
}

async function loadLocationsByIds(ids: string[]): Promise<Array<{ id: string; code: string; name: string; status: string; hiringEnabled: number }>> {
  if (ids.length === 0) return [];
  const [rows]: any = await controlPool().query(
    'SELECT id, code, name, status, hiringEnabled FROM location WHERE id IN (?)',
    [ids]
  );
  return rows;
}

async function assertLocationsUsable(locationIds: string[]): Promise<void> {
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    throw Object.assign(new Error('Select at least one hiring location'), { code: 'INVALID_LOCATIONS' });
  }
  if (locationIds.length > 50) {
    throw Object.assign(new Error('Too many locations selected (max 50)'), { code: 'INVALID_LOCATIONS' });
  }
  const found = await loadLocationsByIds(locationIds);
  if (found.length !== new Set(locationIds).size) {
    throw Object.assign(new Error('One or more selected locations do not exist'), { code: 'INVALID_LOCATIONS' });
  }
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function listFolders() {
  const [rows]: any = await controlPool().query(
    `SELECT f.*, (SELECT COUNT(*) FROM hiring_form hf WHERE hf.folderId = f.id AND hf.deletedAt IS NULL) AS formCount
     FROM hiring_folder f
     WHERE f.deletedAt IS NULL
     ORDER BY f.sortOrder ASC, f.name ASC`
  );
  return rows;
}

export async function createFolder(input: { name: string; description?: string; color?: string; sortOrder?: number }, actor: HiringActor) {
  const id = newId('hfold');
  await controlPool().query(
    `INSERT INTO hiring_folder (id, name, description, color, sortOrder, createdById)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.name.trim(), input.description?.trim() || null, input.color || null, input.sortOrder ?? 0, actor.id]
  );
  return getFolder(id);
}

export async function getFolder(id: string) {
  const [rows]: any = await controlPool().query('SELECT * FROM hiring_folder WHERE id = ? AND deletedAt IS NULL', [id]);
  return rows[0] ?? null;
}

export async function updateFolder(id: string, patch: { name?: string; description?: string | null; color?: string | null; sortOrder?: number }) {
  const folder = await getFolder(id);
  if (!folder) throw Object.assign(new Error('Folder not found'), { code: 'NOT_FOUND' });
  await controlPool().query(
    `UPDATE hiring_folder SET name = COALESCE(?, name), description = ?, color = ?, sortOrder = COALESCE(?, sortOrder)
     WHERE id = ?`,
    [patch.name?.trim() || null, patch.description ?? folder.description, patch.color ?? folder.color, patch.sortOrder ?? null, id]
  );
  return getFolder(id);
}

export async function deleteFolder(id: string) {
  await controlPool().query(
    `UPDATE hiring_form SET folderId = NULL WHERE folderId = ? AND deletedAt IS NULL`,
    [id]
  );
  await controlPool().query('UPDATE hiring_folder SET deletedAt = CURRENT_TIMESTAMP(3) WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Forms — listing & detail
// ---------------------------------------------------------------------------

export async function listForms(options: HiringFormListOptions) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ['f.deletedAt IS NULL'];
  const params: any[] = [];

  if (options.status) {
    conditions.push('f.status = ?');
    params.push(options.status);
  } else {
    conditions.push("f.status <> 'ARCHIVED'");
  }
  if (options.folderId) {
    conditions.push('f.folderId = ?');
    params.push(options.folderId);
  }
  if (options.search) {
    conditions.push('(f.title LIKE ? OR f.jobTitle LIKE ?)');
    params.push(`%${options.search}%`, `%${options.search}%`);
  }
  if (options.locationId) {
    conditions.push('JSON_CONTAINS(f.locationIds, JSON_QUOTE(?))');
    params.push(options.locationId);
  }
  const where = conditions.join(' AND ');

  const [countRows]: any = await controlPool().query(`SELECT COUNT(*) AS count FROM hiring_form f WHERE ${where}`, params);
  const total = Number(countRows[0]?.count || 0);

  const [rows]: any = await controlPool().query(
    `SELECT f.*, fo.name AS folderName,
       (SELECT COUNT(*) FROM hiring_form_version v WHERE v.formId = f.id) AS versionCount,
       (SELECT COUNT(*) FROM hiring_link l WHERE l.formId = f.id) AS linkCount,
       (SELECT COALESCE(SUM(l.submissions), 0) FROM hiring_link l WHERE l.formId = f.id) AS submissions,
       (SELECT COALESCE(SUM(l.viewCount), 0) FROM hiring_link l WHERE l.formId = f.id) AS views,
       (SELECT COUNT(*) FROM hiring_link_event e WHERE e.formId = f.id AND e.eventType = 'SUBMIT') AS totalSubmissions
     FROM hiring_form f
     LEFT JOIN hiring_folder fo ON fo.id = f.folderId
     WHERE ${where}
     ORDER BY f.updatedAt DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { forms: rows.map(mapFormRow), total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

export async function getForm(id: string) {
  const [rows]: any = await controlPool().query(
    `SELECT f.*, fo.name AS folderName FROM hiring_form f
     LEFT JOIN hiring_folder fo ON fo.id = f.folderId
     WHERE f.id = ? AND f.deletedAt IS NULL LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const form = mapFormRow(rows[0]);

  const [versions]: any = await controlPool().query(
    `SELECT id, formId, version, isDraft, changelog, publishedAt, publishedById, createdById, createdAt, updatedAt
     FROM hiring_form_version WHERE formId = ? ORDER BY version DESC`,
    [id]
  );

  const [links]: any = await controlPool().query(
    'SELECT * FROM hiring_link WHERE formId = ? ORDER BY createdAt DESC',
    [id]
  );

  const currentVersionId = form.currentVersionId;
  const draftRow = versions.find((v: any) => Boolean(v.isDraft));
  const publishedRow = currentVersionId ? versions.find((v: any) => v.id === currentVersionId) : null;
  const [draftSchemaRows]: any = draftRow
    ? await controlPool().query('SELECT `schema` FROM hiring_form_version WHERE id = ?', [draftRow.id])
    : [[]];
  const [publishedSchemaRows]: any = currentVersionId
    ? await controlPool().query('SELECT `schema` FROM hiring_form_version WHERE id = ?', [currentVersionId])
    : [[]];

  return {
    ...form,
    versions,
    links,
    draft: draftRow
      ? { ...draftRow, isDraft: true, schema: parseJson<HiringFormSchema>(draftSchemaRows[0]?.schema, minimalFormSchema()) }
      : null,
    published: currentVersionId && publishedSchemaRows[0]
      ? {
          ...(publishedRow ?? { id: currentVersionId }),
          isDraft: false,
          schema: parseJson<HiringFormSchema>(publishedSchemaRows[0].schema, minimalFormSchema()),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Forms — writes
// ---------------------------------------------------------------------------

export async function createForm(input: HiringFormInput, actor: HiringActor) {
  await assertLocationsUsable(input.locationIds);

  let schema: HiringFormSchema | null = input.schema ?? null;
  if (!schema && input.templateSlug) {
    const template = await getTemplateBySlug(input.templateSlug);
    if (!template) throw Object.assign(new Error(`Template ${input.templateSlug} not found`), { code: 'INVALID_TEMPLATE' });
    schema = parseJson<HiringFormSchema>(template.schema, minimalFormSchema());
  }
  if (!schema) schema = minimalFormSchema();

  const schemaErrors = validateHiringFormSchema(schema);
  if (schemaErrors.length > 0) {
    throw Object.assign(new Error('Form schema is invalid'), { code: 'INVALID_SCHEMA', details: schemaErrors });
  }

  if (input.openAt && input.closeAt && new Date(input.openAt) >= new Date(input.closeAt)) {
    throw Object.assign(new Error('Closing date must be after the opening date'), { code: 'INVALID_WINDOW' });
  }

  const id = newId('hform');
  const versionId = newId('hver');
  const publicToken = randomToken(24);

  await controlPool().query(
    `INSERT INTO hiring_form
       (id, publicToken, title, jobTitle, jobDescription, employmentType, experienceLevel, qualification,
        salaryMin, salaryMax, currency, openings, locationIds, allowOtherLocations, shiftDetails,
        openAt, closeAt, status, folderId, currentVersionId, templateKey, ownerId, settings, createdById)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, 'DRAFT', ?, NULL, ?, ?, CAST(? AS JSON), ?)`,
    [
      id,
      publicToken,
      input.title.trim(),
      input.jobTitle?.trim() || null,
      input.jobDescription || null,
      input.employmentType || 'FULL_TIME',
      input.experienceLevel || null,
      input.qualification || null,
      input.salaryMin ?? null,
      input.salaryMax ?? null,
      input.currency || 'INR',
      input.openings ?? 1,
      JSON.stringify([...new Set(input.locationIds)]),
      input.allowOtherLocations ? 1 : 0,
      input.shiftDetails || null,
      input.openAt ? new Date(input.openAt) : null,
      input.closeAt ? new Date(input.closeAt) : null,
      input.folderId || null,
      input.templateSlug || null,
      actor.id,
      JSON.stringify(input.settings ?? null),
      actor.id,
    ]
  );

  await controlPool().query(
    `INSERT INTO hiring_form_version (id, formId, version, \`schema\`, changelog, isDraft, createdById)
     VALUES (?, ?, 1, CAST(? AS JSON), 'Initial draft', 1, ?)`,
    [versionId, id, JSON.stringify(schema), actor.id]
  );

  return getForm(id);
}

export async function updateForm(id: string, input: Partial<HiringFormInput>, actor: HiringActor) {
  const form = await getForm(id);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });
  if (form.status === 'ARCHIVED') throw Object.assign(new Error('Unarchive the form before editing'), { code: 'FORM_ARCHIVED' });

  if (input.locationIds) await assertLocationsUsable(input.locationIds);
  if (input.openAt && input.closeAt && new Date(input.openAt) >= new Date(input.closeAt)) {
    throw Object.assign(new Error('Closing date must be after the opening date'), { code: 'INVALID_WINDOW' });
  }

  await controlPool().query(
    `UPDATE hiring_form SET
       title = COALESCE(?, title),
       jobTitle = COALESCE(?, jobTitle),
       jobDescription = COALESCE(?, jobDescription),
       employmentType = COALESCE(?, employmentType),
       experienceLevel = COALESCE(?, experienceLevel),
       qualification = COALESCE(?, qualification),
       salaryMin = COALESCE(?, salaryMin),
       salaryMax = COALESCE(?, salaryMax),
       currency = COALESCE(?, currency),
       openings = COALESCE(?, openings),
       locationIds = COALESCE(CAST(? AS JSON), locationIds),
       allowOtherLocations = COALESCE(?, allowOtherLocations),
       shiftDetails = COALESCE(?, shiftDetails),
       openAt = COALESCE(?, openAt),
       closeAt = COALESCE(?, closeAt),
       folderId = ?,
       settings = COALESCE(CAST(? AS JSON), settings)
     WHERE id = ?`,
    [
      input.title?.trim() || null,
      input.jobTitle?.trim() || null,
      input.jobDescription ?? null,
      input.employmentType || null,
      input.experienceLevel ?? null,
      input.qualification ?? null,
      input.salaryMin ?? null,
      input.salaryMax ?? null,
      input.currency || null,
      input.openings ?? null,
      input.locationIds ? JSON.stringify([...new Set(input.locationIds)]) : null,
      input.allowOtherLocations === undefined ? null : input.allowOtherLocations ? 1 : 0,
      input.shiftDetails ?? null,
      input.openAt === undefined ? null : input.openAt ? new Date(input.openAt) : null,
      input.closeAt === undefined ? null : input.closeAt ? new Date(input.closeAt) : null,
      input.folderId === undefined ? form.folderId : input.folderId,
      input.settings === undefined ? null : JSON.stringify(input.settings ?? null),
      id,
    ]
  );

  if (input.schema) {
    const schemaErrors = validateHiringFormSchema(input.schema);
    if (schemaErrors.length > 0) {
      throw Object.assign(new Error('Form schema is invalid'), { code: 'INVALID_SCHEMA', details: schemaErrors });
    }
    await saveDraftVersion(id, input.schema, 'Schema updated', actor);
  }

  return getForm(id);
}

/** Upsert the newest draft version. Published versions are never mutated. */
export async function saveDraftVersion(formId: string, schema: HiringFormSchema, changelog: string | undefined, actor: HiringActor) {
  const form = await getForm(formId);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });

  if (form.draft) {
    await controlPool().query(
      'UPDATE hiring_form_version SET `schema` = CAST(? AS JSON), changelog = COALESCE(?, changelog) WHERE id = ?',
      [JSON.stringify(schema), changelog || null, form.draft.id]
    );
    return form.draft.id;
  }

  const [maxRows]: any = await controlPool().query(
    'SELECT COALESCE(MAX(version), 0) AS maxVersion FROM hiring_form_version WHERE formId = ?',
    [formId]
  );
  const nextVersion = Number(maxRows[0]?.maxVersion || 0) + 1;
  const versionId = newId('hver');
  await controlPool().query(
    `INSERT INTO hiring_form_version (id, formId, version, \`schema\`, changelog, isDraft, createdById)
     VALUES (?, ?, ?, CAST(? AS JSON), ?, 1, ?)`,
    [versionId, formId, nextVersion, JSON.stringify(schema), changelog || null, actor.id]
  );
  return versionId;
}

export async function publishForm(formId: string, actor: HiringActor) {
  const form = await getForm(formId);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });
  if (form.status === 'ARCHIVED') throw Object.assign(new Error('Unarchive the form before publishing'), { code: 'FORM_ARCHIVED' });

  const draft = form.draft;
  if (!draft) throw Object.assign(new Error('No draft changes to publish'), { code: 'NO_DRAFT' });

  const schema = parseJson<HiringFormSchema>(draft.schema, minimalFormSchema());
  const schemaErrors = validateHiringFormSchema(schema);
  if (schemaErrors.length > 0) {
    throw Object.assign(new Error('Form schema is invalid'), { code: 'INVALID_SCHEMA', details: schemaErrors });
  }
  await assertLocationsUsable(form.locationIds);

  const usable = await loadLocationsByIds(form.locationIds);
  const disabled = usable.filter((l) => l.status !== 'ACTIVE' || !l.hiringEnabled);
  if (disabled.length > 0) {
    throw Object.assign(
      new Error(`Hiring is disabled for: ${disabled.map((l) => l.code).join(', ')}. Enable hiring there or remove the location.`),
      { code: 'LOCATION_HIRING_DISABLED' }
    );
  }

  await controlPool().query(
    'UPDATE hiring_form_version SET isDraft = 0, publishedAt = CURRENT_TIMESTAMP(3), publishedById = ? WHERE id = ?',
    [actor.id, draft.id]
  );
  await controlPool().query(
    `UPDATE hiring_form SET status = 'PUBLISHED', currentVersionId = ?, publishedAt = CURRENT_TIMESTAMP(3), closedAt = NULL
     WHERE id = ?`,
    [draft.id, formId]
  );

  return getForm(formId);
}

export async function closeForm(formId: string, actor: HiringActor) {
  const form = await getForm(formId);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });
  await controlPool().query(
    `UPDATE hiring_form SET status = 'CLOSED', closedAt = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [formId]
  );
  return getForm(formId);
}

export async function reopenForm(formId: string, actor: HiringActor) {
  const form = await getForm(formId);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });
  if (!form.currentVersionId) throw Object.assign(new Error('Publish the form before reopening'), { code: 'NO_PUBLISHED_VERSION' });
  await controlPool().query(
    `UPDATE hiring_form SET status = 'PUBLISHED', closedAt = NULL WHERE id = ?`,
    [formId]
  );
  return getForm(formId);
}

export async function archiveForm(formId: string, actor: HiringActor) {
  await controlPool().query(
    `UPDATE hiring_form SET status = 'ARCHIVED', archivedAt = CURRENT_TIMESTAMP(3) WHERE id = ? AND deletedAt IS NULL`,
    [formId]
  );
  return getForm(formId);
}

export async function unarchiveForm(formId: string, actor: HiringActor) {
  await controlPool().query(
    `UPDATE hiring_form SET status = 'CLOSED', archivedAt = NULL WHERE id = ? AND deletedAt IS NULL`,
    [formId]
  );
  return getForm(formId);
}

export async function deleteForm(formId: string, actor: HiringActor) {
  await controlPool().query(
    `UPDATE hiring_form SET deletedAt = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [formId]
  );
}

export async function duplicateForm(formId: string, actor: HiringActor) {
  const form = await getForm(formId);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });

  const schema = form.draft?.schema ?? form.published?.schema ?? minimalFormSchema();
  const created = await createForm(
    {
      title: `${form.title} (Copy)`,
      jobTitle: form.jobTitle,
      jobDescription: form.jobDescription,
      employmentType: form.employmentType,
      experienceLevel: form.experienceLevel,
      qualification: form.qualification,
      salaryMin: form.salaryMin,
      salaryMax: form.salaryMax,
      currency: form.currency,
      openings: form.openings,
      locationIds: form.locationIds,
      allowOtherLocations: Boolean(form.allowOtherLocations),
      shiftDetails: form.shiftDetails,
      openAt: null,
      closeAt: null,
      folderId: form.folderId,
      settings: form.settings,
      schema,
    },
    actor
  );
  return created;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates() {
  const [rows]: any = await controlPool().query(
    `SELECT t.id, t.slug, t.name, t.description, t.category, t.isSystem, t.sortOrder, t.createdAt,
       (SELECT COUNT(*) FROM hiring_form f WHERE f.templateKey = t.slug AND f.deletedAt IS NULL) AS usageCount
     FROM hiring_template t
     WHERE t.deletedAt IS NULL
     ORDER BY t.isSystem DESC, t.sortOrder ASC, t.name ASC`
  );
  return rows;
}

export async function getTemplateBySlug(slug: string) {
  const [rows]: any = await controlPool().query(
    'SELECT * FROM hiring_template WHERE slug = ? AND deletedAt IS NULL LIMIT 1',
    [slug]
  );
  return rows[0] ?? null;
}

export async function getTemplate(id: string) {
  const [rows]: any = await controlPool().query(
    'SELECT * FROM hiring_template WHERE id = ? AND deletedAt IS NULL LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], schema: parseJson<HiringFormSchema>(rows[0].schema, minimalFormSchema()) };
}

export async function createTemplate(
  input: { name: string; description?: string; category?: string; schema: HiringFormSchema },
  actor: HiringActor
) {
  const schemaErrors = validateHiringFormSchema(input.schema);
  if (schemaErrors.length > 0) {
    throw Object.assign(new Error('Template schema is invalid'), { code: 'INVALID_SCHEMA', details: schemaErrors });
  }
  const id = newId('htpl');
  await controlPool().query(
    `INSERT INTO hiring_template (id, slug, name, description, category, isSystem, \`schema\`, createdById)
     VALUES (?, NULL, ?, ?, ?, 0, CAST(? AS JSON), ?)`,
    [id, input.name.trim(), input.description?.trim() || null, input.category || 'CUSTOM', JSON.stringify(input.schema), actor.id]
  );
  return getTemplate(id);
}

export async function saveFormAsTemplate(formId: string, input: { name: string; description?: string; category?: string }, actor: HiringActor) {
  const form = await getForm(formId);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });
  const schema = form.draft?.schema ?? form.published?.schema;
  if (!schema) throw Object.assign(new Error('Form has no schema to save'), { code: 'NO_SCHEMA' });
  return createTemplate({ ...input, schema }, actor);
}

export async function deleteTemplate(id: string) {
  const template = await getTemplate(id);
  if (!template) throw Object.assign(new Error('Template not found'), { code: 'NOT_FOUND' });
  if (template.isSystem) throw Object.assign(new Error('System templates cannot be deleted'), { code: 'SYSTEM_TEMPLATE' });
  await controlPool().query('UPDATE hiring_template SET deletedAt = CURRENT_TIMESTAMP(3) WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Public resolution
// ---------------------------------------------------------------------------

export type PublicFormResolution =
  | {
      ok: true;
      form: any;
      schema: HiringFormSchema;
      version: { id: string; version: number };
      locations: Array<{ id: string; code: string; name: string }>;
      settings: { consentText: string; requireCaptcha: boolean; companyName: string; primaryColor: string; privacyPolicyUrl: string };
    }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_PUBLISHED' | 'NOT_OPEN_YET' | 'CLOSED'; message: string };

export async function resolveFormByToken(publicToken: string): Promise<PublicFormResolution> {
  const [rows]: any = await controlPool().query(
    'SELECT * FROM hiring_form WHERE publicToken = ? AND deletedAt IS NULL LIMIT 1',
    [publicToken]
  );
  if (rows.length === 0) return { ok: false, code: 'NOT_FOUND', message: 'This application link is not valid.' };
  return resolveFormRow(mapFormRow(rows[0]));
}

export async function resolveFormById(formId: string): Promise<PublicFormResolution> {
  const [rows]: any = await controlPool().query(
    'SELECT * FROM hiring_form WHERE id = ? AND deletedAt IS NULL LIMIT 1',
    [formId]
  );
  if (rows.length === 0) return { ok: false, code: 'NOT_FOUND', message: 'This application link is not valid.' };
  return resolveFormRow(mapFormRow(rows[0]));
}

async function resolveFormRow(form: any): Promise<PublicFormResolution> {
  if (form.status === 'DRAFT' || form.status === 'ARCHIVED') {
    return { ok: false, code: 'NOT_FOUND', message: 'This application link is not valid.' };
  }
  if (form.status === 'CLOSED') {
    return { ok: false, code: 'CLOSED', message: 'Applications for this position are closed.' };
  }

  const now = Date.now();
  if (form.openAt && now < new Date(form.openAt).getTime()) {
    return { ok: false, code: 'NOT_OPEN_YET', message: `Applications open on ${new Date(form.openAt).toLocaleDateString('en-IN')}.` };
  }
  if (form.closeAt && now > new Date(form.closeAt).getTime()) {
    return { ok: false, code: 'CLOSED', message: 'Applications for this position are closed.' };
  }
  if (!form.currentVersionId) {
    return { ok: false, code: 'NOT_PUBLISHED', message: 'This application form is not ready yet.' };
  }

  const [versionRows]: any = await controlPool().query(
    'SELECT id, version, `schema` FROM hiring_form_version WHERE id = ?',
    [form.currentVersionId]
  );
  if (versionRows.length === 0) {
    return { ok: false, code: 'NOT_PUBLISHED', message: 'This application form is not ready yet.' };
  }

  const allowed = await loadLocationsByIds(form.locationIds);
  const picker = allowed
    .filter((l) => l.status === 'ACTIVE' && l.hiringEnabled)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) => ({ id: l.id, code: l.code, name: l.name }));

  const general = await getSettings('hiring.general');
  const branding = await getSettings('hiring.branding');

  return {
    ok: true,
    form: {
      id: form.id,
      publicToken: form.publicToken,
      title: form.title,
      jobTitle: form.jobTitle,
      jobDescription: form.jobDescription,
      employmentType: form.employmentType,
      experienceLevel: form.experienceLevel,
      qualification: form.qualification,
      salaryMin: form.salaryMin,
      salaryMax: form.salaryMax,
      currency: form.currency,
      openings: form.openings,
      shiftDetails: form.shiftDetails,
      allowOtherLocations: Boolean(form.allowOtherLocations),
      openAt: form.openAt,
      closeAt: form.closeAt,
    },
    schema: parseJson<HiringFormSchema>(versionRows[0].schema, minimalFormSchema()),
    version: { id: versionRows[0].id, version: Number(versionRows[0].version) },
    locations: picker,
    settings: {
      consentText: general.consentText,
      requireCaptcha: general.requireCaptcha,
      companyName: branding.companyName,
      primaryColor: branding.primaryColor,
      privacyPolicyUrl: branding.privacyPolicyUrl,
    },
  };
}

/** Full status + hiring flags for a set of location ids (public submissions). */
export async function getLocationHiringFlags(locationId: string) {
  const [rows]: any = await controlPool().query(
    'SELECT id, code, name, status, hiringEnabled FROM location WHERE id = ? LIMIT 1',
    [locationId]
  );
  return rows[0] ?? null;
}
