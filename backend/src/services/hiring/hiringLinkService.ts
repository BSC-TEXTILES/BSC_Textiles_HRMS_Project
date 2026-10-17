/**
 * Candidate Hiring — shareable links, link analytics and public resolution.
 *
 * A form can have many links: one per store QR poster, one per WhatsApp
 * broadcast, one generic. Each link may be pinned to a location or let the
 * candidate choose among the form's locations. Counters are denormalised on
 * the link row for cheap list views; the raw stream lives in
 * `hiring_link_event` (append-only, hashed visitor identifiers only).
 */

import crypto from 'node:crypto';
import { shardManager } from '../../core/sharding/index.js';
import { randomLinkCode } from './hiringCrypto.js';
import type { HiringActor } from './hiringFormService.js';
import { getForm, getLocationHiringFlags, resolveFormById } from './hiringFormService.js';

export const HIRING_LINK_EVENT_TYPES = ['VIEW', 'START', 'SUBMIT', 'WITHDRAW'] as const;
export type HiringLinkEventType = (typeof HIRING_LINK_EVENT_TYPES)[number];

export interface HiringLinkInput {
  label?: string | null;
  locationId?: string | null;
  expiresAt?: string | null;
  maxApplications?: number | null;
  enabled?: boolean;
  allowApplications?: boolean;
}

export interface LinkEventContext {
  sessionId?: string | null;
  visitorHash?: string | null;
  source?: string | null;
  applicationId?: string | null;
  locationId?: string | null;
}

function controlPool() {
  return shardManager.getControlPool();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomLinkCode(8);
    const [rows]: any = await controlPool().query('SELECT id FROM hiring_link WHERE code = ? LIMIT 1', [code]);
    if (rows.length === 0) return code;
  }
  // Fallback lengthens the code — collision at 8 chars is already ~1 in 10^11.
  return randomLinkCode(12);
}

