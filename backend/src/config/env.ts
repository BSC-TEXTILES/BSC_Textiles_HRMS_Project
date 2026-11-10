import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SignOptions } from 'jsonwebtoken';

// Load .env HERE, before any secret is read. index.ts also calls dotenv.config(),
// but ESM/CJS module evaluation may run this file first (via route imports), which
// previously left JWT_SECRET unset and forced a random per-process key — breaking
// every session on each tsx-watch restart.
dotenv.config();
dotenv.config({ path: '../.env' });

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'your-super-secret-jwt-key-change-in-production-min-32-chars',
  'bsc-textiles-hrms-super-secret-jwt-key-2024-production-ready',
  'bsc-hrms-dev-only-jwt-key-8f3c1d9e-not-for-production',
  'change-me',
  'secret',
]);

// This value was committed as a fallback in earlier revisions. It is no longer
// used as a default, but an existing .env that still carries it should rotate
// the HMAC secret once the hiring rows that may derive from it are verified.
const ROTATE_RECOMMENDED = new Set([
  'bsc-textiles-hrms-super-secret-jwt-key-2024-production-ready-32chars',
]);

const isProduction = process.env.NODE_ENV === 'production';

// Fail fast in production instead of silently falling back to a local database.
// SQLite deployments are exempt because they use SQLITE_PATH, not a URI.
const dbType = (process.env.DB_TYPE || 'mysql').trim().toLowerCase();
if (isProduction && dbType !== 'sqlite') {
  const hasDatabaseUri = Boolean(
    (process.env.DATABASE_URL ||
      process.env.SUPABASE_POOLER_URL ||
      process.env.SUPABASE_DB_URL ||
      '').trim()
  );
  if (!hasDatabaseUri) {
    throw new Error(
      'DATABASE_URL is required in production (or set DB_TYPE=sqlite with SQLITE_PATH). ' +
        'Refusing to fall back to a localhost database.'
    );
  }
}

function readSecret(name: string): string {
  const value = (process.env[name] || '').trim();

  if (!value || PLACEHOLDER_SECRETS.has(value)) {
    const reason = value ? 'is set to a committed placeholder value' : 'is not set';
    if (isProduction) {
      throw new Error(`${name} ${reason}. Refusing to start in production without a real secret.`);
    }
    // Development fallback: stable, clearly non-production key so sessions
    // survive hot reloads without ever resembling a deployable credential.
    return 'bsc-hrms-dev-only-jwt-key-8f3c1d9e-not-for-production';
  }

  if (ROTATE_RECOMMENDED.has(value)) {
    console.warn(
      '[config] JWT_SECRET matches a value previously committed as a fallback. ' +
        'Rotate it once hiring data that may derive from the legacy key has been verified.'
    );
  }

  if (value.length < 32) {
    console.warn(`[config] ${name} is shorter than 32 characters; consider a longer secret.`);
  }

  return value;
}

export const JWT_SECRET = readSecret('JWT_SECRET');
export const JWT_ISSUER = 'bsc-textiles-hrms';
export const PORT = Number.parseInt(process.env.PORT || '4000', 10);
export const FRONTEND_URLS = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
/** Accepts the `ms` shorthand ("12h", "7d") or a number of seconds. */
export const TOKEN_TTL = (process.env.JWT_EXPIRES_IN || '12h') as NonNullable<SignOptions['expiresIn']>;
export const IS_PRODUCTION = isProduction;
