/**
 * Candidate Hiring — single source of truth for hiring validation.
 *
 * Shared verbatim by:
 *   * the backend (public submission endpoint, HR form builder, imports) and
 *   * the frontend (application form, form builder, candidate editor) through
 *     a TS path alias, so the browser and the server never disagree on rules.
 *
 * Contains only pure functions and plain data — no DB, no HTTP, no Node APIs.
 *
 * Security/PII notes:
 *   * `isValidAadhaar` performs the Verhoeff checksum so typo'd numbers are
 *     rejected before they reach storage; storage itself keeps only
 *     AES-256-GCM ciphertext + last-4 + HMAC (see hiringCrypto.ts).
 *   * `sniffMimeFromBuffer` checks file magic bytes so a renamed executable
 *     cannot pass the extension allow-list.
 *   * `validateHiringSubmission` drops hidden/unknown fields entirely, so a
 *     crafted payload cannot smuggle answers into conditionally hidden inputs.
 */

// ---------------------------------------------------------------------------
// Field / schema types — must stay in lockstep with hiring_form_version.schema
// ---------------------------------------------------------------------------

export type HiringFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'EMAIL'
  | 'PHONE'
  | 'DATE'
  | 'SELECT'
  | 'RADIO'
  | 'MULTISELECT'
  | 'CHECKBOX'
  | 'YES_NO'
  | 'FILE'
  | 'PHOTO'
  | 'AADHAAR'
  | 'PAN'
  | 'URL'
  | 'CURRENCY';

export const HIRING_FIELD_TYPES: HiringFieldType[] = [
  'TEXT', 'TEXTAREA', 'NUMBER', 'EMAIL', 'PHONE', 'DATE', 'SELECT', 'RADIO',
  'MULTISELECT', 'CHECKBOX', 'YES_NO', 'FILE', 'PHOTO', 'AADHAAR', 'PAN', 'URL', 'CURRENCY',
];

export interface HiringSelectOption {
  value: string;
  label: string;
}

export interface HiringFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minSelections?: number;
  maxSelections?: number;
  /** Named pattern (pincode|pan|aadhaar|phone|email|name|url) or a raw regex. */
  pattern?: string;
  patternMessage?: string;
  minAge?: number;
  maxAge?: number;
  /** ISO date (YYYY-MM-DD) or the literal 'today'. */
  minDate?: string;
  maxDate?: string;
  /** Lower-case file extensions without dots, e.g. ['pdf','docx']. */
  accept?: string[];
  maxSizeMB?: number;
}

export type HiringConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'gt'
  | 'lt'
  | 'is_answered'
  | 'is_empty';

export interface HiringCondition {
  fieldKey: string;
  operator: HiringConditionOperator;
  value?: unknown;
}

export interface HiringFormField {
  key: string;
  type: HiringFieldType;
  label: string;
  required?: boolean;
  width?: 'full' | 'half' | 'third';
  placeholder?: string;
  helpText?: string;
  options?: HiringSelectOption[];
  validation?: HiringFieldValidation;
  conditional?: HiringCondition;
  defaultValue?: unknown;
}

export interface HiringFormStep {
  key: string;
  title: string;
  description?: string;
  fields: HiringFormField[];
}

export interface HiringFormSchema {
  version?: number;
  steps: HiringFormStep[];
}

export interface HiringFileMeta {
  name: string;
  mime?: string | null;
  sizeBytes: number;
}

export interface HiringValidationResult {
  valid: boolean;
  /** fieldKey -> first user-facing error message. */
  errors: Record<string, string>;
  /** Sanitized values; hidden and unknown fields are removed. */
  values: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Primitive patterns
// ---------------------------------------------------------------------------

export const INDIAN_PHONE_PATTERN = /^[6-9]\d{9}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PINCODE_PATTERN = /^[1-9]\d{5}$/;
export const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
export const AADHAAR_PATTERN = /^[2-9]\d{11}$/;
export const PERSON_NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u;
export const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Valid 4th character of a PAN (holder type). */
const PAN_HOLDER_TYPES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/**
 * Normalize an Indian mobile number to bare 10 digits (or null when the input
 * cannot be interpreted). Accepts +91 / 91 / 0091 prefixes, spaces, dashes,
 * parentheses and dots. Does not validate the 6-9 start digit here — that is
 * `isValidPhone`'s job — so HR tooling can show the cleaned value even when
 * the prefix digit is wrong.
 */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/[\s()\-.]/g, '');
  if (!s) return null;
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('0091')) s = s.slice(4);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return /^\d+$/.test(s) ? s : null;
}

