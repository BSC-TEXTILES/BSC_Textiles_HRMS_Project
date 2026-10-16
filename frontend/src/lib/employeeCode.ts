/**
 * Employee number (employee code) rules — BSC Textiles HRMS.
 *
 * A BSC employee number is a DIGITS-ONLY identifier:
 *   valid   : "1372", "1604", "0007" (leading zeros are significant)
 *   invalid : "EMP1604", "BSC-1604", "1604A", "" (when required)
 *
 * The code is an identifier, never a number: every helper here works on
 * strings so leading zeros survive parsing, filtering, sorting and display.
 * Legacy records that still carry a non-conforming code are shown verbatim
 * with a "needs correction" indicator — the UI never rewrites them silently.
 */

export const EMPLOYEE_CODE_MIN_LENGTH = 2;
export const EMPLOYEE_CODE_MAX_LENGTH = 10;

const DIGITS_ONLY = /^\d+$/;

export interface EmployeeCodeValidation {
  valid: boolean;
  error?: string;
}

/** Trim without numeric coercion — leading zeros are preserved. */
export function normalizeEmployeeCode(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

/** True when the code is a clean digits-only BSC employee number. */
export function isConformingEmployeeCode(raw: unknown): boolean {
  const code = normalizeEmployeeCode(raw);
  return DIGITS_ONLY.test(code) && code.length >= EMPLOYEE_CODE_MIN_LENGTH && code.length <= EMPLOYEE_CODE_MAX_LENGTH;
}

/**
 * Validate an employee number typed into a form or filter.
 * `required` (default true) mirrors forms where the number must be present.
 */
export function validateEmployeeCode(raw: unknown, required = true): EmployeeCodeValidation {
  const code = normalizeEmployeeCode(raw);

  if (!code) {
    return required
      ? { valid: false, error: 'Employee number is required.' }
      : { valid: true };
  }

  if (!DIGITS_ONLY.test(code)) {
    return {
      valid: false,
      error:
        'Employee number must contain digits only (e.g. 1372). Letters, hyphens and prefixes such as EMP1604 or BSC-1604 are not accepted.',
    };
  }

  if (code.length < EMPLOYEE_CODE_MIN_LENGTH) {
    return { valid: false, error: `Employee number must be at least ${EMPLOYEE_CODE_MIN_LENGTH} digits.` };
  }

  if (code.length > EMPLOYEE_CODE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Employee number cannot be longer than ${EMPLOYEE_CODE_MAX_LENGTH} digits.`,
    };
  }

  return { valid: true };
}

/**
 * A legacy record whose stored code is not digits-only.
 * Display it as-is and flag it for correction — never invent a replacement.
 */
export function employeeCodeNeedsCorrection(raw: unknown): boolean {
  const code = normalizeEmployeeCode(raw);
  if (!code) return false;
  return !DIGITS_ONLY.test(code);
}

/** Canonical display value (string, leading zeros intact). */
export function formatEmployeeCode(raw: unknown): string {
  const code = normalizeEmployeeCode(raw);
  return code || '—';
}

/** Sort comparator that keeps "0007" before "1010" and never drops zeros. */
export function compareEmployeeCodes(a: unknown, b: unknown): number {
  const codeA = normalizeEmployeeCode(a);
  const codeB = normalizeEmployeeCode(b);
  if (codeA === codeB) return 0;
  if (!codeA) return 1;
  if (!codeB) return -1;
  const numericA = DIGITS_ONLY.test(codeA) ? Number(codeA) : Number.MAX_SAFE_INTEGER;
  const numericB = DIGITS_ONLY.test(codeB) ? Number(codeB) : Number.MAX_SAFE_INTEGER;
  if (numericA !== numericB) return numericA - numericB;
  return codeA.localeCompare(codeB);
}

/** Map a backend rejection (zod detail / error string) onto the code field. */
export function employeeCodeErrorFromResponse(err: any): string | null {
  const details: string[] = Array.isArray(err?.response?.data?.details) ? err.response.data.details : [];
  const codeDetail = details.find((d) => d.toLowerCase().includes('employeecode'));
  if (codeDetail) {
    const msg = codeDetail.includes(':') ? codeDetail.split(':').slice(1).join(':').trim() : codeDetail;
    return `Backend rejected this employee number: ${msg}`;
  }

  const apiError: string | undefined =
    err?.response?.data?.error || err?.response?.data?.message || undefined;

  if (apiError && /employee\s*(code|number|id)|digits/i.test(apiError)) {
    return apiError;
  }

  if (err?.response?.status === 409 && apiError && /code|duplicate|unique/i.test(apiError)) {
    return apiError;
  }

  return null;
}
