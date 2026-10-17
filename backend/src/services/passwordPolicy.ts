/**
 * Password policy — the rules a credential must satisfy before it is hashed.
 *
 * Length and character classes are the easy part. The checks that actually stop
 * a weak account are the identity-bound ones (no login ID, name or company word
 * inside the password) and the breached-password blocklist, because a
 * "strong-looking" password that appears in a leak corpus is already public.
 *
 * `evaluate()` is what the Admin's strength meter consumes, so it returns a
 * score and per-rule feedback rather than only a boolean.
 */
import crypto from 'node:crypto';
import { securityConfig } from '../config/security.js';

export interface PolicyContext {
  loginId?: string | null;
  fullName?: string | null;
  email?: string | null;
}

export interface PolicyEvaluation {
  valid: boolean;
  errors: string[];
  /** 0–4, drives the Admin UI meter. */
  score: number;
  label: 'very weak' | 'weak' | 'fair' | 'strong' | 'excellent';
  /** Entropy estimate in bits, from the character classes actually used. */
  entropyBits: number;
  checks: Record<string, boolean>;
}

/**
 * The blocklist is embedded rather than downloaded: the app must reject the
 * obvious passwords on an air-gapped site, and HaveIBeenPwned (checked
 * separately, when reachable) covers the long tail.
 */
const COMMON_PASSWORDS = new Set(
  `password password1 password12 password123 password1234 password@123 passw0rd p@ssword p@ssw0rd
   admin admin123 admin1 admin@123 administrator root toor system manager
   letmein letmein1 monkey dragon sunshine princess football baseball iloveyou
   welcome welcome1 welcome@123 hello hello123 friend
   qwerty qwerty123 qwertyuiop asdfghjkl zxcvbnm 123456 123456789 12345678
   11111111 000000 abc123 abcd1234 a1b2c3d4 test test123 testing demo123
   changeit changeme default secret123 company company1 bsc bsctextiles
   textile textiles sari silk mill factory
   iloveyou1 love123 trustno1 batman superman spiderman pokemon minecraft
   summer2020 winter2021 spring2022 autumn2023 summer2024 winter2025 spring2026
   monkey123 shadow123 master master123 login login123 hello1234
   pass pass1 pass12 pass1234 passwor password1! p@ssword1
   1q2w3e4r 1qaz2wsx qazwsx q1w2e3r4 zaq12wsx aaaaaa abcdef
   hunter2 hunter12 hockey123 football1 blahblah braves bandits
   1234 12345 1234567 1234567890 123321 654321 666666 888888
   a123456 ab123456 aa111111 121212 131313 qwertyui opasdfgh
   password2020 password2021 password2022 password2023 password2024 password2025
   admin2024 admin2025 admin2026 hr123456 payroll123 india123 india@123`
    .split(/\s+/)
    .filter(Boolean)
);

/** Characters the policy treats as "special"; mirrors the class check below. */
const SPECIAL_CLASS = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;

function characterPool(password: string): number {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (SPECIAL_CLASS.test(password)) pool += 32;
  return pool || 1;
}

function entropyBits(password: string): number {
  // Penalise a single repeated character class run (aaaa…, 1234…) by halving.
  const base = password.length * Math.log2(characterPool(password));
  const collapsed = /(\w)\1{3,}|0123|1234|2345|3456|4567|5678|6789|abcd|qwert/i.test(password);
  return Math.round(collapsed ? base / 2 : base);
}

/** Everything a password must not be built out of, in identity order. */
function identityFragments(context: PolicyContext): string[] {
  const fragments = new Set<string>();
  const add = (raw?: string | null) => {
    const value = String(raw || '').toLowerCase().trim();
    if (!value) return;
    fragments.add(value);
    for (const part of value.split(/[\s._@\-/]+/)) {
      if (part.length >= 3) fragments.add(part);
    }
    // A trailing digit run is the usual way "kavita@123" slips past a name check.
    const stripped = value.replace(/[^a-z]/g, '');
    if (stripped.length >= 3) fragments.add(stripped);
  };
  add(context.loginId);
  add(context.email);
  add(context.fullName);
  add('bsctextiles');
  add('bsc');
  add('textiles');
  return [...fragments].filter((f) => f.length >= 3);
}