export function isValidPhone(raw: unknown): boolean {
  const digits = normalizePhone(raw);
  return digits !== null && INDIAN_PHONE_PATTERN.test(digits);
}

/** Format normalized digits for display: +91 98765 43210. */
export function formatPhone(raw: unknown): string | null {
  const digits = normalizePhone(raw);
  if (digits === null || digits.length !== 10) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export function normalizeEmail(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  return s || null;
}

export function isValidEmail(raw: unknown): boolean {
  const s = normalizeEmail(raw);
  return s !== null && s.length <= 190 && EMAIL_PATTERN.test(s);
}

// ---------------------------------------------------------------------------
// Pincode / URL
// ---------------------------------------------------------------------------

export function isValidPincode(raw: unknown): boolean {
  return PINCODE_PATTERN.test(String(raw ?? '').trim());
}

export function isValidUrl(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * Normalize a person name: collapse whitespace, trim. Digits and symbols other
 * than . ' - are rejected by `isValidName`.
 */
export function normalizeName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

export function isValidName(raw: unknown): boolean {
  const name = normalizeName(raw);
  if (name.length < 2 || name.length > 120) return false;
  if (!PERSON_NAME_PATTERN.test(name)) return false;
  return [...name].filter((ch) => /\p{L}/u.test(ch)).length >= 2;
}

// ---------------------------------------------------------------------------
// Aadhaar (Verhoeff) and PAN
// ---------------------------------------------------------------------------

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffChecksum(digits: string): number {
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  }
  return c;
}

/** Strip spaces/dashes from an Aadhaar input. */
export function normalizeAadhaar(raw: unknown): string {
  return String(raw ?? '').replace(/[\s-]/g, '');
}

/**
 * Full Aadhaar validation: 12 digits, leading digit 2-9 (UIDAI never issues
 * 0/1-led numbers), not a single repeated digit, and a valid Verhoeff check
 * digit. Test numbers like 123456789012 fail the checksum.
 */
export function isValidAadhaar(raw: unknown): boolean {
  const digits = normalizeAadhaar(raw);
  if (!AADHAAR_PATTERN.test(digits)) return false;
  if (/^(\d)\1{11}$/.test(digits)) return false;
  return verhoeffChecksum(digits) === 0;
}

export function normalizePan(raw: unknown): string {
  return String(raw ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/** PAN: AAAAA9999A, with the 4th character in the official holder-type set. */
export function isValidPan(raw: unknown): boolean {
  const pan = normalizePan(raw);
  if (!PAN_PATTERN.test(pan)) return false;
  return PAN_HOLDER_TYPES.has(pan[3]);
}

export function maskAadhaar(value: unknown): string {
  const digits = normalizeAadhaar(value);
  if (digits.length !== 12) return 'XXXX XXXX XXXX';
  return `XXXX XXXX ${digits.slice(-4)}`;
}

export function maskPan(value: unknown): string {
  const pan = normalizePan(value);
  if (pan.length !== 10) return 'XXXXXXXXXX';
  return `${pan.slice(0, 1)}XXXX${pan.slice(5, 9)}${pan.slice(9)}`;
}

// ---------------------------------------------------------------------------
// Dates and ages
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Parse YYYY-MM-DD into a UTC Date, or null when not a real calendar date. */
export function parseIsoDate(raw: unknown): Date | null {
  const s = String(raw ?? '').trim();
  if (!DATE_ISO_PATTERN.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Completed years between a birth date and a reference date. */
export function ageAt(dob: Date, reference: Date = new Date()): number {
  let age = reference.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function isValidDob(raw: unknown, opts: { minAge?: number; maxAge?: number } = {}): boolean {
  const date = parseIsoDate(raw);
  if (!date) return false;
  const age = ageAt(date);
  if (opts.minAge !== undefined && age < opts.minAge) return false;
  if (opts.maxAge !== undefined && age > opts.maxAge) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Files — metadata + magic bytes
// ---------------------------------------------------------------------------

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
};

export function fileExtension(name: unknown): string {
  const s = String(name ?? '');
  const dot = s.lastIndexOf('.');
  return dot === -1 ? '' : s.slice(dot + 1).toLowerCase();
}

export interface FileValidationRule {
  accept?: string[];
  maxSizeMB?: number;
}

export function validateFileMeta(file: HiringFileMeta, rule: FileValidationRule = {}): string | null {
  const ext = fileExtension(file.name);
  const accept = (rule.accept ?? ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']).map((e) => e.toLowerCase());
  if (!ext || !accept.includes(ext)) {
    return `File type .${ext || '?'} is not allowed. Allowed: ${accept.join(', ')}`;
  }
  const maxMb = rule.maxSizeMB ?? 5;
  if (file.sizeBytes <= 0) return 'File is empty';
  if (file.sizeBytes > maxMb * 1024 * 1024) return `File exceeds the ${maxMb} MB limit`;
  if (file.mime) {
    const expected = MIME_BY_EXTENSION[ext];
    if (expected && !expected.includes(file.mime)) {
      return `File content type ${file.mime} does not match .${ext}`;
    }
  }
  return null;
}

/**
 * Detect a file type from its leading bytes. Returns a canonical extension or
 * null. docx is a ZIP container; doc is an OLE compound file.
 */
export function sniffExtensionFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 8) return null;
  const hex = buffer.subarray(0, 8).toString('hex').toLowerCase();
  if (hex.startsWith('25504446')) return 'pdf'; // %PDF
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (hex.startsWith('89504e47')) return 'png';
  if (buffer.subarray(0, 4).toString('hex') === '52494646' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (hex.startsWith('504b0304')) return 'zip'; // docx/xlsx are zips — caller checks extension
  if (hex.startsWith('d0cf11e0a1b11ae1')) return 'doc';
  return null;
}

// ---------------------------------------------------------------------------
// Conditional logic
// ---------------------------------------------------------------------------

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
    return na === nb;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function evaluateCondition(condition: HiringCondition | undefined, values: Record<string, unknown>): boolean {
  if (!condition || !condition.fieldKey) return true;
  const actual = values[condition.fieldKey];
  switch (condition.operator) {
    case 'is_answered':
      return isAnswered(actual);
    case 'is_empty':
      return !isAnswered(actual);
    case 'equals':
      return looseEquals(actual, condition.value);
    case 'not_equals':
      return !looseEquals(actual, condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.some((v) => looseEquals(actual, v));
    case 'not_in':
      return !(Array.isArray(condition.value) && condition.value.some((v) => looseEquals(actual, v)));
    case 'contains': {
      if (Array.isArray(actual)) return actual.some((v) => looseEquals(v, condition.value));
      return isAnswered(actual) && String(actual).toLowerCase().includes(String(condition.value).toLowerCase());
    }
    case 'gt':
      return Number(actual) > Number(condition.value);
    case 'lt':
      return Number(actual) < Number(condition.value);
    default:
      return true;
  }
}

/** Fields visible for the given (already sanitized) values, in declaration order. */
export function visibleFields(schema: HiringFormSchema, values: Record<string, unknown>): HiringFormField[] {
  const flat = flattenFields(schema);
  let visibleValues: Record<string, unknown> = { ...values };
  let visible = flat.filter((f) => evaluateCondition(f.conditional, visibleValues));
  // Resolve chained conditions (a shows b shows c) by iterating until stable.
  for (let pass = 0; pass < 4; pass++) {
    const nextValues: Record<string, unknown> = {};
    for (const f of visible) {
      if (f.key in values) nextValues[f.key] = values[f.key];
    }
    const nextVisible = flat.filter((f) => evaluateCondition(f.conditional, nextValues));
    if (nextVisible.length === visible.length) break;
    visible = nextVisible;
    visibleValues = nextValues;
  }
  return visible;
}

export function flattenFields(schema: HiringFormSchema): HiringFormField[] {
  const fields: HiringFormField[] = [];
  for (const step of schema?.steps ?? []) {
    for (const field of step.fields ?? []) fields.push(field);
  }
  return fields;
}

/** All field keys declared by a schema (for unknown-key detection, exports). */
export function schemaFieldKeys(schema: HiringFormSchema): string[] {
  return flattenFields(schema).map((f) => f.key);
}

// ---------------------------------------------------------------------------
// Pattern-driven scalar validation
// ---------------------------------------------------------------------------

const NAMED_PATTERNS: Record<string, { test: (v: string) => boolean; message: string }> = {
  pincode: { test: (v) => PINCODE_PATTERN.test(v), message: 'Enter a valid 6-digit PIN code' },
  pan: { test: (v) => isValidPan(v), message: 'Enter a valid PAN (e.g. ABCDE1234F)' },
  aadhaar: { test: (v) => isValidAadhaar(v), message: 'Enter a valid 12-digit Aadhaar number' },
  phone: { test: (v) => isValidPhone(v), message: 'Enter a valid 10-digit Indian mobile number' },
  email: { test: (v) => isValidEmail(v), message: 'Enter a valid email address' },
  name: { test: (v) => isValidName(v), message: 'Enter a valid name' },
  url: { test: (v) => isValidUrl(v), message: 'Enter a valid http(s) URL' },
};

function testCustomPattern(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true; // a bad HR-authored pattern must not block submissions
  }
}

// ---------------------------------------------------------------------------
// Submission validation
// ---------------------------------------------------------------------------

interface FieldCheckContext {
  field: HiringFormField;
  value: unknown;
  file?: HiringFileMeta;
}

function coerceByType(field: HiringFormField, value: unknown): { ok: true; value: unknown } | { ok: false; message: string } {
  const label = field.label || field.key;
  switch (field.type) {
    case 'NUMBER':
    case 'CURRENCY': {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) return { ok: false, message: `${label} must be a number` };
      return { ok: true, value: n };
    }
    case 'MULTISELECT':
      if (!Array.isArray(value)) return { ok: false, message: `${label} must be a list` };
      return { ok: true, value: value.map((v) => String(v)) };
    case 'CHECKBOX':
    case 'YES_NO':
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === 1 || value === '1') return { ok: true, value: true };
      if (value === 'false' || value === 0 || value === '0') return { ok: true, value: false };
      return { ok: false, message: `${label} must be yes or no` };
    case 'DATE': {
      const s = String(value).trim();
      return parseIsoDate(s) ? { ok: true, value: s } : { ok: false, message: `${label} must be a valid date (YYYY-MM-DD)` };
    }
    case 'PHONE': {
      const digits = normalizePhone(value);
      if (digits === null) return { ok: false, message: `${label} must contain digits only` };
      return { ok: true, value: digits };
    }
    case 'EMAIL': {
      const email = normalizeEmail(value);
      if (email === null) return { ok: false, message: `${label} is required` };
      return { ok: true, value: email };
    }
    case 'AADHAAR':
      return { ok: true, value: normalizeAadhaar(value) };
    case 'PAN':
      return { ok: true, value: normalizePan(value) };
    case 'SELECT':
    case 'RADIO': {
      const s = String(value).trim();
      if (field.options?.length && !field.options.some((o) => o.value === s)) {
        return { ok: false, message: `Choose a valid ${label}` };
      }
      return { ok: true, value: s };
    }
    default:
      return { ok: true, value: String(value).trim() };
  }
}

function checkRules(field: HiringFormField, value: unknown): string | null {
  const rules = field.validation ?? {};
  const label = field.label || field.key;

  if (typeof value === 'string') {
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return `${label} must be at least ${rules.minLength} characters`;
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) return `${label} is too long`;
    if (field.type === 'EMAIL' && !isValidEmail(value)) return 'Enter a valid email address';
    if (field.type === 'PHONE' && !isValidPhone(value)) return 'Enter a valid 10-digit Indian mobile number';
    if (field.type === 'AADHAAR' && value && !isValidAadhaar(value)) return 'Enter a valid 12-digit Aadhaar number';
    if (field.type === 'PAN' && value && !isValidPan(value)) return 'Enter a valid PAN (e.g. ABCDE1234F)';
    if (field.type === 'URL' && !isValidUrl(value)) return 'Enter a valid http(s) URL';
  }

  if (typeof value === 'number') {
    if (rules.min !== undefined && value < rules.min) return `${label} must be at least ${rules.min}`;
    if (rules.max !== undefined && value > rules.max) return `${label} must be at most ${rules.max}`;
  }

  if (Array.isArray(value)) {
    if (rules.minSelections !== undefined && value.length < rules.minSelections) {
      return `Select at least ${rules.minSelections} option(s) for ${label}`;
    }
    if (rules.maxSelections !== undefined && value.length > rules.maxSelections) {
      return `Select at most ${rules.maxSelections} option(s) for ${label}`;
    }
  }

  if (rules.minAge !== undefined || rules.maxAge !== undefined) {
    if (!isValidDob(value, { minAge: rules.minAge, maxAge: rules.maxAge })) {
      if (rules.minAge !== undefined && rules.maxAge !== undefined) return `Age must be between ${rules.minAge} and ${rules.maxAge}`;
      if (rules.minAge !== undefined) return `Minimum age is ${rules.minAge}`;
      return `Maximum age is ${rules.maxAge}`;
    }
  }
  if (rules.minDate || rules.maxDate) {
    const date = parseIsoDate(value);
    if (!date) return `${label} must be a valid date`;
    const resolve = (v: string) => (v === 'today' ? parseIsoDate(todayIso())! : parseIsoDate(v));
    const min = rules.minDate ? resolve(rules.minDate) : null;
    const max = rules.maxDate ? resolve(rules.maxDate) : null;
    if (min && date.getTime() < min.getTime()) return `${label} must be on or after ${rules.minDate}`;
    if (max && date.getTime() > max.getTime()) return `${label} must be on or before ${rules.maxDate}`;
  }

  if (rules.pattern && typeof value === 'string' && value) {
    const named = NAMED_PATTERNS[rules.pattern];
    if (named) {
      if (!named.test(value)) return rules.patternMessage || named.message;
    } else if (!testCustomPattern(rules.pattern, value)) {
      return rules.patternMessage || `${label} has an invalid format`;
    }
  }

  return null;
}

function isEmptyIncoming(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Validate a public submission against a form schema.
 *
 * @param schema  Published form schema (hiring_form_version.schema).
 * @param rawValues  Candidate payload, keyed by field key.
 * @param files   Uploaded file metadata, keyed by field key.
 */
export function validateHiringSubmission(
  schema: HiringFormSchema,
  rawValues: Record<string, unknown>,
  files: Record<string, HiringFileMeta> = {}
): HiringValidationResult {
  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const flat = flattenFields(schema);

  const provided: Record<string, unknown> = {};
  for (const field of flat) {
    if (field.key in rawValues) provided[field.key] = rawValues[field.key];
    else if (field.key in files) provided[field.key] = files[field.key].name;
    else if (field.defaultValue !== undefined) provided[field.key] = field.defaultValue;
  }

  const visible = visibleFields(schema, provided);
  const visibleKeys = new Set(visible.map((f) => f.key));

  for (const field of flat) {
    if (!visibleKeys.has(field.key)) {
      // Hidden fields are dropped even if the client sent a value.
      continue;
    }
    const meta = files[field.key];
    const raw = rawValues[field.key];

    if (field.type === 'FILE' || field.type === 'PHOTO') {
      if (!meta) {
        if (field.required) errors[field.key] = `${field.label || field.key} is required`;
        continue;
      }
      const fileError = validateFileMeta(meta, field.validation);
      if (fileError) {
        errors[field.key] = fileError;
        continue;
      }
      values[field.key] = { name: meta.name, mime: meta.mime ?? null, sizeBytes: meta.sizeBytes };
      continue;
    }

    if (isEmptyIncoming(raw)) {
      if (field.defaultValue !== undefined) {
        const coerced = coerceByType(field, field.defaultValue);
        if (coerced.ok) values[field.key] = coerced.value;
        continue;
      }
      if (field.required) {
        if (field.type === 'CHECKBOX') errors[field.key] = `Please tick ${field.label || field.key}`;
        else errors[field.key] = `${field.label || field.key} is required`;
      }
      continue;
    }

    if (field.required && field.type === 'CHECKBOX') {
      const coerced = coerceByType(field, raw);
      if (coerced.ok && coerced.value !== true) {
        errors[field.key] = `Please tick ${field.label || field.key}`;
        continue;
      }
    }

    const coerced = coerceByType(field, raw);
    if (!coerced.ok) {
      errors[field.key] = coerced.message;
      continue;
    }
    const ruleError = checkRules(field, coerced.value);
    if (ruleError) {
      errors[field.key] = ruleError;
      continue;
    }
    values[field.key] = coerced.value;
  }

  return { valid: Object.keys(errors).length === 0, errors, values };
}

// ---------------------------------------------------------------------------
// Downstream helpers
// ---------------------------------------------------------------------------

export interface ApplicationSummary {
  fullName?: string;
  phone?: string;
  email?: string;
  city?: string;
  positionApplied?: string;
  experienceYears?: number;
  expectedSalary?: number;
  [key: string]: unknown;
}

const SUMMARY_KNOWN_KEYS = ['fullName', 'phone', 'email', 'city', 'positionApplied', 'experienceYears', 'retailExperienceYears', 'expectedSalary'];

/**
 * Build the denormalised `application.summary` JSON so list views render
 * without joining application_answer.
 */
export function summarizeSubmission(schema: HiringFormSchema, values: Record<string, unknown>): ApplicationSummary {
  const summary: ApplicationSummary = {};
  const flat = flattenFields(schema);

  for (const key of SUMMARY_KNOWN_KEYS) {
    const field = flat.find((f) => f.key === key);
    if (!field || !(key in values)) continue;
    const value = values[key];
    if (key === 'experienceYears' || key === 'retailExperienceYears' || key === 'expectedSalary') {
      if (typeof value === 'number') summary[key] = value;
    } else {
      summary[field.key] = value;
    }
  }

  if (!summary.fullName) {
    const nameField = flat.find((f) => f.type === 'TEXT' && /name/i.test(f.key));
    if (nameField && typeof values[nameField.key] === 'string') summary.fullName = values[nameField.key] as string;
  }
  if (!summary.phone) {
    const phoneField = flat.find((f) => f.type === 'PHONE');
    if (phoneField && typeof values[phoneField.key] === 'string') {
      const display = formatPhone(values[phoneField.key]);
      if (display) summary.phone = display;
    }
  }

  return summary;
}

/** Canonical stage list — ordered the way the Kanban renders columns. */
export const APPLICATION_STAGES = [
  'NEW',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEWED',
  'SELECTED',
  'OFFERED',
  'OFFER_ACCEPTED',
  'HIRED',
  'ON_HOLD',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const ACTIVE_STAGES: ApplicationStage[] = [
  'NEW', 'SCREENING', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'SELECTED', 'OFFERED', 'OFFER_ACCEPTED', 'HIRED', 'ON_HOLD',
];

export function isApplicationStage(value: unknown): value is ApplicationStage {
  return typeof value === 'string' && (APPLICATION_STAGES as readonly string[]).includes(value);
}

/** Illegal transitions blocked at the service layer (any -> REJECTED/WITHDRAWN is allowed). */
const TERMINAL_STAGES = new Set<string>(['HIRED', 'REJECTED', 'WITHDRAWN']);

export function isTerminalStage(stage: string): boolean {
  return TERMINAL_STAGES.has(stage);
}

export function canTransitionStage(from: string, to: string): boolean {
  if (from === to) return false;
  if (!isApplicationStage(from) || !isApplicationStage(to)) return false;
  if (isTerminalStage(from)) return false; // terminal stages are final for the pipeline
  return true;
}

// ---------------------------------------------------------------------------
// Form-schema structural validation (HR builder)
// ---------------------------------------------------------------------------

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FILE_OPTION_TYPES = new Set<HiringFieldType>(['SELECT', 'RADIO', 'MULTISELECT']);
const FILE_ONLY_TYPES = new Set<HiringFieldType>(['FILE', 'PHOTO']);

/**
 * Validate a form schema authored in the builder. Returns a list of
 * human-readable errors; empty means publishable.
 */
export function validateHiringFormSchema(schema: HiringFormSchema): string[] {
  const errors: string[] = [];
  if (!schema || !Array.isArray(schema.steps) || schema.steps.length === 0) {
    return ['Form must contain at least one step'];
  }
  if (schema.steps.length > 20) errors.push('Form cannot have more than 20 steps');

  const seenKeys = new Set<string>();
  const allKeys = new Set<string>();
  for (const step of schema.steps) {
    for (const field of step.fields ?? []) allKeys.add(field.key);
  }

  schema.steps.forEach((step, stepIndex) => {
    const stepLabel = step.title || `Step ${stepIndex + 1}`;
    if (!step.key || !KEY_PATTERN.test(step.key)) errors.push(`${stepLabel}: step key is not valid`);
    if (!step.title || !step.title.trim()) errors.push(`Step ${stepIndex + 1}: title is required`);
    if (!Array.isArray(step.fields) || step.fields.length === 0) {
      errors.push(`${stepLabel}: add at least one field`);
      return;
    }
    if (step.fields.length > 50) errors.push(`${stepLabel}: too many fields in one step (max 50)`);

    step.fields.forEach((field, fieldIndex) => {
      const label = field.label || field.key || `${stepLabel} field ${fieldIndex + 1}`;
      if (!field.key || !KEY_PATTERN.test(field.key)) {
        errors.push(`${stepLabel}: field key "${field.key ?? ''}" is invalid (letters, digits, underscore; must start with a letter)`);
      } else if (seenKeys.has(field.key)) {
        errors.push(`${stepLabel}: duplicate field key "${field.key}"`);
      } else {
        seenKeys.add(field.key);
      }
      if (!field.label || !field.label.trim()) errors.push(`${stepLabel}: field "${field.key}" needs a label`);
      if (!HIRING_FIELD_TYPES.includes(field.type)) {
        errors.push(`${label}: unknown field type "${field.type}"`);
      }
      if (FILE_OPTION_TYPES.has(field.type)) {
        if (!field.options || field.options.length === 0) {
          errors.push(`${label}: add at least one option`);
        } else {
          const values = new Set<string>();
          for (const opt of field.options) {
            if (!opt.value || !opt.label) errors.push(`${label}: every option needs a value and label`);
            if (values.has(opt.value)) errors.push(`${label}: duplicate option value "${opt.value}"`);
            values.add(opt.value);
          }
        }
      }
      if (!FILE_OPTION_TYPES.has(field.type) && field.options?.length) {
        errors.push(`${label}: options are only allowed for select-style fields`);
      }
      if (FILE_ONLY_TYPES.has(field.type) && field.validation?.pattern) {
        errors.push(`${label}: files cannot use text patterns`);
      }
      if (field.conditional) {
        if (!field.conditional.fieldKey) {
          errors.push(`${label}: conditional rule needs a source field`);
        } else if (!allKeys.has(field.conditional.fieldKey)) {
          errors.push(`${label}: condition references unknown field "${field.conditional.fieldKey}"`);
        } else if (field.conditional.fieldKey === field.key) {
          errors.push(`${label}: a field cannot depend on itself`);
        }
        if (!['equals', 'not_equals', 'in', 'not_in', 'contains', 'gt', 'lt', 'is_answered', 'is_empty'].includes(field.conditional.operator)) {
          errors.push(`${label}: condition operator "${field.conditional.operator}" is not supported`);
        }
      }
      const rules = field.validation;
      if (rules) {
        if (rules.minLength !== undefined && rules.maxLength !== undefined && rules.minLength > rules.maxLength) {
          errors.push(`${label}: minimum length cannot exceed maximum length`);
        }
        if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
          errors.push(`${label}: minimum cannot exceed maximum`);
        }
        if (rules.minSelections !== undefined && rules.maxSelections !== undefined && rules.minSelections > rules.maxSelections) {
          errors.push(`${label}: minimum selections cannot exceed maximum selections`);
        }
        if (rules.pattern) {
          const named = ['pincode', 'pan', 'aadhaar', 'phone', 'email', 'name', 'url'].includes(rules.pattern);
          if (!named) {
            try {
              new RegExp(rules.pattern);
            } catch {
              errors.push(`${label}: pattern is not a valid regular expression`);
            }
          }
        }
      }
    });
  });

  return errors;
}
