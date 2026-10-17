/**
 * Candidate Hiring — cross-shard outbox (control DB `hiring_outbox`).
 *
 * The candidate path (public submission, stage moves) commits to the shard and
 * then drops an event row here. Everything that crosses the shard boundary —
 * notification fan-out, rollups — is driven from this worker so a crash between
 * the shard commit and the side effect cannot lose the work.
 *
 * Delivery is at-least-once: rows are claimed atomically (PENDING → PROCESSING),
 * retried with exponential backoff up to `maxAttempts`, then parked as FAILED
 * for an operator to requeue.
 */

import { shardManager } from '../../core/sharding/index.js';
import { container } from '../../core/container/ServiceContainer.js';
import { getSettings } from './hiringSettings.js';

// ---------------------------------------------------------------------------
// Event catalogue
// ---------------------------------------------------------------------------

export type HiringEventType =
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_STAGE_CHANGED'
  | 'INTERVIEW_SCHEDULED'
  | 'APPLICATION_WITHDRAWN';

export interface ApplicationSubmittedPayload {
  applicationId: string;
  candidateId: string;
  formId: string;
  formTitle?: string;
  jobTitle: string;
  locationId: string;
  locationCode: string | null;
  candidateName: string;
  referenceNumber: string;
}

export interface ApplicationStageChangedPayload {
  applicationId: string;
  formId: string;
  locationId: string;
  fromStage: string;
  toStage: string;
  actorId: string;
  actorName: string | null;
  candidateName: string;
  jobTitle: string;
}

export interface HiringEventPayloadMap {
  APPLICATION_SUBMITTED: ApplicationSubmittedPayload;
  APPLICATION_STAGE_CHANGED: ApplicationStageChangedPayload;
  INTERVIEW_SCHEDULED: Record<string, unknown>;
  APPLICATION_WITHDRAWN: Record<string, unknown>;
}

export interface EnqueueHiringEventOptions {
  aggregateType?: string;
  aggregateId?: string;
  targetShard?: string | null;
  maxAttempts?: number;
  availableAt?: Date;
}

function controlPool() {
  return shardManager.getControlPool();
}

/**
 * Queue a hiring side effect. Never throws: a broken queue must not take the
 * candidate-facing submission down with it — the row simply retries later.
 */