export async function createLink(formId: string, input: HiringLinkInput, actor: HiringActor) {
  const form = await getForm(formId);
  if (!form) throw Object.assign(new Error('Form not found'), { code: 'NOT_FOUND' });

  // A pinned location must be acceptable for this form: either listed in the
  // form's locations or the form allows other locations.
  if (input.locationId) {
    const location = await getLocationHiringFlags(input.locationId);
    if (!location) throw Object.assign(new Error('Location not found'), { code: 'INVALID_LOCATION' });
    const listed = (form.locationIds as string[]).includes(input.locationId);
    if (!listed && !form.allowOtherLocations) {
      throw Object.assign(
        new Error('This form does not accept applications for that location'),
        { code: 'LOCATION_NOT_ALLOWED' }
      );
    }
    if (location.status !== 'ACTIVE' || !location.hiringEnabled) {
      throw Object.assign(new Error(`Hiring is disabled at ${location.code}`), { code: 'LOCATION_HIRING_DISABLED' });
    }
  }

  if (input.expiresAt && new Date(input.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error('Expiry must be in the future'), { code: 'INVALID_EXPIRY' });
  }

  const id = newId('hlink');
  const code = await generateUniqueCode();
  await controlPool().query(
    `INSERT INTO hiring_link (id, formId, code, label, locationId, enabled, allowApplications, expiresAt, maxApplications, createdById)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      formId,
      code,
      input.label?.trim() || null,
      input.locationId || null,
      input.enabled === undefined ? 1 : input.enabled ? 1 : 0,
      input.allowApplications === undefined ? 1 : input.allowApplications ? 1 : 0,
      input.expiresAt ? new Date(input.expiresAt) : null,
      input.maxApplications ?? null,
      actor.id,
    ]
  );
  return getLink(id);
}

export async function getLink(id: string) {
  const [rows]: any = await controlPool().query('SELECT * FROM hiring_link WHERE id = ? LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function getLinkByCode(code: string) {
  const [rows]: any = await controlPool().query('SELECT * FROM hiring_link WHERE code = ? LIMIT 1', [code.toUpperCase()]);
  return rows[0] ?? null;
}

export async function listLinks(formId: string) {
  const [rows]: any = await controlPool().query(
    'SELECT * FROM hiring_link WHERE formId = ? ORDER BY createdAt DESC',
    [formId]
  );
  return rows;
}

export async function updateLink(id: string, patch: HiringLinkInput, actor: HiringActor) {
  const link = await getLink(id);
  if (!link) throw Object.assign(new Error('Link not found'), { code: 'NOT_FOUND' });

  if (patch.locationId !== undefined && patch.locationId !== null) {
    const form = await getForm(link.formId);
    const location = await getLocationHiringFlags(patch.locationId);
    if (!location) throw Object.assign(new Error('Location not found'), { code: 'INVALID_LOCATION' });
    const listed = ((form?.locationIds as string[]) ?? []).includes(patch.locationId);
    if (!listed && !form?.allowOtherLocations) {
      throw Object.assign(new Error('This form does not accept applications for that location'), { code: 'LOCATION_NOT_ALLOWED' });
    }
  }

  await controlPool().query(
    `UPDATE hiring_link SET
       label = ?,
       locationId = ?,
       enabled = COALESCE(?, enabled),
       allowApplications = COALESCE(?, allowApplications),
       expiresAt = ?,
       maxApplications = ?
     WHERE id = ?`,
    [
      patch.label === undefined ? link.label : patch.label?.trim() || null,
      patch.locationId === undefined ? link.locationId : patch.locationId,
      patch.enabled === undefined ? null : patch.enabled ? 1 : 0,
      patch.allowApplications === undefined ? null : patch.allowApplications ? 1 : 0,
      patch.expiresAt === undefined ? link.expiresAt : patch.expiresAt ? new Date(patch.expiresAt) : null,
      patch.maxApplications === undefined ? link.maxApplications : patch.maxApplications,
      id,
    ]
  );
  return getLink(id);
}

export async function deleteLink(id: string) {
  await controlPool().query('DELETE FROM hiring_link WHERE id = ?', [id]);
}

export async function regenerateLinkCode(id: string) {
  const link = await getLink(id);
  if (!link) throw Object.assign(new Error('Link not found'), { code: 'NOT_FOUND' });
  const code = await generateUniqueCode();
  await controlPool().query('UPDATE hiring_link SET code = ? WHERE id = ?', [code, id]);
  return getLink(id);
}

// ---------------------------------------------------------------------------
// Events & counters
// ---------------------------------------------------------------------------

export async function recordLinkEvent(
  formId: string,
  eventType: HiringLinkEventType,
  linkId: string | null,
  context: LinkEventContext = {}
): Promise<void> {
  const pool = controlPool();
  try {
    await pool.query(
      `INSERT INTO hiring_link_event (formId, linkId, locationId, eventType, sessionId, visitorHash, source, applicationId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        formId,
        linkId,
        context.locationId ?? null,
        eventType,
        context.sessionId ?? null,
        context.visitorHash ?? null,
        context.source ?? null,
        context.applicationId ?? null,
      ]
    );

    if (linkId) {
      const counterColumn =
        eventType === 'VIEW' ? 'viewCount' : eventType === 'START' ? 'startCount' : eventType === 'SUBMIT' ? 'submissions' : null;
      await pool.query(
        `UPDATE hiring_link SET ${counterColumn ? `${counterColumn} = ${counterColumn} + 1,` : ''} lastActivityAt = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [linkId]
      );
    }
  } catch (err: any) {
    console.warn('[hiringLinks] failed to record event:', err.message);
  }
}

export interface PublicLinkResolution {
  ok: boolean;
  code?: 'NOT_FOUND' | 'DISABLED' | 'EXPIRED' | 'LIMIT_REACHED' | 'FORM_UNAVAILABLE';
  message?: string;
  form?: any;
  schema?: any;
  version?: { id: string; version: number };
  locations?: Array<{ id: string; code: string; name: string }>;
  settings?: any;
  link?: { id: string; code: string; label: string | null; locationId: string | null };
}

/**
 * Resolve a shareable code for the public page. Records a VIEW event and
 * returns the same payload shape as `resolveFormByToken`.
 */
export async function resolveLinkForPublic(code: string, context: LinkEventContext = {}): Promise<PublicLinkResolution> {
  const link = await getLinkByCode(code);
  if (!link) return { ok: false, code: 'NOT_FOUND', message: 'This application link is not valid.' };
  if (!link.enabled) return { ok: false, code: 'DISABLED', message: 'This application link has been disabled.' };
  if (link.expiresAt && Date.now() > new Date(link.expiresAt).getTime()) {
    return { ok: false, code: 'EXPIRED', message: 'This application link has expired.' };
  }
  if (!link.allowApplications) {
    return { ok: false, code: 'DISABLED', message: 'This link is not accepting applications right now.' };
  }
  if (link.maxApplications && Number(link.submissions) >= Number(link.maxApplications)) {
    return { ok: false, code: 'LIMIT_REACHED', message: 'This application link has reached its application limit.' };
  }

  const resolution = await resolveFormById(link.formId);
  if (!resolution.ok) {
    return { ok: false, code: 'FORM_UNAVAILABLE', message: resolution.message };
  }

  await recordLinkEvent(link.formId, 'VIEW', link.id, { ...context, locationId: link.locationId ?? null });

  return {
    ok: true,
    form: resolution.form,
    schema: resolution.schema,
    version: resolution.version,
    locations: resolution.locations,
    settings: resolution.settings,
    link: { id: link.id, code: link.code, label: link.label, locationId: link.locationId },
  };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface LinkAnalytics {
  totals: { views: number; starts: number; submissions: number; conversionRate: number };
  byDay: Array<{ day: string; views: number; starts: number; submissions: number }>;
  byLink: Array<{ linkId: string | null; label: string | null; code: string | null; views: number; starts: number; submissions: number }>;
  byLocation: Array<{ locationId: string | null; locationCode: string | null; views: number; starts: number; submissions: number }>;
}

export async function getFormLinkAnalytics(formId: string, days = 30): Promise<LinkAnalytics> {
  const pool = controlPool();
  const windowDays = Math.min(365, Math.max(1, days));

  const [totalsRows]: any = await pool.query(
    `SELECT eventType, COUNT(*) AS count FROM hiring_link_event
     WHERE formId = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY eventType`,
    [formId, windowDays]
  );
  const totals = { views: 0, starts: 0, submissions: 0, conversionRate: 0 };
  for (const row of totalsRows) {
    if (row.eventType === 'VIEW') totals.views = Number(row.count);
    if (row.eventType === 'START') totals.starts = Number(row.count);
    if (row.eventType === 'SUBMIT') totals.submissions = Number(row.count);
  }
  totals.conversionRate = totals.views > 0 ? Math.round((totals.submissions / totals.views) * 1000) / 10 : 0;

  const [byDayRows]: any = await pool.query(
    `SELECT DATE(createdAt) AS day,
       SUM(eventType = 'VIEW') AS views,
       SUM(eventType = 'START') AS starts,
       SUM(eventType = 'SUBMIT') AS submissions
     FROM hiring_link_event
     WHERE formId = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE(createdAt)
     ORDER BY day ASC`,
    [formId, windowDays]
  );

  const [byLinkRows]: any = await pool.query(
    `SELECT e.linkId, l.label, l.code,
       SUM(e.eventType = 'VIEW') AS views,
       SUM(e.eventType = 'START') AS starts,
       SUM(e.eventType = 'SUBMIT') AS submissions
     FROM hiring_link_event e
     LEFT JOIN hiring_link l ON l.id = e.linkId
     WHERE e.formId = ? AND e.createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY e.linkId, l.label, l.code
     ORDER BY submissions DESC`,
    [formId, windowDays]
  );

  const [byLocationRows]: any = await pool.query(
    `SELECT e.locationId, loc.code AS locationCode,
       SUM(e.eventType = 'VIEW') AS views,
       SUM(e.eventType = 'START') AS starts,
       SUM(e.eventType = 'SUBMIT') AS submissions
     FROM hiring_link_event e
     LEFT JOIN location loc ON loc.id = e.locationId
     WHERE e.formId = ? AND e.createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY e.locationId, loc.code
     ORDER BY submissions DESC`,
    [formId, windowDays]
  );

  const toNum = (v: any) => Number(v || 0);

  return {
    totals,
    byDay: byDayRows.map((r: any) => ({
      day: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
      views: toNum(r.views),
      starts: toNum(r.starts),
      submissions: toNum(r.submissions),
    })),
    byLink: byLinkRows.map((r: any) => ({
      linkId: r.linkId ?? null,
      label: r.label ?? null,
      code: r.code ?? null,
      views: toNum(r.views),
      starts: toNum(r.starts),
      submissions: toNum(r.submissions),
    })),
    byLocation: byLocationRows.map((r: any) => ({
      locationId: r.locationId ?? null,
      locationCode: r.locationCode ?? null,
      views: toNum(r.views),
      starts: toNum(r.starts),
      submissions: toNum(r.submissions),
    })),
  };
}
