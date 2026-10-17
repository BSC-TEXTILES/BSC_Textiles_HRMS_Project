/**
 * Candidate Hiring — application & candidate service (shard DBs).
 *
 * Every candidate-facing write lands in the shard that owns the location:
 *   bsc_shard_<code> for each showroom, the control database for HQ.
 *
 * Public path:  validate → duplicate check → candidate upsert → application →
 * typed answers → timeline → link counter → outbox (notifications) → socket.
 * The shard transaction makes the candidate/application/answer/timeline block
 * atomic; link counters and notifications are deliberately outside it and are
 * driven by the hiring_outbox so a crash cannot lose them.
 *
 * HR paths: location scope is resolved BEFORE any query. A location-pinned
 * user can only ever touch their own shard; SUPER_ADMIN/ADMIN without a
 * requested location aggregate across active shards (scatter-gather with
 * per-shard failure isolation, same pattern as ShardRouter).
 */

import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { shardManager, shardRegistry } from '../../core/sharding/index.js';
import { socketIO } from '../../socket.js';
import {
  APPLICATION_STAGES,
  ApplicationStage,
  HiringFormSchema,
  HiringFileMeta,
  canTransitionStage,
  flattenFields,
  isApplicationStage,
  maskAadhaar,
  maskPan,
  summarizeSubmission,
  validateHiringSubmission,
} from '../../validation/hiringValidators.js';
import { enqueueHiringEvent } from './hiringOutbox.js';
import { getSettings } from './hiringSettings.js';
import { hashAadhaar, hashEmail, hashIp, hashPan, hashPhone, hashVisitor, encryptSensitive } from './hiringCrypto.js';
import { verifyUploadToken } from './hiringUploadService.js';
import { getLocationHiringFlags, resolveFormById, resolveFormByToken } from './hiringFormService.js';
import { getLinkByCode, recordLinkEvent } from './hiringLinkService.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class HiringError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
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

// ---------------------------------------------------------------------------
// Scope resolution (location isolation)
// ---------------------------------------------------------------------------

export interface HiringViewer {
  id: string;
  role: string;
  locationId?: string | null;
  fullName?: string | null;
}

export type HiringScope =
  | { mode: 'single'; locationId: string }
  | { mode: 'all' };

const ORG_WIDE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

export function resolveHiringScope(viewer: HiringViewer, requestedLocationId?: string | null): HiringScope {
  const orgWide = ORG_WIDE_ROLES.has(viewer.role);
  if (orgWide) {
    return requestedLocationId ? { mode: 'single', locationId: requestedLocationId } : { mode: 'all' };
  }
  // Location-pinned user: the pinned location always wins; asking for a
  // different one is an isolation violation, not a fallback.
  if (viewer.locationId) {
    if (requestedLocationId && requestedLocationId !== viewer.locationId) {
      throw new HiringError('FORBIDDEN_LOCATION', 'Your account is restricted to your own location.', 403);
    }
    return { mode: 'single', locationId: viewer.locationId };
  }
  return requestedLocationId ? { mode: 'single', locationId: requestedLocationId } : { mode: 'all' };
}

export interface HiringShardTarget {
  databaseId: string;
  databaseName: string;
  locationId: string | null;
  locationCode: string | null;
  pool: ReturnType<typeof shardManager.getPool>;
  error?: string;
}

async function resolveShardTargetByLocation(locationId: string): Promise<HiringShardTarget> {
  const shard = await shardRegistry.getShardByLocation(locationId);
  if (!shard) {
    throw new HiringError('NO_SHARD', 'This location has no hiring database yet. Run shard provisioning.', 409);
  }
  return {
    databaseId: shard.database_id,
    databaseName: shard.database_name,
    locationId: shard.location_id,
    locationCode: shard.location_code,
    pool: shardManager.getPool(shard.database_id),
  };
}

async function resolveAllShardTargets(): Promise<HiringShardTarget[]> {
  const shards = await shardRegistry.getAllShards();
  return shards
    .filter((s) => s.status === 'ACTIVE')
    .map((s) => ({
      databaseId: s.database_id,
      databaseName: s.database_name,
      locationId: s.location_id,
      locationCode: s.location_code,
      pool: shardManager.getPool(s.database_id),
    }));
}

async function resolveShardTargets(scope: HiringScope): Promise<HiringShardTarget[]> {
  if (scope.mode === 'single') return [await resolveShardTargetByLocation(scope.locationId)];
  return resolveAllShardTargets();
}

// ---------------------------------------------------------------------------
// Public submission
// ---------------------------------------------------------------------------