export function evaluate(password: string, context: PolicyContext = {}): PolicyEvaluation {
  const cfg = securityConfig.password;
  const value = password || '';
  const lower = value.toLowerCase();
  const errors: string[] = [];
  const checks: Record<string, boolean> = {};

  checks.length = value.length >= cfg.minLength;
  if (!checks.length) errors.push(`Use at least ${cfg.minLength} characters`);

  checks.uppercase = /[A-Z]/.test(value);
  if (!checks.uppercase) errors.push('Add an uppercase letter');

  checks.lowercase = /[a-z]/.test(value);
  if (!checks.lowercase) errors.push('Add a lowercase letter');

  checks.number = /[0-9]/.test(value);
  if (!checks.number) errors.push('Add a number');

  checks.special = SPECIAL_CLASS.test(value);
  if (!checks.special) errors.push('Add a special character');

  checks.notCommon = !COMMON_PASSWORDS.has(lower) && !COMMON_PASSWORDS.has(lower.replace(/[0-9!@#$%^*]/g, ''));
  if (!checks.notCommon) errors.push('That password is too common');

  checks.notSequential = !/(.)\1{3,}/.test(value) && !/^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(value);
  if (!checks.notSequential) errors.push('Avoid repeated or sequential characters');

  const fragments = identityFragments(context);
  const identityHit = fragments.find((fragment) => lower.includes(fragment));
  checks.notIdentity = !identityHit;
  if (cfg.blockUsername && identityHit) {
    errors.push('Password must not contain your login ID, name or the company name');
  }

  const entropy = entropyBits(value);
  checks.entropy = entropy >= 60;

  const passed = errors.length === 0;
  let score = 0;
  if (passed) {
    score = 1;
    if (value.length >= cfg.minLength + 4) score = 2;
    if (entropy >= 75) score = 3;
    if (entropy >= 105) score = 4;
  } else if (checks.length && checks.notCommon) {
    score = 1;
  }

  const labels: PolicyEvaluation['label'][] = ['very weak', 'weak', 'fair', 'strong', 'excellent'];

  return { valid: passed, errors, score, label: labels[score], entropyBits: entropy, checks };
}

export function assertAcceptable(password: string, context: PolicyContext = {}): void {
  const result = evaluate(password, context);
  if (!result.valid) {
    const err: any = new Error(result.errors.join('. '));
    err.code = 'PASSWORD_POLICY_FAILED';
    err.details = result;
    throw err;
  }
}

/**
 * Offline breach screen. The online HaveIBeenPwned check in `PasswordService`
 * adds the long tail when the site has internet; this list is the part that
 * must work without it.
 */
export function isKnownBreached(password: string): boolean {
  return COMMON_PASSWORDS.has((password || '').toLowerCase());
}

const WORDS = ['silk', 'loom', 'warp', 'weft', 'mill', 'dye', 'yarn', 'spool', 'shed', 'reed'];
const SYMBOLS = ['@', '#', '%', '&', '!', '?', '+', '-'];

function pick<T>(list: T[]): T {
  return list[crypto.randomInt(list.length)];
}

/**
 * Temporary password for Admin-issued credentials: four random words plus a
 * capitalised word, digits and symbols, so it clears the policy by construction
 * rather than by luck. Shown exactly once.
 */
export function generateTemporaryPassword(): string {
  const capitalised = pick(WORDS).charAt(0).toUpperCase() + pick(WORDS).slice(1);
  const body = `${pick(WORDS)}-${capitalised}-${pick(WORDS)}`;
  return `${body}-${String(crypto.randomInt(10, 100))}${pick(SYMBOLS)}`;
}

export function passwordExpiryDate(from = new Date()): Date | null {
  const days = securityConfig.password.expiryDays;
  if (!days || days <= 0) return null;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isExpired(user: { passwordExpiresAt?: Date | string | null }): boolean {
  const raw = user?.passwordExpiresAt;
  if (!raw) return false;
  const expires = raw instanceof Date ? raw : new Date(raw);
  return expires.getTime() < Date.now();
}

/** Days until forced rotation; null when expiry is disabled. */
export function daysUntilExpiry(user: { passwordExpiresAt?: Date | string | null }): number | null {
  const days = securityConfig.password.expiryDays;
  const raw = user?.passwordExpiresAt;
  if (!days || !raw) return null;
  const expires = raw instanceof Date ? raw : new Date(raw);
  return Math.ceil((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
