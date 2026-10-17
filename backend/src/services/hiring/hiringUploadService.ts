/**
 * Candidate Hiring — public upload handling.
 *
 * Files arrive as raw bodies (`express.raw`) on a dedicated endpoint — no
 * multipart library required. Each stored file gets an opaque relative storage
 * key (`YYYY/MM/<id>.<ext>`) and is referenced afterwards by a SIGNED,
 * short-lived upload token, so the submission endpoint never trusts a client
 * supplied path.
 *
 * Security rules:
 *   * extension allow-list + magic-byte sniffing (a renamed .exe fails),
 *   * hard size cap (5 MB default, 2 MB for photographs),
 *   * files are stored OUTSIDE any statically served directory — downloads go
 *     through authenticated, location-scoped routes,
 *   * storage keys are regex-validated before any filesystem access.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileExtension, sniffExtensionFromBuffer } from '../../validation/hiringValidators.js';
import { signToken, verifyToken } from './hiringCrypto.js';

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || 'uploads', 'hiring');

export const HIRING_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const HIRING_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const HIRING_UPLOAD_TOKEN_TTL_MS = 45 * 60 * 1000;

export const HIRING_ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'] as const;

export const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** What the leading bytes must be for a given extension. */
const EXPECTED_SNIFF: Record<string, string[]> = {
  pdf: ['pdf'],
  doc: ['doc'],
  docx: ['zip'],
  jpg: ['jpg'],
  jpeg: ['jpg'],
  png: ['png'],
  webp: ['webp'],
};

const STORAGE_KEY_PATTERN = /^\d{4}\/\d{2}\/[a-f0-9]{24}\.(pdf|doc|docx|jpg|jpeg|png|webp)$/;

export interface StoredUpload {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  token: string;
}

export interface UploadTokenPayload extends Record<string, unknown> {
  storageKey: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  fieldKey: string;
  formToken: string;
}

export function sanitizeFileName(name: string): string {
  return (
    String(name || 'document')
      .replace(/[\\/]/g, '_')
      .replace(/[\u0000-\u001f<>:"|?*]/g, '')
      .slice(0, 180)
      .trim() || 'document'
  );
}

export interface StoreUploadInput {
  buffer: Buffer;
  fileName: string;
  mime?: string | null;
  fieldKey: string;
  formToken: string;
  photo?: boolean;
}

export function storeHiringUpload(input: StoreUploadInput): StoredUpload {
  const ext = fileExtension(input.fileName);
  if (!ext || !(HIRING_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw Object.assign(new Error(`File type .${ext || '?'} is not allowed`), { code: 'UNSUPPORTED_FILE_TYPE' });
  }

  const maxBytes = input.photo ? HIRING_PHOTO_MAX_BYTES : HIRING_UPLOAD_MAX_BYTES;
  if (!input.buffer || input.buffer.length === 0) {
    throw Object.assign(new Error('Uploaded file is empty'), { code: 'EMPTY_FILE' });
  }
  if (input.buffer.length > maxBytes) {
    throw Object.assign(
      new Error(`File exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit`),
      { code: 'FILE_TOO_LARGE' }
    );
  }

  const sniffed = sniffExtensionFromBuffer(input.buffer);
  const expected = EXPECTED_SNIFF[ext] ?? [];
  if (!sniffed || !expected.includes(sniffed)) {
    throw Object.assign(new Error('File content does not match its extension'), { code: 'FILE_CONTENT_MISMATCH' });
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const storageKey = `${yyyy}/${mm}/${crypto.randomBytes(12).toString('hex')}.${ext}`;
  const fullPath = path.join(UPLOAD_ROOT, storageKey);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, input.buffer);

  const fileName = sanitizeFileName(input.fileName);
  const mime = input.mime && input.mime.trim() ? input.mime.trim().slice(0, 120) : MIME_BY_EXTENSION[ext] || 'application/octet-stream';

  const token = signToken(
    {
      storageKey,
      fileName,
      mime,
      sizeBytes: input.buffer.length,
      fieldKey: input.fieldKey,
      formToken: input.formToken,
    } satisfies UploadTokenPayload,
    HIRING_UPLOAD_TOKEN_TTL_MS
  );

  return { storageKey, fileName, mimeType: mime, sizeBytes: input.buffer.length, token };
}

export function verifyUploadToken(token: string | null | undefined, formToken?: string): UploadTokenPayload | null {
  const payload = verifyToken<UploadTokenPayload>(token);
  if (!payload) return null;
  if (!STORAGE_KEY_PATTERN.test(String(payload.storageKey || ''))) return null;
  if (formToken && payload.formToken !== formToken) return null;
  if (typeof payload.fieldKey !== 'string' || !payload.fieldKey) return null;
  return payload;
}

export function resolveStoragePath(storageKey: string): string | null {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) return null;
  const fullPath = path.resolve(UPLOAD_ROOT, storageKey);
  if (!fullPath.startsWith(UPLOAD_ROOT + path.sep)) return null;
  return fullPath;
}

export function readHiringUpload(storageKey: string): { buffer: Buffer; fileName: string; mimeType: string } | null {
  const fullPath = resolveStoragePath(storageKey);
  if (!fullPath || !fs.existsSync(fullPath)) return null;
  const ext = fileExtension(fullPath);
  return {
    buffer: fs.readFileSync(fullPath),
    fileName: path.basename(fullPath),
    mimeType: MIME_BY_EXTENSION[ext] || 'application/octet-stream',
  };
}

export function deleteHiringUpload(storageKey: string): void {
  const fullPath = resolveStoragePath(storageKey);
  if (!fullPath) return;
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (err: any) {
    console.warn('[hiringUpload] delete failed:', err.message);
  }
}

export function hiringUploadRoot(): string {
  return UPLOAD_ROOT;
}