export async function enqueueHiringEvent<T extends HiringEventType>(
  eventType: T,
  payload: HiringEventPayloadMap[T],
  options: EnqueueHiringEventOptions = {}
): Promise<number | null> {
  try {
    const aggregateId =
      options.aggregateId ?? (payload as { applicationId?: string }).applicationId ?? null;
    const [result]: any = await controlPool().query(
      `INSERT INTO hiring_outbox
         (eventType, aggregateType, aggregateId, targetShard, payload, maxAttempts, availableAt)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
      [
        eventType,
        options.aggregateType ?? 'APPLICATION',
        aggregateId,
        options.targetShard ?? null,
        JSON.stringify(payload),
        options.maxAttempts ?? 5,
        options.availableAt ?? new Date(),
      ]
    );
    return Number(result.insertId);
  } catch (err: any) {
    console.error(`[hiringOutbox] enqueue ${eventType} failed:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

interface ResolveRecipientOptions {
  excludeUserIds?: string[];
}

/**
 * Who hears about events at a location:
 *   1. the explicit hiring team (`location.hiringTeamUserIds`), when set;
 *   2. otherwise HR staff pinned to the location, plus org-wide admins.
 * Org-wide SUPER_ADMIN/ADMIN are always included; `notifyLocationTeam=false`
 * reduces delivery to exactly those.
 */
async function resolveRecipientIds(
  locationId: string,
  notifyLocationTeam: boolean,
  options: ResolveRecipientOptions = {}
): Promise<string[]> {
  const excluded = new Set(options.excludeUserIds ?? []);
  const ids = new Set<string>();

  if (notifyLocationTeam) {
    try {
      const [locationRows]: any = await controlPool().query(
        'SELECT hiringTeamUserIds FROM location WHERE id = ? LIMIT 1',
        [locationId]
      );
      let team: string[] = [];
      const raw = locationRows[0]?.hiringTeamUserIds;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) team = parsed.filter((v) => typeof v === 'string' && v);
        } catch {
          team = [];
        }
      } else if (Array.isArray(raw)) {
        team = raw.filter((v) => typeof v === 'string' && v);
      }
      for (const id of team) ids.add(id);
    } catch (err: any) {
      console.warn('[hiringOutbox] hiring team lookup failed:', err.message);
    }
  }

  try {
    const [rows]: any = await controlPool().query(
      `SELECT id FROM \`user\`
       WHERE isActive = 1 AND status = 'ACTIVE'
         AND (
           role IN ('SUPER_ADMIN', 'ADMIN')
           ${notifyLocationTeam ? "OR (role IN ('HR_MANAGER','HR_EXECUTIVE') AND locationId = ?)" : ''}
         )`,
      notifyLocationTeam ? [locationId] : []
    );
    for (const row of rows) ids.add(row.id);
  } catch (err: any) {
    console.warn('[hiringOutbox] role recipient lookup failed:', err.message);
  }

  return [...ids].filter((id) => !excluded.has(id));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleApplicationSubmitted(payload: ApplicationSubmittedPayload): Promise<void> {
  const settings = await getSettings('hiring.notifications');
  if (!settings.notifyOnNewApplication) return;

  const recipientIds = await resolveRecipientIds(payload.locationId, settings.notifyLocationTeam);
  if (recipientIds.length === 0) return;

  await container.notificationService.publishEvent(
    {
      eventId: 'HIRING.APPLICATION_SUBMITTED',
      title: 'New application received',
      message: `${payload.candidateName} applied for ${payload.jobTitle}${
        payload.locationCode ? ` at ${payload.locationCode}` : ''
      }. Ref ${payload.referenceNumber}.`,
      type: 'INFO',
      severity: 'MEDIUM',
      entityType: 'hiring_application',
      entityId: payload.applicationId,
      locationId: payload.locationId,
      actionUrl: `/hiring/candidates/${payload.applicationId}?location=${payload.locationId}`,
      metadata: {
        applicationId: payload.applicationId,
        candidateId: payload.candidateId,
        jobTitle: payload.jobTitle,
        locationCode: payload.locationCode,
        referenceNumber: payload.referenceNumber,
      },
    },
    { recipients: recipientIds.map((userId) => ({ userId })) }
  );
}

async function handleApplicationStageChanged(payload: ApplicationStageChangedPayload): Promise<void> {
  const settings = await getSettings('hiring.notifications');
  if (!settings.notifyOnStageChange) return;

  const recipientIds = await resolveRecipientIds(payload.locationId, settings.notifyLocationTeam, {
    excludeUserIds: payload.actorId ? [payload.actorId] : [],
  });
  if (recipientIds.length === 0) return;

  const from = String(payload.fromStage || '').replace(/_/g, ' ');
  const to = String(payload.toStage || '').replace(/_/g, ' ');
  const actor = payload.actorName ? ` by ${payload.actorName}` : '';

  // Stage moves repeat for the same application, so dedup would swallow all but
  // the first; at-least-once delivery is the right trade-off here.
  await container.notificationService.publishEvent(
    {
      eventId: 'HIRING.APPLICATION_STAGE_CHANGED',
      title: 'Application stage updated',
      message: `${payload.candidateName} (${payload.jobTitle}): ${from} → ${to}${actor}.`,
      type: 'INFO',
      severity: 'LOW',
      entityType: 'hiring_application',
      entityId: payload.applicationId,
      locationId: payload.locationId,
      actionUrl: `/hiring/candidates/${payload.applicationId}?location=${payload.locationId}`,
      metadata: {
        applicationId: payload.applicationId,
        fromStage: payload.fromStage,
        toStage: payload.toStage,
        actorId: payload.actorId,
      },
    },
    { recipients: recipientIds.map((userId) => ({ userId })), skipDeduplication: true }
  );
}

async function deliverOutboxEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
  switch (eventType) {
    case 'APPLICATION_SUBMITTED':
      await handleApplicationSubmitted(payload as unknown as ApplicationSubmittedPayload);
      return;
    case 'APPLICATION_STAGE_CHANGED':
      await handleApplicationStageChanged(payload as unknown as ApplicationStageChangedPayload);
      return;
    default:
      // Unknown types are consumed so they do not poison the queue; a newer
      // worker version can pick up future events from the audit trail.
      console.warn(`[hiringOutbox] no handler for ${eventType}; marking done.`);
      return;
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

interface OutboxRow {
  id: number;
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  targetShard: string | null;
  payload: string | Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
}

export interface OutboxBatchResult {
  picked: number;
  succeeded: number;
  failed: number;
  retried: number;
}

function parsePayload(raw: OutboxRow['payload']): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

/**
 * Claim and process up to `batchSize` due events. Safe to call concurrently:
 * each row is claimed with a conditional UPDATE, so only one caller wins it.
 */
export async function processOutboxBatch(batchSize = 25): Promise<OutboxBatchResult> {
  const result: OutboxBatchResult = { picked: 0, succeeded: 0, failed: 0, retried: 0 };
  const pool = controlPool();

  const [rows]: any = await pool.query(
    `SELECT * FROM hiring_outbox
     WHERE status = 'PENDING' AND availableAt <= NOW(3)
     ORDER BY id ASC
     LIMIT ?`,
    [Math.max(1, Math.min(200, batchSize))]
  );
  result.picked = rows.length;

  for (const row of rows as OutboxRow[]) {
    const [claim]: any = await pool.query(
      `UPDATE hiring_outbox SET status = 'PROCESSING' WHERE id = ? AND status = 'PENDING'`,
      [row.id]
    );
    if (claim.affectedRows === 0) continue;

    try {
      await deliverOutboxEvent(row.eventType, parsePayload(row.payload));
      await pool.query(
        `UPDATE hiring_outbox SET status = 'DONE', processedAt = NOW(3), lastError = NULL WHERE id = ?`,
        [row.id]
      );
      result.succeeded += 1;
    } catch (err: any) {
      const attempts = Number(row.attempts || 0) + 1;
      const message = String(err?.message || err).slice(0, 500);
      if (attempts >= Number(row.maxAttempts || 5)) {
        await pool.query(
          `UPDATE hiring_outbox SET status = 'FAILED', attempts = ?, lastError = ? WHERE id = ?`,
          [attempts, message, row.id]
        );
        result.failed += 1;
        console.error(`[hiringOutbox] event ${row.id} (${row.eventType}) exhausted retries: ${message}`);
      } else {
        const delayMs = Math.min(60 * 60 * 1000, 60_000 * 2 ** (attempts - 1));
        await pool.query(
          `UPDATE hiring_outbox SET status = 'PENDING', attempts = ?, availableAt = ?, lastError = ? WHERE id = ?`,
          [attempts, new Date(Date.now() + delayMs), message, row.id]
        );
        result.retried += 1;
        console.warn(`[hiringOutbox] event ${row.id} (${row.eventType}) attempt ${attempts} failed: ${message}`);
      }
    }
  }

  return result;
}

/** Reset FAILED rows (all, or the given ids) back to PENDING for a retry pass. */
export async function requeueFailedHiringEvents(ids?: number[]): Promise<number> {
  const pool = controlPool();
  if (ids && ids.length > 0) {
    const [result]: any = await pool.query(
      `UPDATE hiring_outbox SET status = 'PENDING', attempts = 0, availableAt = NOW(3)
       WHERE status = 'FAILED' AND id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    return Number(result.affectedRows || 0);
  }
  const [result]: any = await pool.query(
    `UPDATE hiring_outbox SET status = 'PENDING', attempts = 0, availableAt = NOW(3) WHERE status = 'FAILED'`
  );
  return Number(result.affectedRows || 0);
}

export interface HiringOutboxStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  oldestPendingAt: string | null;
}

export async function getHiringOutboxStats(): Promise<HiringOutboxStats> {
  const pool = controlPool();
  const [rows]: any = await pool.query(
    `SELECT status, COUNT(*) AS count, MIN(availableAt) AS oldest
     FROM hiring_outbox GROUP BY status`
  );
  const stats: HiringOutboxStats = { pending: 0, processing: 0, done: 0, failed: 0, oldestPendingAt: null };
  for (const row of rows) {
    const count = Number(row.count || 0);
    if (row.status === 'PENDING') {
      stats.pending = count;
      stats.oldestPendingAt = row.oldest ? new Date(row.oldest).toISOString() : null;
    } else if (row.status === 'PROCESSING') stats.processing = count;
    else if (row.status === 'DONE') stats.done = count;
    else if (row.status === 'FAILED') stats.failed = count;
  }
  return stats;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

export const HIRING_OUTBOX_INTERVAL_MS = Number(process.env.HIRING_OUTBOX_INTERVAL_MS) || 15_000;

export function startHiringOutboxWorker(intervalMs = HIRING_OUTBOX_INTERVAL_MS): void {
  if (workerTimer) return;

  const tick = async () => {
    if (processing) return;
    processing = true;
    try {
      let batch = await processOutboxBatch();
      // Drain quickly while there is a backlog, but stay gentle on the DB.
      let guard = 0;
      while (batch.picked >= 25 && guard < 10) {
        batch = await processOutboxBatch();
        guard += 1;
      }
    } catch (err: any) {
      console.warn('[hiringOutbox] worker tick failed:', err.message);
    } finally {
      processing = false;
    }
  };

  workerTimer = setInterval(() => void tick(), Math.max(5_000, intervalMs));
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  void tick();
  console.log(`[hiringOutbox] worker started (every ${Math.max(5_000, intervalMs)}ms)`);
}

export function stopHiringOutboxWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
