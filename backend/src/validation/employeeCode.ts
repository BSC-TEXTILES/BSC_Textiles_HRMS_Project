/**
 * Employee number (employeeCode) rules — shared by every write path.
 *
 * The employee number is an **identifier, not a quantity**:
 *  - it is stored as a string (`employee.employeeCode varchar(191)`, UNIQUE),
 *    never cast to a number, so leading zeros survive round-trips;
 *  - it must contain digits only: `1372`, `1604` are valid, `EMP1604`,
 *    `BSC-1604`, `DAV-1604`, `1604A` are not.
 *
 * Legacy rows that do not follow the rule are never rewritten here — they are
 * reported through the data-quality audit (`NON_NUMERIC_EMPLOYEE_ID`) so HR can
 * correct them deliberately (see `runDataQualityAudit`).
 */

export const EMPLOYEE_CODE_PATTERN = /^[0-9]+$/;
export const EMPLOYEE_CODE_MIN_LENGTH = 1;
export const EMPLOYEE_CODE_MAX_LENGTH = 20;

export const EMPLOYEE_CODE_RULE =
  'Employee number must contain digits only (e.g. 1372 or 1604). Letters, spaces and special characters are not allowed.';

export interface EmployeeCodeValidation {
  ok: boolean;
  /** Trimmed value — only trustworthy when `ok` is true. */
  code: string;
  error?: string;
}

/**
 * Validate an employee number supplied by a client or an import file.
 *
 * Surrounding whitespace (copy/paste artefacts) is trimmed before validation,
 * but any whitespace *inside* the value is rejected by the digits-only rule.
 * The value is returned as a string so leading zeros are preserved.
 */
export function validateEmployeeCode(value: unknown): EmployeeCodeValidation {
  if (value === null || value === undefined) {
    return { ok: false, code: '', error: `Employee number is required. ${EMPLOYEE_CODE_RULE}` };
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { ok: false, code: '', error: `Employee number must be text. ${EMPLOYEE_CODE_RULE}` };
  }

  const raw = typeof value === 'number' ? String(value) : value;
  const code = raw.trim();

  if (!code) {
    return { ok: false, code: '', error: `Employee number is required. ${EMPLOYEE_CODE_RULE}` };
  }
  if (code.length < EMPLOYEE_CODE_MIN_LENGTH || code.length > EMPLOYEE_CODE_MAX_LENGTH) {
    return {
      ok: false,
      code,
      error: `Employee number must be between ${EMPLOYEE_CODE_MIN_LENGTH} and ${EMPLOYEE_CODE_MAX_LENGTH} digits.`,
    };
  }
  if (!EMPLOYEE_CODE_PATTERN.test(code)) {
    return { ok: false, code, error: EMPLOYEE_CODE_RULE };
  }
  return { ok: true, code };
}

/** Convenience predicate — digits only, no letters/spaces/special characters. */
export function isValidEmployeeCode(value: unknown): boolean {
  return validateEmployeeCode(value).ok;
}

/**
 * Classify a stored code without ever mutating it.
 * `compliant` = digits only; `invalid` = needs HR correction.
 */
export type StoredEmployeeCodeKind = 'compliant' | 'invalid' | 'missing';

export function classifyStoredEmployeeCode(value: unknown): StoredEmployeeCodeKind {
  const code = String(value ?? '').trim();
  if (!code) return 'missing';
  return EMPLOYEE_CODE_PATTERN.test(code) ? 'compliant' : 'invalid';
}
