/**
 * Candidate Hiring — PII cryptography.
 *
 * Aadhaar and PAN are never stored in plaintext. The candidate row keeps:
 *   * AES-256-GCM ciphertext (format `v1:iv:tag:cipher`, base64url),
 *   * last 4 characters for display/masking,
 *   * HMAC-SHA256 hash for duplicate detection.
 *
 * Phone/email/IP/visitor identifiers used by the analytics and duplicate
 * checks are hashed with the same HMAC so raw values never leave request
 * handling scope.
 *
 * Key material: `HIRING_ENCRYPTION_KEY` (preferred, 32+ chars) with a
 * domain-separated derivation; falls back to `JWT_SECRET` so local dev works
 * without extra setup. Distinct derived keys for encryption and hashing.
 */

import crypto from 'node:crypto';

const VERSION = 'v1';

function deriveKey(purpose: string): Buffer {
  const explicit = process.env.HIRING_ENCRYPTION_KEY || '';
  const legacy = process.env.JWT_SECRET || '';
  const secret = explicit || legacy;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[hiringCrypto] HIRING_ENCRYPTION_KEY is required in production. ' +
          'Candidate PII is encrypted with a key derived from this value; it must come from the environment or a vault, never from a constant in the repository.'
      );
    }
    return crypto
      .createHash('sha256')
      .update(`${purpose}::bsc-hiring-local-development-secret`)
      .digest();
  }

  // JWT_SECRET stays in the chain deliberately. Rows encrypted before
  // HIRING_ENCRYPTION_KEY existed were sealed with a key derived from it, so
  // dropping it here would make existing candidate data undecryptable — a
  // silent data-loss migration. New deployments should set
  // HIRING_ENCRYPTION_KEY and rotate JWT_SECRET independently once nothing
  // still depends on the derived legacy key.
  return crypto.createHash('sha256').update(`${purpose}::${secret}`).digest();
}

function encryptionKey(): Buffer {
  return deriveKey('hiring-encryption');
}

function hashKey(): Buffer {
  return deriveKey('hiring-hash');
}

/** AES-256-GCM encrypt. Output: `v1:<iv>:<tag>:<cipher>` (all base64url). */
export function encryptSensitive(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined) return null;
  const value = String(plain);
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function isEncryptedValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`) && value.split(':').length === 4;
}

/** Decrypt a value produced by `encryptSensitive`. Returns null on tamper. */
export function decryptSensitive(token: string | null | undefined): string | null {
  if (!token || !isEncryptedValue(token)) return null;
  try {
    const [, ivB64, tagB64, dataB64] = token.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
    return plain.toString('utf-8');
  } catch {
    return null;
  }
}

/** Deterministic HMAC-SHA256 hex digest for equality checks without plaintext. */
export function hmacValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  return crypto.createHmac('sha256', hashKey()).update(s).digest('hex');
}

export function hashPhone(phoneDigits: string | null | undefined): string | null {
  return hmacValue(phoneDigits);
}

export function hashEmail(email: string | null | undefined): string | null {
  return hmacValue(email);
}

export function hashAadhaar(aadhaarDigits: string | null | undefined): string | null {
  return hmacValue(aadhaarDigits);
}

export function hashPan(pan: string | null | undefined): string | null {
  return hmacValue(pan);
}

/** Hash a request IP (never store raw). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const normalized = String(ip).replace('::ffff:', '');
  return crypto.createHmac('sha256', hashKey()).update(`ip:${normalized}`).digest('hex');
}

/** Stable per-visitor fingerprint: session id when present, else ip+ua. */
export function hashVisitor(sessionId: string | null | undefined, ip?: string | null, userAgent?: string | null): string {
  const basis = sessionId && sessionId.trim() ? `sess:${sessionId.trim()}` : `ua:${ip || ''}|${userAgent || ''}`;
  return crypto.createHmac('sha256', hashKey()).update(basis).digest('hex');
}

/** Cryptographically random opaque token (public form URLs, upload tokens). */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** URL-safe short code for shareable links (unambiguous alphabet). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomLinkCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// ---------------------------------------------------------------------------
// Signed short-lived payloads (upload tokens, public action tokens)
// ---------------------------------------------------------------------------

/**
 * Sign a JSON payload with a TTL. Format: `<base64url(json)>.<base64url(hmac)>`
 * where `json` carries `{ ...payload, exp: <epoch ms> }`.
 */
export function signToken(payload: Record<string, unknown>, ttlMs: number): string {
  const body = { ...payload, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(body), 'utf-8').toString('base64url');
  const signature = crypto.createHmac('sha256', hashKey()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

/** Verify a signed payload; returns null when tampered or expired. */
export function verifyToken<T extends Record<string, unknown>>(token: string | null | undefined): (T & { exp: number }) | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', hashKey()).update(encoded).digest('base64url');
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
