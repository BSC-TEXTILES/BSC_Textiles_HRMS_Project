/**
 * Self-hosted CAPTCHA.
 *
 * After a couple of failed sign-ins the login form requires a challenge, which
 * raises the cost of password spraying from "one HTTP loop" to "render and read
 * an image". It is generated and verified server-side with no third party, so
 * it works on an air-gapped site and leaks nothing about who is signing in.
 *
 * Answers are stored hashed and are single-use: a captured challenge cannot be
 * replayed after it has been spent.
 */
import crypto from 'node:crypto';
import { securityConfig } from '../config/security.js';
import { KEY_PREFIX, storeDel, storeGet, storeSetNx } from './redisStore.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity
const CHALLENGE_TTL_SECONDS = 300;
const WIDTH = 220;
const HEIGHT = 72;

export interface CaptchaChallenge {
  captchaId: string;
  svg: string;
  expiresInSeconds: number;
}

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

function renderSvg(code: string): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Enter the characters shown">`
  );
  parts.push(`<rect width="100%" height="100%" fill="#f4f6fb"/>`);

  // Noise: lines and dots so simple OCR thresholding does not isolate the text.
  for (let i = 0; i < 6; i++) {
    const x1 = crypto.randomInt(0, WIDTH);
    const y1 = crypto.randomInt(0, HEIGHT);
    const x2 = crypto.randomInt(0, WIDTH);
    const y2 = crypto.randomInt(0, HEIGHT);
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b6c2dd" stroke-width="1.4"/>`);
  }
  for (let i = 0; i < 40; i++) {
    parts.push(`<circle cx="${crypto.randomInt(0, WIDTH)}" cy="${crypto.randomInt(0, HEIGHT)}" r="1.2" fill="#c8d2e8"/>`);
  }

  const step = (WIDTH - 40) / code.length;
  code.split('').forEach((char, index) => {
    const x = 22 + index * step + crypto.randomInt(-4, 5);
    const y = HEIGHT / 2 + crypto.randomInt(-7, 8);
    const rotate = crypto.randomInt(-22, 23);
    const size = crypto.randomInt(26, 34);
    const fill = ['#1346a1', '#0b3c74', '#1d4e89', '#243b62'][crypto.randomInt(4)];
    parts.push(
      `<text x="${x}" y="${y}" font-family="Verdana, DejaVu Sans, sans-serif" font-size="${size}" font-weight="700" fill="${fill}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`
    );
  });

  parts.push('</svg>');
  return parts.join('');
}

export async function issueCaptcha(): Promise<CaptchaChallenge> {
  const code = randomCode(5);
  const captchaId = crypto.randomBytes(12).toString('base64url');
  await storeSetNx(`${KEY_PREFIX.captcha}${captchaId}`, hashAnswer(code), CHALLENGE_TTL_SECONDS * 1000);
  return { captchaId, svg: renderSvg(code), expiresInSeconds: CHALLENGE_TTL_SECONDS };
}

function hashAnswer(answer: string): string {
  return crypto.createHash('sha256').update(answer.toUpperCase().trim()).digest('hex');
}

/**
 * Verifies and consumes a challenge. Always returns false for an unknown or
 * spent id, so a caller cannot tell the two apart.
 */
export async function verifyCaptcha(captchaId: string, answer: string): Promise<boolean> {
  const key = `${KEY_PREFIX.captcha}${(captchaId || '').trim()}`;
  if (!captchaId || !answer) return false;
  const stored = await storeGet(key);
  if (!stored) return false;
  await storeDel(key);
  const expected = Buffer.from(stored, 'utf8');
  const provided = Buffer.from(hashAnswer(answer), 'utf8');
  // Constant-time: the comparison itself must not leak how much matched.
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

/** Whether a captcha is required yet for this many failed attempts. */
export function captchaRequiredFor(attempts: number): boolean {
  return attempts >= securityConfig.login.captchaAfter;
}