export interface PublicSubmissionInput {
  linkCode?: string | null;
  formToken?: string | null;
  locationId?: string | null;
  values: Record<string, unknown>;
  files?: Record<string, string>;
  consent?: boolean;
  captcha?: { id: string; answer: string } | null;
  sessionId?: string | null;
  source?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface PublicSubmissionResult {
  applicationId: string;
  candidateId: string;
  stage: ApplicationStage;
  appliedAt: string;
  locationId: string;
  locationCode: string | null;
  formId: string;
  referenceNumber: string;
}

interface ResolvedPublicTarget {
  form: any;
  schema: HiringFormSchema;
  versionId: string;
  versionNumber: number;
  locations: Array<{ id: string; code: string; name: string }>;
  settings: { consentText: string; requireCaptcha: boolean; companyName: string; primaryColor: string; privacyPolicyUrl: string };
  link: { id: string; code: string; label: string | null; locationId: string | null } | null;
  formToken: string;
}

async function resolvePublicTarget(input: PublicSubmissionInput): Promise<ResolvedPublicTarget> {
  if (input.linkCode) {
    const link = await getLinkByCode(input.linkCode);
    if (!link) throw new HiringError('LINK_NOT_FOUND', 'This application link is not valid.', 404);
    if (!link.enabled) throw new HiringError('LINK_DISABLED', 'This application link has been disabled.', 410);
    if (link.expiresAt && Date.now() > new Date(link.expiresAt).getTime()) {
      throw new HiringError('LINK_EXPIRED', 'This application link has expired.', 410);
    }
    if (!link.allowApplications) throw new HiringError('LINK_DISABLED', 'This link is not accepting applications right now.', 410);
    if (link.maxApplications && Number(link.submissions) >= Number(link.maxApplications)) {
      throw new HiringError('LINK_LIMIT_REACHED', 'This application link has reached its application limit.', 410);
    }

    const resolution = await resolveFormById(link.formId);
    if (!resolution.ok) {
      throw new HiringError(resolution.code, resolution.message, resolution.code === 'NOT_FOUND' ? 404 : 410);
    }
    return {
      form: resolution.form,
      schema: resolution.schema,
      versionId: resolution.version.id,
      versionNumber: resolution.version.version,
      locations: resolution.locations,
      settings: resolution.settings,
      link: { id: link.id, code: link.code, label: link.label, locationId: link.locationId },
      formToken: resolution.form.publicToken,
    };
  }

  if (input.formToken) {
    const resolution = await resolveFormByToken(input.formToken);
    if (!resolution.ok) {
      throw new HiringError(resolution.code, resolution.message, resolution.code === 'NOT_FOUND' ? 404 : 410);
    }
    return {
      form: resolution.form,
      schema: resolution.schema,
      versionId: resolution.version.id,
      versionNumber: resolution.version.version,
      locations: resolution.locations,
      settings: resolution.settings,
      link: null,
      formToken: resolution.form.publicToken,
    };
  }

  throw new HiringError('MISSING_TARGET', 'Provide either a linkCode or formToken.', 400);
}

async function resolveSubmissionLocation(target: ResolvedPublicTarget, requestedLocationId?: string | null) {
  const locationId = target.link?.locationId || requestedLocationId;
  if (!locationId) throw new HiringError('LOCATION_REQUIRED', 'Choose the location you are applying to.', 400);

  if (target.link?.locationId && requestedLocationId && requestedLocationId !== target.link.locationId) {
    throw new HiringError('LOCATION_MISMATCH', 'This link is only for the selected location.', 400);
  }

  const allowedIds = new Set(target.locations.map((l) => l.id));
  if (!allowedIds.has(locationId)) {
    if (!target.form.allowOtherLocations) {
      throw new HiringError('LOCATION_NOT_ALLOWED', 'This position is not open at the selected location.', 400);
    }
    const location = await getLocationHiringFlags(locationId);
    if (!location || location.status !== 'ACTIVE' || !location.hiringEnabled) {
      throw new HiringError('LOCATION_NOT_ALLOWED', 'This position is not open at the selected location.', 400);
    }
    return location;
  }

  const location = await getLocationHiringFlags(locationId);
  if (!location || location.status !== 'ACTIVE' || !location.hiringEnabled) {
    throw new HiringError('LOCATION_CLOSED', 'Hiring at this location is currently closed.', 400);
  }
  return location;
}

async function verifyCaptchaIfRequired(settings: { requireCaptcha: boolean }, input: PublicSubmissionInput) {
  if (!settings.requireCaptcha) return;
  if (!input.captcha?.id || !input.captcha?.answer) {
    throw new HiringError('CAPTCHA_REQUIRED', 'Please complete the captcha verification.', 400);
  }
  const { verifyCaptcha } = await import('../captchaService.js');
  const valid = await verifyCaptcha(input.captcha.id, input.captcha.answer);
  if (!valid) throw new HiringError('CAPTCHA_FAILED', 'Captcha verification failed. Please try again.', 400);
}

function collectFileMeta(
  schema: HiringFormSchema,
  fileTokens: Record<string, string> | undefined,
  formToken: string
): { files: Record<string, HiringFileMeta>; uploads: Record<string, ReturnType<typeof verifyUploadToken>> } {
  const files: Record<string, HiringFileMeta> = {};
  const uploads: Record<string, ReturnType<typeof verifyUploadToken>> = {};
  if (!fileTokens) return { files, uploads };
  for (const [fieldKey, token] of Object.entries(fileTokens)) {
    const payload = verifyUploadToken(token, formToken);
    if (!payload || payload.fieldKey !== fieldKey) {
      throw new HiringError('UPLOAD_TOKEN_INVALID', 'One of the uploaded files is no longer valid. Please upload again.', 400);
    }
    files[fieldKey] = { name: String(payload.fileName), mime: String(payload.mime), sizeBytes: Number(payload.sizeBytes) };
    uploads[fieldKey] = payload;
  }
  return { files, uploads };
}

async function findActiveDuplicate(pool: any, phoneDigits: string, formId: string, windowDays: number) {
  const [rows]: any = await pool.query(
    `SELECT a.id, a.appliedAt FROM application a
     JOIN candidate c ON c.id = a.candidateId
     WHERE c.phoneDigits = ? AND a.formId = ?
       AND a.deletedAt IS NULL
       AND a.stage NOT IN ('REJECTED','WITHDRAWN')
       AND a.appliedAt >= DATE_SUB(NOW(3), INTERVAL ? DAY)
     ORDER BY a.appliedAt DESC LIMIT 1`,
    [phoneDigits, formId, windowDays]
  );
  return rows[0] ?? null;
}

function referenceNumber(applicationId: string): string {
  return `APP-${applicationId.slice(-6).toUpperCase()}`;
}

export async function submitPublicApplication(input: PublicSubmissionInput): Promise<PublicSubmissionResult> {
  const target = await resolvePublicTarget(input);
  const settings = await getSettings('hiring.general');

  const location = await resolveSubmissionLocation(target, input.locationId);
  await verifyCaptchaIfRequired(target.settings, input);

  if (!input.consent) {
    throw new HiringError('CONSENT_REQUIRED', 'Please accept the data processing consent to submit.', 400);
  }

  const { files, uploads } = collectFileMeta(target.schema, input.files, target.formToken);
  const validation = validateHiringSubmission(target.schema, input.values ?? {}, files);
  if (!validation.valid) {
    throw new HiringError('VALIDATION_FAILED', 'Please correct the highlighted fields.', 400, validation.errors);
  }
  const values = validation.values;

  const flatFields = flattenFields(target.schema);
  const phoneField = flatFields.find((f) => f.type === 'PHONE');
  const emailField = flatFields.find((f) => f.type === 'EMAIL');
  const aadhaarField = flatFields.find((f) => f.type === 'AADHAAR');
  const panField = flatFields.find((f) => f.type === 'PAN');
  const photoField = flatFields.find((f) => f.type === 'PHOTO');
  const resumeField = flatFields.find((f) => f.type === 'FILE');

  const phoneDigits = phoneField ? String(values[phoneField.key] ?? '') : '';
  if (!phoneDigits) {
    throw new HiringError('VALIDATION_FAILED', 'Please correct the highlighted fields.', 400, { [phoneField?.key || 'phone']: 'Mobile number is required' });
  }
  const summary = summarizeSubmission(target.schema, values);
  const email = emailField ? (values[emailField.key] as string | undefined) ?? null : null;
  const fullName = summary.fullName || 'Candidate';

  const shard = await resolveShardTargetByLocation(location.id);

  const duplicate = await findActiveDuplicate(shard.pool, phoneDigits, target.form.id, settings.autoRejectDuplicateWindowDays);
  if (duplicate) {
    throw new HiringError(
      'DUPLICATE_APPLICATION',
      'You have already applied for this position recently. Our team will contact you.',
      409,
      { existingApplicationId: duplicate.id, appliedAt: duplicate.appliedAt }
    );
  }

  const visitorHash = hashVisitor(input.sessionId, input.ip, input.userAgent);
  const ipHash = hashIp(input.ip);
  const applicationId = newId('happ');
  const candidateId = newId('hcand');
  const now = new Date();

  const aadhaarDigits = aadhaarField ? String(values[aadhaarField.key] ?? '') : '';
  const pan = panField ? String(values[panField.key] ?? '') : '';

  let resolvedCandidateId = candidateId;

  await shard.pool.query('START TRANSACTION');
  try {
    const [candidateRows]: any = await shard.pool.query('SELECT id FROM candidate WHERE phoneDigits = ? LIMIT 1', [
      phoneDigits,
    ]);
    const existingCandidateId: string | null = candidateRows[0]?.id ?? null;
    resolvedCandidateId = existingCandidateId ?? candidateId;

    if (existingCandidateId) {
      await shard.pool.query(
        `UPDATE candidate SET
           fullName = IF(? <> '', ?, fullName),
           phone = ?,
           phoneHash = ?,
           email = COALESCE(?, email),
           emailNormalized = COALESCE(?, emailNormalized),
           city = COALESCE(?, city),
           aadhaarEncrypted = COALESCE(?, aadhaarEncrypted),
           aadhaarLast4 = COALESCE(?, aadhaarLast4),
           aadhaarHash = COALESCE(?, aadhaarHash),
           panEncrypted = COALESCE(?, panEncrypted),
           panLast4 = COALESCE(?, panLast4),
           panHash = COALESCE(?, panHash),
           photoKey = COALESCE(?, photoKey),
           resumeKey = COALESCE(?, resumeKey),
           resumeName = COALESCE(?, resumeName),
           source = COALESCE(?, source),
           applicationCount = applicationCount + 1,
           lastAppliedAt = ?
         WHERE id = ?`,
        [
          fullName,
          fullName,
          phoneDigits,
          hashPhone(phoneDigits),
          email,
          email,
          summary.city ?? null,
          aadhaarDigits ? encryptSensitive(aadhaarDigits) : null,
          aadhaarDigits ? aadhaarDigits.slice(-4) : null,
          aadhaarDigits ? hashAadhaar(aadhaarDigits) : null,
          pan ? encryptSensitive(pan) : null,
          pan ? pan.slice(-4) : null,
          pan ? hashPan(pan) : null,
          photoField && uploads[photoField.key] ? uploads[photoField.key]!.storageKey : null,
          resumeField && uploads[resumeField.key] ? uploads[resumeField.key]!.storageKey : null,
          resumeField && uploads[resumeField.key] ? uploads[resumeField.key]!.fileName : null,
          input.source ?? null,
          now,
          existingCandidateId,
        ]
      );
    } else {
      await shard.pool.query(
        `INSERT INTO candidate
           (id, fullName, phone, phoneDigits, phoneHash, email, emailNormalized, city,
            aadhaarEncrypted, aadhaarLast4, aadhaarHash, panEncrypted, panLast4, panHash,
            photoKey, resumeKey, resumeName, source, applicationCount, firstSeenAt, lastAppliedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          candidateId,
          fullName,
          phoneDigits,
          phoneDigits,
          hashPhone(phoneDigits),
          email,
          email,
          summary.city ?? null,
          aadhaarDigits ? encryptSensitive(aadhaarDigits) : null,
          aadhaarDigits ? aadhaarDigits.slice(-4) : null,
          aadhaarDigits ? hashAadhaar(aadhaarDigits) : null,
          pan ? encryptSensitive(pan) : null,
          pan ? pan.slice(-4) : null,
          pan ? hashPan(pan) : null,
          photoField && uploads[photoField.key] ? uploads[photoField.key]!.storageKey : null,
          resumeField && uploads[resumeField.key] ? uploads[resumeField.key]!.storageKey : null,
          resumeField && uploads[resumeField.key] ? uploads[resumeField.key]!.fileName : null,
          input.source ?? null,
          now,
          now,
        ]
      );
    }

    await shard.pool.query(
      `INSERT INTO application
         (id, candidateId, formId, formVersionId, formVersion, linkId, locationId, locationCode, jobTitle,
          stage, stageChangedAt, consentGiven, consentAt, consentTextVersion, source, visitorHash, ipHash,
          userAgent, summary, appliedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, 1, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
      [
        applicationId,
        resolvedCandidateId,
        target.form.id,
        target.versionId,
        target.versionNumber,
        target.link?.id ?? null,
        location.id,
        location.code,
        target.form.jobTitle || target.form.title,
        now,
        now,
        'v1',
        input.source ?? null,
        visitorHash,
        ipHash,
        input.userAgent ? String(input.userAgent).slice(0, 255) : null,
        JSON.stringify(summary),
        now,
      ]
    );

    for (const field of flatFields) {
      if (!(field.key in values)) continue;
      const raw = values[field.key];
      let valueText: string | null = null;
      let valueNumber: number | null = null;
      let valueDate: string | null = null;
      let valueBool: number | null = null;
      let valueJson: string | null = null;
      let fileKey: string | null = null;
      let fileName: string | null = null;
      let fileMime: string | null = null;
      let fileSize: number | null = null;

      if (field.type === 'FILE' || field.type === 'PHOTO') {
        const upload = uploads[field.key];
        if (!upload) continue;
        fileKey = upload.storageKey;
        fileName = upload.fileName;
        fileMime = upload.mime;
        fileSize = upload.sizeBytes;
      } else if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
        valueNumber = Number(raw);
      } else if (field.type === 'DATE') {
        valueDate = String(raw);
      } else if (field.type === 'CHECKBOX' || field.type === 'YES_NO') {
        valueBool = raw === true ? 1 : 0;
      } else if (field.type === 'MULTISELECT') {
        valueJson = JSON.stringify(raw);
        valueText = Array.isArray(raw) ? raw.join(', ') : null;
      } else if (field.type === 'AADHAAR') {
        valueText = maskAadhaar(raw);
      } else if (field.type === 'PAN') {
        valueText = maskPan(raw);
      } else {
        valueText = raw === null || raw === undefined ? null : String(raw).slice(0, 2000);
      }

      await shard.pool.query(
        `INSERT INTO application_answer
           (applicationId, fieldKey, fieldLabel, fieldType, valueText, valueNumber, valueDate, valueBool, valueJson,
            fileKey, fileName, fileMime, fileSize)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)`,
        [
          applicationId,
          field.key,
          field.label,
          field.type,
          valueText,
          valueNumber,
          valueDate,
          valueBool,
          valueJson,
          fileKey,
          fileName,
          fileMime,
          fileSize,
        ]
      );

      if (fileKey) {
        const docType = field.type === 'PHOTO' ? 'PHOTO' : 'RESUME';
        await shard.pool.query(
          `INSERT INTO application_document (id, applicationId, candidateId, docType, storageKey, fileName, mimeType, sizeBytes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId('hdoc'), applicationId, resolvedCandidateId, docType, fileKey, fileName, fileMime, fileSize]
        );
      }
    }

    await shard.pool.query(
      `INSERT INTO application_timeline (id, applicationId, type, toStage, title, actorName, createdAt)
       VALUES (?, ?, 'APPLIED', 'NEW', ?, ?, ?)`,
      [newId('htl'), applicationId, `Application received for ${target.form.jobTitle || target.form.title}`, fullName, now]
    );

    await shard.pool.query('COMMIT');
  } catch (err) {
    await shard.pool.query('ROLLBACK');
    throw err;
  }

  // Side effects outside the shard transaction (at-least-once via outbox).
  if (target.link) {
    await recordLinkEvent(target.form.id, 'SUBMIT', target.link.id, {
      sessionId: input.sessionId,
      visitorHash,
      source: input.source,
      applicationId,
      locationId: location.id,
    });
  }

  await enqueueHiringEvent('APPLICATION_SUBMITTED', {
    applicationId,
    candidateId: resolvedCandidateId,
    formId: target.form.id,
    formTitle: target.form.title,
    jobTitle: target.form.jobTitle || target.form.title,
    locationId: location.id,
    locationCode: location.code,
    candidateName: fullName,
    referenceNumber: referenceNumber(applicationId),
  });

  emitApplicationEvent('hiring:application:new', location, {
    applicationId,
    locationId: location.id,
    locationCode: location.code,
    formId: target.form.id,
    jobTitle: target.form.jobTitle || target.form.title,
    candidateName: fullName,
    stage: 'NEW',
    appliedAt: now.toISOString(),
  });

  return {
    applicationId,
    candidateId: resolvedCandidateId,
    stage: 'NEW',
    appliedAt: now.toISOString(),
    locationId: location.id,
    locationCode: location.code,
    formId: target.form.id,
    referenceNumber: referenceNumber(applicationId),
  };
}

// ---------------------------------------------------------------------------
// Realtime fan-out
// ---------------------------------------------------------------------------

async function hiringTeamRecipientIds(locationId: string): Promise<string[]> {
  try {
    const [rows]: any = await shardManager.getControlPool().query(
      'SELECT hiringTeamUserIds FROM location WHERE id = ? LIMIT 1',
      [locationId]
    );
    const ids = parseJson<string[]>(rows[0]?.hiringTeamUserIds, []);
    return ids.filter((id) => typeof id === 'string' && id);
  } catch {
    return [];
  }
}

export function emitApplicationEvent(
  event: string,
  location: { id: string; code?: string | null },
  payload: Record<string, unknown>
): void {
  try {
    socketIO.to(`location:${location.id}`).emit(event, payload);
    void hiringTeamRecipientIds(location.id).then((ids) => {
      for (const userId of ids) socketIO.to(`user:${userId}`).emit(event, payload);
    });
  } catch (err: any) {
    console.warn('[hiringApplications] socket emit failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// HR: listing & detail
// ---------------------------------------------------------------------------

export interface ApplicationListFilters {
  locationId?: string;
  formId?: string;
  stages?: string[];
  search?: string;
  starred?: boolean;
  rating?: number;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  duplicatesOnly?: boolean;
  sortBy?: 'appliedAt' | 'rating' | 'stage' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface BuiltQuery {
  where: string;
  params: any[];
  orderBy: string;
  limit: number;
  offset: number;
}

function buildApplicationQuery(filters: ApplicationListFilters, shardLimit: number): BuiltQuery {
  const conditions: string[] = ['a.deletedAt IS NULL'];
  const params: any[] = [];

  if (filters.formId) {
    conditions.push('a.formId = ?');
    params.push(filters.formId);
  }
  if (filters.stages && filters.stages.length > 0) {
    const valid = filters.stages.filter((s) => isApplicationStage(s));
    if (valid.length > 0) {
      conditions.push(`a.stage IN (${valid.map(() => '?').join(',')})`);
      params.push(...valid);
    }
  }
  if (filters.search) {
    conditions.push(
      `(c.fullName LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(a.summary, '$.positionApplied')) LIKE ? OR a.id LIKE ?)`
    );
    const like = `%${filters.search}%`;
    params.push(like, like, like, like, like);
  }
  if (filters.starred !== undefined) {
    conditions.push('a.starred = ?');
    params.push(filters.starred ? 1 : 0);
  }
  if (filters.rating !== undefined) {
    conditions.push('a.rating = ?');
    params.push(filters.rating);
  }
  if (filters.source) {
    conditions.push('a.source = ?');
    params.push(filters.source);
  }
  if (filters.dateFrom) {
    conditions.push('a.appliedAt >= ?');
    params.push(new Date(filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push('a.appliedAt <= ?');
    params.push(new Date(filters.dateTo));
  }
  if (filters.duplicatesOnly) {
    conditions.push('a.duplicateOfApplicationId IS NOT NULL');
  }

  const sortMap: Record<string, string> = {
    appliedAt: 'a.appliedAt',
    rating: 'a.rating',
    stage: 'a.stage',
    updatedAt: 'a.updatedAt',
  };
  const sortColumn = sortMap[filters.sortBy || 'appliedAt'] || 'a.appliedAt';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const offset = (page - 1) * limit;
  const effectiveLimit = shardLimit > 0 ? Math.min(shardLimit, page * limit) : limit;
  const effectiveOffset = shardLimit > 0 ? 0 : offset;

  return {
    where: conditions.join(' AND '),
    params,
    orderBy: `${sortColumn} ${sortOrder}, a.id DESC`,
    limit: effectiveLimit,
    offset: effectiveOffset,
  };
}

const APPLICATION_SELECT = `
  SELECT a.*, c.fullName, c.phone, c.email, c.city, c.resumeKey, c.photoKey,
         c.aadhaarLast4, c.panLast4,
         (SELECT COUNT(*) FROM application_note n WHERE n.applicationId = a.id AND n.deletedAt IS NULL) AS noteCount,
         (SELECT COUNT(*) FROM interview i WHERE i.applicationId = a.id) AS interviewCount
  FROM application a
  JOIN candidate c ON c.id = a.candidateId
`;

function mapApplicationRow(row: any, locationCode: string | null, databaseId: string) {
  return {
    id: row.id,
    candidateId: row.candidateId,
    formId: row.formId,
    formVersion: row.formVersion,
    linkId: row.linkId,
    locationId: row.locationId,
    locationCode: row.locationCode || locationCode,
    shard: databaseId,
    jobTitle: row.jobTitle,
    stage: row.stage,
    previousStage: row.previousStage,
    stageChangedAt: row.stageChangedAt,
    rejectionReason: row.rejectionReason,
    rating: row.rating,
    starred: Boolean(row.starred),
    expectedSalary: row.expectedSalary !== null && row.expectedSalary !== undefined ? Number(row.expectedSalary) : null,
    source: row.source,
    summary: parseJson<Record<string, unknown>>(row.summary, {}),
    appliedAt: row.appliedAt,
    updatedAt: row.updatedAt,
    candidate: {
      id: row.candidateId,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      city: row.city,
      photoKey: row.photoKey,
      resumeKey: row.resumeKey,
      hasAadhaar: Boolean(row.aadhaarLast4),
      hasPan: Boolean(row.panLast4),
    },
    noteCount: Number(row.noteCount || 0),
    interviewCount: Number(row.interviewCount || 0),
  };
}

export interface ApplicationListResult {
  applications: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  shardSummaries: Array<{ databaseId: string; locationCode: string | null; success: boolean; rowCount: number; latencyMs: number; error?: string; total?: number }>;
}

export async function listApplications(viewer: HiringViewer, filters: ApplicationListFilters): Promise<ApplicationListResult> {
  const scope = resolveHiringScope(viewer, filters.locationId);
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));

  const targets = await resolveShardTargets(scope);
  const scatter = scope.mode === 'all';

  let grandTotal = 0;
  const merged: any[] = [];
  const shardSummaries: ApplicationListResult['shardSummaries'] = [];

  await Promise.all(
    targets.map(async (target) => {
      const started = Date.now();
      try {
        const query = buildApplicationQuery(filters, scatter ? page * limit + 1 : 0);
        const [countRows]: any = await target.pool.query(
          `SELECT COUNT(*) AS count FROM application a JOIN candidate c ON c.id = a.candidateId WHERE ${query.where}`,
          query.params
        );
        const [rows]: any = await target.pool.query(
          `${APPLICATION_SELECT} WHERE ${query.where} ORDER BY ${query.orderBy} LIMIT ? OFFSET ?`,
          [...query.params, query.limit, query.offset]
        );
        const total = Number(countRows[0]?.count || 0);
        grandTotal += total;
        merged.push(...rows.map((r: any) => mapApplicationRow(r, target.locationCode, target.databaseId)));
        shardSummaries.push({
          databaseId: target.databaseId,
          locationCode: target.locationCode,
          success: true,
          rowCount: rows.length,
          latencyMs: Date.now() - started,
          total,
        });
      } catch (err: any) {
        console.error(`[hiringApplications] list failed on shard ${target.databaseId}:`, err.message);
        shardSummaries.push({
          databaseId: target.databaseId,
          locationCode: target.locationCode,
          success: false,
          rowCount: 0,
          latencyMs: Date.now() - started,
          error: err.message,
        });
      }
    })
  );

  const sortBy = filters.sortBy || 'appliedAt';
  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  merged.sort((a, b) => {
    const av = a[sortBy] ?? '';
    const bv = b[sortBy] ?? '';
    if (av === bv) return 0;
    return av > bv ? direction : -direction;
  });

  const applications = scatter ? merged.slice((page - 1) * limit, page * limit) : merged;

  return {
    applications,
    total: grandTotal,
    page,
    limit,
    totalPages: Math.ceil(grandTotal / limit) || 1,
    shardSummaries,
  };
}

async function locateApplication(
  scope: HiringScope,
  applicationId: string,
  explicitShard?: string | null
): Promise<{ target: HiringShardTarget; row: any }> {
  const targets = explicitShard
    ? (await resolveAllShardTargets()).filter((t) => t.databaseId === explicitShard)
    : await resolveShardTargets(scope);

  for (const target of targets) {
    try {
      const [rows]: any = await target.pool.query(
        `${APPLICATION_SELECT} WHERE a.id = ? LIMIT 1`,
        [applicationId]
      );
      if (rows.length > 0) return { target, row: rows[0] };
    } catch (err: any) {
      console.warn(`[hiringApplications] locate failed on ${target.databaseId}:`, err.message);
    }
  }
  throw new HiringError('NOT_FOUND', 'Application not found.', 404);
}

export async function getApplicationDetail(
  viewer: HiringViewer,
  applicationId: string,
  options: { locationId?: string; shard?: string } = {}
) {
  const scope = resolveHiringScope(viewer, options.locationId);
  const { target, row } = await locateApplication(scope, applicationId, options.shard);

  if (scope.mode === 'single' && row.locationId !== scope.locationId) {
    throw new HiringError('FORBIDDEN_LOCATION', 'Application is outside your location.', 403);
  }

  const [candidateRows]: any = await target.pool.query('SELECT * FROM candidate WHERE id = ? LIMIT 1', [row.candidateId]);
  const [answers]: any = await target.pool.query(
    'SELECT fieldKey, fieldLabel, fieldType, valueText, valueNumber, valueDate, valueBool, valueJson, fileKey, fileName, fileMime, fileSize FROM application_answer WHERE applicationId = ? ORDER BY id ASC',
    [applicationId]
  );
  const [notes]: any = await target.pool.query(
    'SELECT * FROM application_note WHERE applicationId = ? AND deletedAt IS NULL ORDER BY createdAt DESC',
    [applicationId]
  );
  const [timeline]: any = await target.pool.query(
    'SELECT * FROM application_timeline WHERE applicationId = ? ORDER BY createdAt DESC LIMIT 200',
    [applicationId]
  );
  const [interviews]: any = await target.pool.query(
    'SELECT * FROM interview WHERE applicationId = ? ORDER BY scheduledAt DESC',
    [applicationId]
  );
  const [documents]: any = await target.pool.query(
    'SELECT id, docType, storageKey, fileName, mimeType, sizeBytes, verified, createdAt FROM application_document WHERE applicationId = ? ORDER BY createdAt DESC',
    [applicationId]
  );

  const candidate = candidateRows[0];
  const candidateOut = candidate
    ? {
        id: candidate.id,
        fullName: candidate.fullName,
        phone: candidate.phone,
        email: candidate.email,
        dob: candidate.dob,
        gender: candidate.gender,
        city: candidate.city,
        state: candidate.state,
        pincode: candidate.pincode,
        addressLine1: candidate.addressLine1,
        addressLine2: candidate.addressLine2,
        source: candidate.source,
        applicationCount: Number(candidate.applicationCount || 0),
        firstSeenAt: candidate.firstSeenAt,
        lastAppliedAt: candidate.lastAppliedAt,
        photoKey: candidate.photoKey,
        resumeKey: candidate.resumeKey,
        resumeName: candidate.resumeName,
        aadhaarMasked: candidate.aadhaarLast4 ? `XXXX XXXX ${candidate.aadhaarLast4}` : null,
        panMasked: candidate.panLast4 ? `XXXXX${String(candidate.panLast4).padStart(4, 'X')}` : null,
        hasAadhaar: Boolean(candidate.aadhaarEncrypted),
        hasPan: Boolean(candidate.panEncrypted),
      }
    : null;

  const application = mapApplicationRow(row, target.locationCode, target.databaseId);

  return {
    application,
    candidate: candidateOut,
    answers: answers.map((a: any) => ({
      ...a,
      valueJson: parseJson(a.valueJson, null),
      valueBool: a.valueBool === null || a.valueBool === undefined ? null : Boolean(a.valueBool),
      valueNumber: a.valueNumber !== null && a.valueNumber !== undefined ? Number(a.valueNumber) : null,
    })),
    notes,
    timeline: timeline.map((t: any) => ({ ...t, metadata: parseJson(t.metadata, null) })),
    interviews: interviews.map(mapInterviewRow),
    documents,
    shard: { databaseId: target.databaseId, locationCode: target.locationCode, pool: undefined },
  };
}

// ---------------------------------------------------------------------------
// HR: pipeline mutations
// ---------------------------------------------------------------------------

async function requireApplicationInScope(
  viewer: HiringViewer,
  applicationId: string,
  options: { locationId?: string; shard?: string }
) {
  const scope = resolveHiringScope(viewer, options.locationId);
  const { target, row } = await locateApplication(scope, applicationId, options.shard);
  return { scope, target, row };
}

async function addTimelineEntry(
  pool: any,
  applicationId: string,
  entry: {
    type: string;
    fromStage?: string | null;
    toStage?: string | null;
    title?: string | null;
    body?: string | null;
    metadata?: Record<string, unknown> | null;
    actor: HiringViewer;
  }
) {
  await pool.query(
    `INSERT INTO application_timeline (id, applicationId, type, fromStage, toStage, title, body, metadata, actorId, actorName)
     VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
    [
      newId('htl'),
      applicationId,
      entry.type,
      entry.fromStage ?? null,
      entry.toStage ?? null,
      entry.title ?? null,
      entry.body ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.actor.id,
      entry.actor.fullName ?? null,
    ]
  );
}

export async function updateApplicationStage(
  viewer: HiringViewer,
  applicationId: string,
  input: { toStage: string; note?: string; rejectionReason?: string; locationId?: string; shard?: string }
) {
  if (!isApplicationStage(input.toStage)) {
    throw new HiringError('INVALID_STAGE', `Unknown stage "${input.toStage}".`, 400);
  }
  const { target, row } = await requireApplicationInScope(viewer, applicationId, input);

  if (!canTransitionStage(row.stage, input.toStage)) {
    throw new HiringError(
      'INVALID_TRANSITION',
      `Cannot move an application from ${row.stage} to ${input.toStage}.`,
      409
    );
  }

  await target.pool.query(
    `UPDATE application SET stage = ?, previousStage = ?, stageChangedAt = CURRENT_TIMESTAMP(3), rejectionReason = ?
     WHERE id = ?`,
    [input.toStage, row.stage, input.toStage === 'REJECTED' ? input.rejectionReason || null : null, applicationId]
  );

  await addTimelineEntry(target.pool, applicationId, {
    type: 'STAGE_CHANGED',
    fromStage: row.stage,
    toStage: input.toStage,
    title: `Stage changed from ${row.stage.replace(/_/g, ' ')} to ${input.toStage.replace(/_/g, ' ')}`,
    actor: viewer,
  });

  if (input.note && input.note.trim()) {
    const noteId = newId('hnote');
    await target.pool.query(
      `INSERT INTO application_note (id, applicationId, authorId, authorName, body) VALUES (?, ?, ?, ?, ?)`,
      [noteId, applicationId, viewer.id, viewer.fullName ?? null, input.note.trim()]
    );
    await addTimelineEntry(target.pool, applicationId, {
      type: 'NOTE_ADDED',
      title: 'Note added',
      body: input.note.trim().slice(0, 500),
      actor: viewer,
    });
  }

  emitApplicationEvent('hiring:application:stage', { id: row.locationId, code: row.locationCode }, {
    applicationId,
    fromStage: row.stage,
    toStage: input.toStage,
    locationId: row.locationId,
    actorId: viewer.id,
  });

  await enqueueHiringEvent('APPLICATION_STAGE_CHANGED', {
    applicationId,
    formId: row.formId,
    locationId: row.locationId,
    fromStage: row.stage,
    toStage: input.toStage,
    actorId: viewer.id,
    actorName: viewer.fullName ?? null,
    candidateName: row.fullName,
    jobTitle: row.jobTitle,
  });

  return getApplicationDetail(viewer, applicationId, { locationId: row.locationId, shard: target.databaseId });
}

export async function updateApplicationDetails(
  viewer: HiringViewer,
  applicationId: string,
  patch: { rating?: number | null; starred?: boolean; expectedSalary?: number | null; availableFrom?: string | null },
  options: { locationId?: string; shard?: string } = {}
) {
  const { target, row } = await requireApplicationInScope(viewer, applicationId, options);

  if (patch.rating !== undefined && patch.rating !== null && (patch.rating < 1 || patch.rating > 5)) {
    throw new HiringError('INVALID_RATING', 'Rating must be between 1 and 5.', 400);
  }

  await target.pool.query(
    `UPDATE application SET
       rating = CASE WHEN ? THEN ? ELSE rating END,
       starred = COALESCE(?, starred),
       expectedSalary = CASE WHEN ? THEN ? ELSE expectedSalary END,
       availableFrom = CASE WHEN ? THEN ? ELSE availableFrom END
     WHERE id = ?`,
    [
      patch.rating !== undefined ? 1 : 0,
      patch.rating ?? null,
      patch.starred === undefined ? null : patch.starred ? 1 : 0,
      patch.expectedSalary !== undefined ? 1 : 0,
      patch.expectedSalary ?? null,
      patch.availableFrom !== undefined ? 1 : 0,
      patch.availableFrom ? new Date(patch.availableFrom) : null,
      applicationId,
    ]
  );

  if (patch.rating !== undefined) {
    await addTimelineEntry(target.pool, applicationId, {
      type: 'RATING_CHANGED',
      title: patch.rating ? `Rated ${patch.rating}/5` : 'Rating cleared',
      actor: viewer,
    });
  }
  if (patch.starred !== undefined) {
    await addTimelineEntry(target.pool, applicationId, {
      type: 'STAR_CHANGED',
      title: patch.starred ? 'Marked as starred' : 'Star removed',
      actor: viewer,
    });
  }

  return getApplicationDetail(viewer, applicationId, { locationId: row.locationId, shard: target.databaseId });
}

export async function addApplicationNote(viewer: HiringViewer, applicationId: string, body: string, options: { locationId?: string; shard?: string } = {}) {
  if (!body || !body.trim()) throw new HiringError('EMPTY_NOTE', 'Note cannot be empty.', 400);
  if (body.length > 4000) throw new HiringError('NOTE_TOO_LONG', 'Note is too long.', 400);

  const { target, row } = await requireApplicationInScope(viewer, applicationId, options);
  const noteId = newId('hnote');
  await target.pool.query(
    `INSERT INTO application_note (id, applicationId, authorId, authorName, body) VALUES (?, ?, ?, ?, ?)`,
    [noteId, applicationId, viewer.id, viewer.fullName ?? null, body.trim()]
  );
  await addTimelineEntry(target.pool, applicationId, {
    type: 'NOTE_ADDED',
    title: 'Note added',
    actor: viewer,
  });

  emitApplicationEvent('hiring:application:note', { id: row.locationId, code: row.locationCode }, {
    applicationId,
    noteId,
    locationId: row.locationId,
  });

  const [rows]: any = await target.pool.query('SELECT * FROM application_note WHERE id = ?', [noteId]);
  return rows[0];
}

export async function deleteApplicationNote(viewer: HiringViewer, applicationId: string, noteId: string, options: { locationId?: string; shard?: string } = {}) {
  const { target } = await requireApplicationInScope(viewer, applicationId, options);
  await target.pool.query(
    'UPDATE application_note SET deletedAt = CURRENT_TIMESTAMP(3) WHERE id = ? AND applicationId = ?',
    [noteId, applicationId]
  );
}

export async function deleteApplication(viewer: HiringViewer, applicationId: string, options: { locationId?: string; shard?: string } = {}) {
  const { target } = await requireApplicationInScope(viewer, applicationId, options);
  await target.pool.query('UPDATE application SET deletedAt = CURRENT_TIMESTAMP(3) WHERE id = ?', [applicationId]);
  await addTimelineEntry(target.pool, applicationId, {
    type: 'STATUS_CHANGED',
    title: 'Application removed from active pipeline',
    actor: viewer,
  });
}

export async function bulkUpdateApplicationStage(
  viewer: HiringViewer,
  applicationIds: string[],
  toStage: string,
  options: { locationId?: string; shard?: string; note?: string } = {}
) {
  const results: Array<{ applicationId: string; ok: boolean; error?: string }> = [];
  for (const id of applicationIds.slice(0, 200)) {
    try {
      await updateApplicationStage(viewer, id, { toStage, locationId: options.locationId, shard: options.shard, note: options.note });
      results.push({ applicationId: id, ok: true });
    } catch (err: any) {
      results.push({ applicationId: id, ok: false, error: err.message });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// HR: interviews
// ---------------------------------------------------------------------------

function mapInterviewRow(row: any) {
  return {
    ...row,
    interviewerIds: parseJson<string[]>(row.interviewerIds, []),
    interviewerNames: parseJson<string[]>(row.interviewerNames, []),
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
  };
}

export interface InterviewInput {
  round?: string;
  scheduledAt: string;
  durationMins?: number;
  mode?: 'IN_PERSON' | 'PHONE' | 'VIDEO';
  venue?: string | null;
  meetingLink?: string | null;
  interviewerIds?: string[];
  interviewerNames?: string[];
}

export async function scheduleInterview(
  viewer: HiringViewer,
  applicationId: string,
  input: InterviewInput,
  options: { locationId?: string; shard?: string } = {}
) {
  const { target, row } = await requireApplicationInScope(viewer, applicationId, options);

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) throw new HiringError('INVALID_DATE', 'Interview date is invalid.', 400);

  const interviewId = newId('hint');
  await target.pool.query(
    `INSERT INTO interview
       (id, applicationId, round, scheduledAt, durationMins, mode, locationId, venue, meetingLink, interviewerIds, interviewerNames, createdById)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
    [
      interviewId,
      applicationId,
      input.round || 'INTERVIEW_1',
      scheduledAt,
      input.durationMins ?? 30,
      input.mode || 'IN_PERSON',
      row.locationId,
      input.venue || null,
      input.meetingLink || null,
      JSON.stringify(input.interviewerIds ?? []),
      JSON.stringify(input.interviewerNames ?? []),
      viewer.id,
    ]
  );

  await addTimelineEntry(target.pool, applicationId, {
    type: 'INTERVIEW_SCHEDULED',
    title: `Interview scheduled for ${scheduledAt.toISOString().slice(0, 16).replace('T', ' ')}`,
    metadata: { interviewId, mode: input.mode || 'IN_PERSON', round: input.round || 'INTERVIEW_1' },
    actor: viewer,
  });

  if (canTransitionStage(row.stage, 'INTERVIEW_SCHEDULED')) {
    await target.pool.query(
      `UPDATE application SET stage = 'INTERVIEW_SCHEDULED', previousStage = ?, stageChangedAt = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [row.stage, applicationId]
    );
  }

  emitApplicationEvent('hiring:application:interview', { id: row.locationId, code: row.locationCode }, {
    applicationId,
    interviewId,
    scheduledAt: scheduledAt.toISOString(),
    locationId: row.locationId,
  });

  const [rows]: any = await target.pool.query('SELECT * FROM interview WHERE id = ?', [interviewId]);
  return mapInterviewRow(rows[0]);
}

export async function updateInterview(
  viewer: HiringViewer,
  applicationId: string,
  interviewId: string,
  patch: Partial<InterviewInput> & {
    status?: 'SCHEDULED' | 'RESCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    feedback?: string | null;
    rating?: number | null;
    recommendation?: 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO' | 'STRONG_NO' | null;
  },
  options: { locationId?: string; shard?: string } = {}
) {
  const { target, row } = await requireApplicationInScope(viewer, applicationId, options);

  const [interviewRows]: any = await target.pool.query(
    'SELECT * FROM interview WHERE id = ? AND applicationId = ? LIMIT 1',
    [interviewId, applicationId]
  );
  if (interviewRows.length === 0) throw new HiringError('NOT_FOUND', 'Interview not found.', 404);
  const interview = interviewRows[0];

  const scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
  if (patch.scheduledAt && Number.isNaN(scheduledAt!.getTime())) {
    throw new HiringError('INVALID_DATE', 'Interview date is invalid.', 400);
  }
  if (patch.rating !== undefined && patch.rating !== null && (patch.rating < 1 || patch.rating > 5)) {
    throw new HiringError('INVALID_RATING', 'Rating must be between 1 and 5.', 400);
  }

  await target.pool.query(
    `UPDATE interview SET
       round = COALESCE(?, round),
       scheduledAt = COALESCE(?, scheduledAt),
       durationMins = COALESCE(?, durationMins),
       mode = COALESCE(?, mode),
       venue = ?,
       meetingLink = ?,
       interviewerIds = COALESCE(CAST(? AS JSON), interviewerIds),
       interviewerNames = COALESCE(CAST(? AS JSON), interviewerNames),
       status = COALESCE(?, status),
       feedback = ?,
       rating = CASE WHEN ? THEN ? ELSE rating END,
       recommendation = CASE WHEN ? THEN ? ELSE recommendation END,
       updatedById = ?
     WHERE id = ?`,
    [
      patch.round || null,
      scheduledAt,
      patch.durationMins ?? null,
      patch.mode || null,
      patch.venue === undefined ? interview.venue : patch.venue,
      patch.meetingLink === undefined ? interview.meetingLink : patch.meetingLink,
      patch.interviewerIds ? JSON.stringify(patch.interviewerIds) : null,
      patch.interviewerNames ? JSON.stringify(patch.interviewerNames) : null,
      patch.status || null,
      patch.feedback === undefined ? interview.feedback : patch.feedback,
      patch.rating !== undefined ? 1 : 0,
      patch.rating ?? null,
      patch.recommendation !== undefined ? 1 : 0,
      patch.recommendation ?? null,
      viewer.id,
      interviewId,
    ]
  );

  if (patch.status === 'RESCHEDULED' || (patch.scheduledAt && !patch.status)) {
    await addTimelineEntry(target.pool, applicationId, {
      type: 'INTERVIEW_RESCHEDULED',
      title: 'Interview rescheduled',
      metadata: { interviewId, scheduledAt: (scheduledAt ?? new Date(interview.scheduledAt)).toISOString() },
      actor: viewer,
    });
  }
  if (patch.status === 'CANCELLED') {
    await addTimelineEntry(target.pool, applicationId, { type: 'INTERVIEW_CANCELLED', title: 'Interview cancelled', actor: viewer });
  }
  if (patch.status === 'COMPLETED') {
    await addTimelineEntry(target.pool, applicationId, {
      type: 'INTERVIEW_COMPLETED',
      title: 'Interview completed',
      metadata: { interviewId, rating: patch.rating ?? interview.rating, recommendation: patch.recommendation ?? interview.recommendation },
      actor: viewer,
    });
    if (patch.rating !== undefined && patch.rating !== null) {
      await target.pool.query('UPDATE application SET rating = ? WHERE id = ?', [patch.rating, applicationId]);
    }
    if (canTransitionStage(row.stage, 'INTERVIEWED')) {
      await target.pool.query(
        `UPDATE application SET stage = 'INTERVIEWED', previousStage = ?, stageChangedAt = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [row.stage, applicationId]
      );
    }
  }

  const [rows]: any = await target.pool.query('SELECT * FROM interview WHERE id = ?', [interviewId]);
  return mapInterviewRow(rows[0]);
}

export async function listUpcomingInterviews(viewer: HiringViewer, options: { locationId?: string; days?: number } = {}) {
  const scope = resolveHiringScope(viewer, options.locationId);
  const days = Math.min(60, Math.max(1, options.days || 7));
  const targets = await resolveShardTargets(scope);
  const results: any[] = [];

  await Promise.all(
    targets.map(async (target) => {
      try {
        const [rows]: any = await target.pool.query(
          `SELECT i.*, a.jobTitle, a.stage, c.fullName AS candidateName, c.phone AS candidatePhone
           FROM interview i
           JOIN application a ON a.id = i.applicationId
           JOIN candidate c ON c.id = a.candidateId
           WHERE i.status IN ('SCHEDULED','RESCHEDULED')
             AND i.scheduledAt >= NOW()
             AND i.scheduledAt <= DATE_ADD(NOW(), INTERVAL ? DAY)
             AND a.deletedAt IS NULL
           ORDER BY i.scheduledAt ASC
           LIMIT 100`,
          [days]
        );
        results.push(...rows.map((r: any) => ({ ...mapInterviewRow(r), locationCode: target.locationCode, shard: target.databaseId })));
      } catch (err: any) {
        console.warn(`[hiringApplications] interviews failed on ${target.databaseId}:`, err.message);
      }
    })
  );

  results.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return results;
}

// ---------------------------------------------------------------------------
// HR: dashboard
// ---------------------------------------------------------------------------

export interface HiringDashboard {
  scope: HiringScope;
  totals: {
    applications: number;
    newThisWeek: number;
    inPipeline: number;
    hired: number;
    rejected: number;
    starred: number;
    averageRating: number | null;
    averageTimeToHireDays: number | null;
  };
  stageCounts: Array<{ stage: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byLocation: Array<{ locationId: string; locationCode: string | null; count: number; hired: number }>;
  funnel: { views: number; starts: number; submissions: number; conversionRate: number };
  forms: { published: number; totalOpenings: number };
  upcomingInterviews: Array<{ date: string; count: number }>;
  shardSummaries: ApplicationListResult['shardSummaries'];
}

export async function getHiringDashboard(viewer: HiringViewer, options: { locationId?: string; days?: number } = {}): Promise<HiringDashboard> {
  const scope = resolveHiringScope(viewer, options.locationId);
  const days = Math.min(180, Math.max(7, options.days || 30));
  const targets = await resolveShardTargets(scope);

  const totals = {
    applications: 0,
    newThisWeek: 0,
    inPipeline: 0,
    hired: 0,
    rejected: 0,
    starred: 0,
    averageRating: null as number | null,
    averageTimeToHireDays: null as number | null,
  };
  const stageCounts = new Map<string, number>();
  const byDay = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byLocation: HiringDashboard['byLocation'] = [];
  const shardSummaries: ApplicationListResult['shardSummaries'] = [];

  await Promise.all(
    targets.map(async (target) => {
      const started = Date.now();
      try {
        const params: any[] = [];
        let where = 'a.deletedAt IS NULL';
        if (options.locationId && scope.mode === 'single') {
          where += ' AND a.locationId = ?';
          params.push(options.locationId);
        }

        const [stageRows]: any = await target.pool.query(
          `SELECT a.stage, COUNT(*) AS count FROM application a WHERE ${where} GROUP BY a.stage`,
          params
        );
        const [totalsRows]: any = await target.pool.query(
          `SELECT
             COUNT(*) AS applications,
             SUM(a.appliedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS newThisWeek,
             SUM(a.stage = 'HIRED') AS hired,
             SUM(a.stage = 'REJECTED') AS rejected,
             SUM(a.starred = 1) AS starred,
             AVG(a.rating) AS averageRating,
             AVG(CASE WHEN a.stage = 'HIRED' THEN DATEDIFF(a.stageChangedAt, a.appliedAt) END) AS avgTimeToHire
           FROM application a WHERE ${where}`,
          params
        );
        const [dayRows]: any = await target.pool.query(
          `SELECT DATE(a.appliedAt) AS day, COUNT(*) AS count FROM application a
           WHERE ${where} AND a.appliedAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
           GROUP BY DATE(a.appliedAt) ORDER BY day ASC`,
          [...params, days]
        );
        const [sourceRows]: any = await target.pool.query(
          `SELECT COALESCE(a.source, 'DIRECT') AS source, COUNT(*) AS count FROM application a
           WHERE ${where} GROUP BY COALESCE(a.source, 'DIRECT') ORDER BY count DESC LIMIT 20`,
          params
        );

        for (const row of stageRows) stageCounts.set(row.stage, (stageCounts.get(row.stage) || 0) + Number(row.count));
        for (const row of dayRows) {
          const day = typeof row.day === 'string' ? row.day : new Date(row.day).toISOString().slice(0, 10);
          byDay.set(day, (byDay.get(day) || 0) + Number(row.count));
        }
        for (const row of sourceRows) bySource.set(row.source, (bySource.get(row.source) || 0) + Number(row.count));

        const t = totalsRows[0] || {};
        totals.applications += Number(t.applications || 0);
        totals.newThisWeek += Number(t.newThisWeek || 0);
        totals.hired += Number(t.hired || 0);
        totals.rejected += Number(t.rejected || 0);
        totals.starred += Number(t.starred || 0);
        if (t.averageRating !== null && t.averageRating !== undefined) {
          const previousWeight = totals.applications - Number(t.applications || 0);
          const combined =
            ((totals.averageRating ?? 0) * previousWeight + Number(t.averageRating) * Number(t.applications || 0)) /
            Math.max(1, previousWeight + Number(t.applications || 0));
          totals.averageRating = Math.round(combined * 100) / 100;
        }
        if (t.avgTimeToHire !== null && t.avgTimeToHire !== undefined && Number(t.hired || 0) > 0) {
          const prevHired = totals.hired - Number(t.hired || 0);
          const combined =
            ((totals.averageTimeToHireDays ?? 0) * prevHired + Number(t.avgTimeToHire) * Number(t.hired || 0)) /
            Math.max(1, prevHired + Number(t.hired || 0));
          totals.averageTimeToHireDays = Math.round(combined * 10) / 10;
        }

        // inPipeline = active stages sum for this shard
        const pipelineStages = APPLICATION_STAGES.filter((s) => !['HIRED', 'REJECTED', 'WITHDRAWN'].includes(s));
        const [pipelineRows]: any = await target.pool.query(
          `SELECT COUNT(*) AS count FROM application a WHERE ${where} AND a.stage IN (${pipelineStages.map(() => '?').join(',')})`,
          [...params, ...pipelineStages]
        );
        totals.inPipeline += Number(pipelineRows[0]?.count || 0);

        if (target.locationId) {
          byLocation.push({
            locationId: target.locationId,
            locationCode: target.locationCode,
            count: Number(t.applications || 0),
            hired: Number(t.hired || 0),
          });
        }

        shardSummaries.push({
          databaseId: target.databaseId,
          locationCode: target.locationCode,
          success: true,
          rowCount: Number(t.applications || 0),
          latencyMs: Date.now() - started,
        });
      } catch (err: any) {
        console.error(`[hiringDashboard] failed on shard ${target.databaseId}:`, err.message);
        shardSummaries.push({
          databaseId: target.databaseId,
          locationCode: target.locationCode,
          success: false,
          rowCount: 0,
          latencyMs: Date.now() - started,
          error: err.message,
        });
      }
    })
  );

  // Control-side data: form inventory + funnel.
  const control = shardManager.getControlPool();
  const [formRows]: any = await control.query(
    `SELECT COUNT(*) AS published, COALESCE(SUM(openings), 0) AS totalOpenings FROM hiring_form
     WHERE status = 'PUBLISHED' AND deletedAt IS NULL`
  );
  const [funnelRows]: any = await control.query(
    `SELECT
       SUM(eventType = 'VIEW') AS views,
       SUM(eventType = 'START') AS starts,
       SUM(eventType = 'SUBMIT') AS submissions
     FROM hiring_link_event WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [days]
  );
  const funnel = {
    views: Number(funnelRows[0]?.views || 0),
    starts: Number(funnelRows[0]?.starts || 0),
    submissions: Number(funnelRows[0]?.submissions || 0),
    conversionRate: 0,
  };
  funnel.conversionRate = funnel.views > 0 ? Math.round((funnel.submissions / funnel.views) * 1000) / 10 : 0;

  const upcoming = await listUpcomingInterviews(viewer, { locationId: options.locationId, days: 7 });
  const upcomingByDate = new Map<string, number>();
  for (const interview of upcoming) {
    const day = new Date(interview.scheduledAt).toISOString().slice(0, 10);
    upcomingByDate.set(day, (upcomingByDate.get(day) || 0) + 1);
  }

  return {
    scope,
    totals,
    stageCounts: [...stageCounts.entries()].map(([stage, count]) => ({ stage, count })),
    byDay: [...byDay.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => (a.day > b.day ? 1 : -1)),
    bySource: [...bySource.entries()].map(([source, count]) => ({ source, count })),
    byLocation: byLocation.sort((a, b) => b.count - a.count),
    funnel,
    forms: { published: Number(formRows[0]?.published || 0), totalOpenings: Number(formRows[0]?.totalOpenings || 0) },
    upcomingInterviews: [...upcomingByDate.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => (a.date > b.date ? 1 : -1)),
    shardSummaries,
  };
}

// ---------------------------------------------------------------------------
// HR: export
// ---------------------------------------------------------------------------

const EXPORT_COLUMNS: Array<{ header: string; get: (app: any) => string | number | null }> = [
  { header: 'Reference', get: (a) => a.id },
  { header: 'Name', get: (a) => a.candidate.fullName },
  { header: 'Phone', get: (a) => a.candidate.phone },
  { header: 'Email', get: (a) => a.candidate.email },
  { header: 'City', get: (a) => a.candidate.city },
  { header: 'Position', get: (a) => a.jobTitle },
  { header: 'Stage', get: (a) => a.stage },
  { header: 'Rating', get: (a) => a.rating },
  { header: 'Starred', get: (a) => (a.starred ? 'YES' : 'NO') },
  { header: 'Source', get: (a) => a.source },
  { header: 'Location', get: (a) => a.locationCode },
  { header: 'Applied At', get: (a) => (a.appliedAt ? new Date(a.appliedAt).toISOString() : null) },
  { header: 'Experience (years)', get: (a) => (a.summary?.experienceYears ?? a.summary?.retailExperienceYears ?? null) },
  { header: 'Expected Salary', get: (a) => a.expectedSalary },
];

export async function exportApplications(
  viewer: HiringViewer,
  filters: ApplicationListFilters,
  format: 'csv' | 'xlsx'
): Promise<{ buffer: Buffer; fileName: string; contentType: string; rowCount: number }> {
  const all = await listApplications(viewer, { ...filters, page: 1, limit: 100 });
  const rows = [...all.applications];

  // Fetch remaining pages up to a cap for exports.
  const maxRows = 5000;
  let currentTotal = all.total;
  let page = 2;
  while (rows.length < Math.min(currentTotal, maxRows)) {
    const next = await listApplications(viewer, { ...filters, page, limit: 100 });
    if (next.applications.length === 0) break;
    rows.push(...next.applications);
    if (next.applications.length < 100) break;
    page++;
    if (page > 60) break;
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const { toCsv } = await import('../employeeCsvService.js');
    const header = EXPORT_COLUMNS.map((c) => c.header);
    const data = rows.map((app: any) => EXPORT_COLUMNS.map((c) => c.get(app)));
    return {
      buffer: Buffer.from('\uFEFF' + toCsv([header, ...data]), 'utf-8'),
      fileName: `hiring-applications-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      rowCount: rows.length,
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BSC Textiles HRMS';
  const sheet = workbook.addWorksheet('Applications');
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: Math.max(14, c.header.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  for (const app of rows) {
    sheet.addRow(EXPORT_COLUMNS.map((c) => c.get(app)));
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: `hiring-applications-${stamp}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    rowCount: rows.length,
  };
}

// ---------------------------------------------------------------------------
// HR: candidate view
// ---------------------------------------------------------------------------

export async function getCandidateProfile(
  viewer: HiringViewer,
  candidateId: string,
  options: { locationId?: string; shard?: string } = {}
) {
  const scope = resolveHiringScope(viewer, options.locationId);
  const targets = options.shard
    ? (await resolveAllShardTargets()).filter((t) => t.databaseId === options.shard)
    : await resolveShardTargets(scope);

  for (const target of targets) {
    try {
      const [candidateRows]: any = await target.pool.query('SELECT * FROM candidate WHERE id = ? LIMIT 1', [candidateId]);
      if (candidateRows.length === 0) continue;
      const candidate = candidateRows[0];
      const [applications]: any = await target.pool.query(
        `${APPLICATION_SELECT} WHERE a.candidateId = ? ORDER BY a.appliedAt DESC`,
        [candidateId]
      );
      return {
        candidate: {
          id: candidate.id,
          fullName: candidate.fullName,
          phone: candidate.phone,
          email: candidate.email,
          dob: candidate.dob,
          gender: candidate.gender,
          city: candidate.city,
          state: candidate.state,
          pincode: candidate.pincode,
          addressLine1: candidate.addressLine1,
          addressLine2: candidate.addressLine2,
          source: candidate.source,
          tags: parseJson(candidate.tags, []),
          applicationCount: Number(candidate.applicationCount || 0),
          firstSeenAt: candidate.firstSeenAt,
          lastAppliedAt: candidate.lastAppliedAt,
          resumeKey: candidate.resumeKey,
          resumeName: candidate.resumeName,
          photoKey: candidate.photoKey,
          hasAadhaar: Boolean(candidate.aadhaarEncrypted),
          hasPan: Boolean(candidate.panEncrypted),
          aadhaarMasked: candidate.aadhaarLast4 ? `XXXX XXXX ${candidate.aadhaarLast4}` : null,
          panMasked: candidate.panLast4 ? `XXXXX${candidate.panLast4}` : null,
        },
        applications: applications.map((r: any) => mapApplicationRow(r, target.locationCode, target.databaseId)),
        shard: target.databaseId,
      };
    } catch (err: any) {
      console.warn(`[hiringApplications] candidate lookup failed on ${target.databaseId}:`, err.message);
    }
  }
  throw new HiringError('NOT_FOUND', 'Candidate not found.', 404);
}
