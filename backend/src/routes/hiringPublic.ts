/**
 * Candidate Hiring — public routes (mounted at /api/v1/hiring/public).
 *
 * No authentication: these are the endpoints the shared /apply page calls from
 * a candidate's phone. Protections are layered instead:
 *   * strict per-IP rate limits (read, upload, submit, captcha),
 *   * captcha + consent enforced inside the submission service,
 *   * uploads bound to the form via signed tokens and content-sniffed,
 *   * duplicate suppression and location allow-lists in the service.
 */

import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import {
  HiringError,
  submitPublicApplication,
} from '../services/hiring/hiringApplicationService.js';
import {
  getLinkByCode,
  recordLinkEvent,
  resolveLinkForPublic,
} from '../services/hiring/hiringLinkService.js';
import { resolveFormByToken } from '../services/hiring/hiringFormService.js';
import {
  HIRING_UPLOAD_MAX_BYTES,
  storeHiringUpload,
} from '../services/hiring/hiringUploadService.js';
import { issueCaptcha } from '../services/captchaService.js';

const router = Router();

function limitHandler(message: string) {
  return (req: any, res: Response) => {
    const retryAfter = Math.ceil((req.rateLimit?.resetTime?.getTime() - Date.now()) / 1000) || 60;
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many requests', message, retryAfter });
  };
}

const publicReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler('Too many requests. Please wait a moment and try again.'),
});

const publicUploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler('Too many uploads. Please wait a moment before uploading again.'),
});

const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: Number(process.env.HIRING_PUBLIC_SUBMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler('Too many submission attempts. Please wait before trying again.'),
});

const captchaLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler('Too many captcha requests. Please wait a moment.'),
});

function clientIpOf(req: Request): string {
  return (req as any).clientIp || req.ip || req.socket.remoteAddress || '';
}

function sessionIdOf(req: Request): string | null {
  const header = req.headers['x-hiring-session'];
  if (typeof header === 'string' && header.trim()) return header.trim().slice(0, 128);
  return null;
}

function publicError(res: Response, err: any, context: string) {
  if (err instanceof HiringError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  console.error(`[hiringPublic] ${context}:`, err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

/** GET /hiring/public/links/:code — resolve a shared application link. */
router.get('/links/:code', publicReadLimiter, async (req, res) => {
  try {
    const resolution = await resolveLinkForPublic(req.params.code, {
      sessionId: sessionIdOf(req),
      source: typeof req.query.source === 'string' ? req.query.source.slice(0, 120) : null,
    });
    if (!resolution.ok) {
      const status = resolution.code === 'NOT_FOUND' ? 404 : 410;
      return res.status(status).json({ error: resolution.message, code: resolution.code });
    }
    res.json(resolution);
  } catch (err) {
    publicError(res, err, 'resolve link');
  }
});

/** GET /hiring/public/forms/:token — resolve a form by its public token. */
router.get('/forms/:token', publicReadLimiter, async (req, res) => {
  try {
    const resolution = await resolveFormByToken(req.params.token);
    if (!resolution.ok) {
      const status = resolution.code === 'NOT_FOUND' ? 404 : 410;
      return res.status(status).json({ error: resolution.message, code: resolution.code });
    }
    res.json(resolution);
  } catch (err) {
    publicError(res, err, 'resolve form');
  }
});

/** POST /hiring/public/start — candidate opened the form (funnel "start"). */
router.post('/start', publicReadLimiter, async (req, res) => {
  try {
    const { linkCode, source, locationId } = req.body ?? {};
    if (typeof linkCode === 'string' && linkCode) {
      const link = await getLinkByCode(linkCode);
      if (link) {
        await recordLinkEvent(link.formId, 'START', link.id, {
          sessionId: sessionIdOf(req),
          source: typeof source === 'string' ? source.slice(0, 120) : null,
          locationId: link.locationId ?? (typeof locationId === 'string' ? locationId : null),
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    publicError(res, err, 'record start');
  }
});

/** GET /hiring/public/captcha — self-hosted SVG challenge. */
router.get('/captcha', captchaLimiter, async (_req, res) => {
  try {
    const challenge = await issueCaptcha();
    res.setHeader('Cache-Control', 'no-store');
    res.json(challenge);
  } catch (err) {
    publicError(res, err, 'issue captcha');
  }
});

/**
 * POST /hiring/public/upload — raw file body.
 *
 * Headers: x-form-token (required), x-field-key (required), x-file-name,
 * x-photo: '1' for photos (2 MB cap). The response token must be sent back in
 * the submission's `files` map; it is HMAC-signed and form-bound.
 */
router.post(
  '/upload',
  publicUploadLimiter,
  express.raw({ type: '*/*', limit: HIRING_UPLOAD_MAX_BYTES }),
  async (req: Request, res: Response) => {
    try {
      const formToken = String(req.headers['x-form-token'] || '').trim();
      const fieldKey = String(req.headers['x-field-key'] || '').trim();
      const rawName = String(req.headers['x-file-name'] || 'document');
      const isPhoto = String(req.headers['x-photo'] || '') === '1';

      if (!formToken || !fieldKey) {
        return res.status(400).json({ error: 'Missing upload context', code: 'UPLOAD_CONTEXT_MISSING' });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Empty upload', code: 'EMPTY_FILE' });
      }

      let fileName = rawName;
      try {
        fileName = decodeURIComponent(rawName);
      } catch {
        fileName = rawName;
      }

      const stored = storeHiringUpload({
        buffer: req.body,
        fileName,
        mime: req.headers['content-type'],
        fieldKey,
        formToken,
        photo: isPhoto,
      });

      res.status(201).json({
        token: stored.token,
        fileName: stored.fileName,
        sizeBytes: stored.sizeBytes,
        mime: stored.mimeType,
      });
    } catch (err: any) {
      if (err?.code === 'UNSUPPORTED_FILE_TYPE' || err?.code === 'EMPTY_FILE' || err?.code === 'FILE_TOO_LARGE' || err?.code === 'FILE_CONTENT_MISMATCH') {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      publicError(res, err, 'upload');
    }
  }
);

/** POST /hiring/public/apply — the submission itself. */
router.post('/apply', publicSubmitLimiter, async (req, res) => {
  try {
    const body = req.body ?? {};
    const result = await submitPublicApplication({
      linkCode: body.linkCode ?? null,
      formToken: body.formToken ?? null,
      locationId: body.locationId ?? null,
      values: body.values ?? {},
      files: body.files ?? {},
      consent: Boolean(body.consent),
      captcha: body.captcha ?? null,
      sessionId: body.sessionId ?? sessionIdOf(req),
      source: body.source ?? (typeof req.query.source === 'string' ? req.query.source : null),
      ip: clientIpOf(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(201).json(result);
  } catch (err) {
    publicError(res, err, 'submit application');
  }
});

export default router;
