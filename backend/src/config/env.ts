/**
 * Server configuration.
 *
 * Secrets are resolved here and nowhere else, so a missing or placeholder value
 * fails at boot instead of silently signing tokens with a key that is committed
 * to source and therefore known to anyone reading the repository.
 */

import crypto from 'node:crypto';
import type { SignOptions } from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load .env HERE, before any secret is read. index.ts also calls dotenv.config(),
// but ESM/CJS module evaluation may run this file first (via route imports), which
// previously left JWT_SECRET unset and forced a random per-process key — breaking
// every session on each tsx-watch restart.
dotenv.config();
dotenv.config({ path: '../.env' });

const PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'your-super-secret-jwt-key-change-in-production-min-32-chars',
  'bsc-textiles-hrms-super-secret-jwt-key-2024-production-ready',
  'change-me',
  'secret',
]);

const isProduction = process.env.NODE_ENV === 'production';

function readSecret(name: string): string {
  const value = (process.env[name] || '').trim();

  if (!value || PLACEHOLDER_SECRETS.has(value)) {
    const reason = value ? 'is set to a committed placeholder value' : 'is not set';
    if (isProduction) {
      throw new Error(`${name} ${reason}. Refusing to start in production without a real secret.`);
    }
    // Development only: a random per-process key. Sessions stop validating on
    // restart, which is honest behaviour and cannot be guessed by an attacker.
    console.warn(`[config] ${name} ${reason} — generating a temporary development key. Sign-ins will not survive a restart.`);
    return crypto.randomBytes(48).toString('base64url');
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
