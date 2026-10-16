/**
 * Employee-number validation.
 *
 * Business rule (HR spec 2c): a stored employee number is DIGITS ONLY.
 *   valid   : `1372`, `1604`, `0102`
 *   invalid : `EMP1604`, `BSC-1604`, `1604A`, `16 04`, ``
 *
 * The value stays a string everywhere it travels, so leading zeros survive.
 * This module is the single definition of the rule; the same predicate exists
 * as a MySQL CHECK (`employee_employeeCode_digits_only`, migration 025) so a
 * write that bypasses the API still cannot corrupt the identifier.
 */

/** Digits only, 1..30 characters, at least one non-zero digit or an explicit zero. */
export const EMPLOYEE_CODE_PATTERN = /^[0-9]+$/;
export const EMPLOYEE_CODE_MAX_LENGTH = 30;

export interface EmployeeCodeValidation {
  valid: boolean;
  /** Normalised value to store — same characters, no surrounding whitespace. */
  value: string;
  /** Stable machine-readable reason code. */
  code:
    | 'OK'
    | 'EMPTY'
    | 'NOT_DIGITS_ONLY'
    | 'HAS_WHITESPACE'
    | 'HAS_PUNCTUATION'
    | 'TOO_LONG'
    | 'ALL_ZERO';
  message: string;
}

function classify(raw: string): EmployeeCodeValidation['code'] {
  if (raw.length === 0) return 'EMPTY';
  if (EMPLOYEE_CODE_PATTERN.test(raw)) {
    if (raw.length > EMPLOYEE_CODE_MAX_LENGTH) return 'TOO_LONG';
    if (/^0+$/.test(raw)) return 'ALL_ZERO';
    return 'OK';
  }
  if (/\s/.test(raw)) return 'HAS_WHITESPACE';
  if (/[^0-9A-Za-z]/.test(raw)) return 'HAS_PUNCTUATION';
  return 'NOT_DIGITS_ONLY';
}

const MESSAGES: Record<EmployeeCodeValidation['code'], string> = {
  OK: 'Employee number accepted.',
  EMPTY: 'Employee number is required and must contain digits only.',
  NOT_DIGITS_ONLY: `Employee number must contain digits (0-9) only. Letters are not allowed — for example "1372" is valid and "EMP1372" is not.`,
  HAS_WHITESPACE: 'Employee number must not contain spaces or other whitespace.',
  HAS_PUNCTUATION:
    'Employee number must not contain punctuation such as "-", "/" or ".". Store "1604", not "BSC-1604".',
  TOO_LONG: `Employee number must be at most ${EMPLOYEE_CODE_MAX_LENGTH} digits.`,
  ALL_ZERO: 'Employee number must contain at least one non-zero digit.',
};

/** Validate an inbound employee number without altering its digits. */
export function validateEmployeeCode(input: unknown): EmployeeCodeValidation {
  const raw = typeof input === 'string' || typeof input === 'number' ? String(input).trim() : '';
  const code = classify(raw);
  return {
    valid: code === 'OK',
    value: raw,
    code,
    message: MESSAGES[code],
  };
}

/** Zod-friendly form: throws a descriptive error rather than a bare boolean. */
export function assertEmployeeCode(input: unknown): string {
  const result = validateEmployeeCode(input);
  if (!result.valid) {
    const err: Error & { code?: string; status?: number } = new Error(result.message);
    err.code = result.code;
    err.status = 422;
    throw err;
  }
  return result.value;
}

export function isEmployeeCodeValid(input: unknown): boolean {
  return validateEmployeeCode(input).valid;
}

/**
 * The digits embedded in a legacy identifier, as a PROPOSAL only.
 * `BSC-BEL-0102` proposes `0102`. Never auto-apply this without a uniqueness
 * check — `01` and `001` are the same number with different text, so a naive
 * rewrite can silently collide two employees.
 */
export function proposeDigitsFromLegacyCode(input: unknown): string | null {
  const raw = typeof input === 'string' ? input : '';
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length > 0 ? digits : null;
}

/** True when two employee numbers denote the same number despite different text. */
export function areSameEmployeeNumber(a: string, b: string): boolean {
  if (a === b) return true;
  const na = BigInt(a || '0');
  const nb = BigInt(b || '0');
  return na === nb;
}
