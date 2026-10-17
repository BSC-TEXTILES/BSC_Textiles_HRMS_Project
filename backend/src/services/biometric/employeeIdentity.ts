/**
 * Device user-id -> HRM employee resolution.
 *
 * An eSSL MB160 stores a numeric user id per person. Sites key it either as the
 * full employee number or as the last six digits of it, so matching runs in that
 * order:
 *
 *   1. normalise (trim, drop surrounding punctuation, strip leading zeros);
 *   2. exact full-id match;
 *   3. last-six-digits suffix match;
 *   4. otherwise UNMAPPED — the record is kept for an admin to assign.
 *
 * When a step matches more than one distinct employee the result is AMBIGUOUS
 * with every candidate listed. It is never resolved by picking the first row,
 * because guessing attributes one person's attendance to another.
 */

export type IdentityStatus = 'MAPPED' | 'AMBIGUOUS' | 'UNMAPPED';

export interface IdentityCandidate {
  employeeId: string;
  employeeCode?: string | null;
  fullName?: string | null;
  /** The device id this candidate is registered under, when known. */
  deviceUserId?: string | null;
  matchRule: 'EXACT_FULL' | 'SUFFIX_LAST6';
}

export interface NormalizedDeviceId {
  raw: string;
  /** Whitespace and separator characters removed. */
  compact: string;
  /** `compact` with leading zeros stripped — the form both sides compare on. */
  normalized: string;
  /** Last six digits of `normalized`, zero-padded, used for the fallback rule. */
  lastSix: string;
}

export function normalizeDeviceUserId(rawId: unknown): NormalizedDeviceId {
  const raw = rawId === null || rawId === undefined ? '' : String(rawId);
  const trimmed = raw.trim();
  // Keep digits and letters, drop separators the device or an import may add.
  const compact = trimmed.replace(/[\s\-_/:.]/g, '');
  const digitsOnly = /^\d+$/.test(compact);
  const normalized = digitsOnly ? compact.replace(/^0+/, '') : compact;
  const basis = normalized === '' ? '0' : normalized;
  const lastSix = basis.length > 6 ? basis.slice(-6) : basis.padStart(6, '0');
  return { raw, compact, normalized, lastSix };
}

export interface IdentityResolution {
  status: IdentityStatus;
  employeeId: string | null;
  candidates: IdentityCandidate[];
  rule: 'EXACT_FULL' | 'SUFFIX_LAST6' | 'NONE';
  normalized: NormalizedDeviceId;
  reason?: string;
}

/**
 * @param exactCandidates   employees registered under the full normalised id
 * @param suffixCandidates  employees whose id ends with the last six digits
 * Both lists are expected to be already filtered to active mappings/employees;
 * the ambiguity check is on distinct employeeIds.
 */
export function resolveEmployeeIdentity(
  rawId: unknown,
  exactCandidates: IdentityCandidate[],
  suffixCandidates: IdentityCandidate[] = []
): IdentityResolution {
  const normalized = normalizeDeviceUserId(rawId);

  if (!normalized.normalized) {
    return {
      status: 'UNMAPPED',
      employeeId: null,
      candidates: [],
      rule: 'NONE',
      normalized,
      reason: 'Device sent an empty user id',
    };
  }

  const distinct = (rows: IdentityCandidate[]) => {
    const byId = new Map<string, IdentityCandidate>();
    for (const row of rows) {
      if (row.employeeId && !byId.has(row.employeeId)) byId.set(row.employeeId, row);
    }
    return [...byId.values()];
  };

  const exact = distinct(exactCandidates);
  if (exact.length === 1) {
    return { status: 'MAPPED', employeeId: exact[0].employeeId, candidates: exact, rule: 'EXACT_FULL', normalized };
  }
  if (exact.length > 1) {
    return {
      status: 'AMBIGUOUS',
      employeeId: null,
      candidates: exact,
      rule: 'EXACT_FULL',
      normalized,
      reason: `${exact.length} employees claim device id "${normalized.normalized}"`,
    };
  }

  const suffix = distinct(suffixCandidates);
  if (suffix.length === 1) {
    return { status: 'MAPPED', employeeId: suffix[0].employeeId, candidates: suffix, rule: 'SUFFIX_LAST6', normalized };
  }
  if (suffix.length > 1) {
    return {
      status: 'AMBIGUOUS',
      employeeId: null,
      candidates: suffix,
      rule: 'SUFFIX_LAST6',
      normalized,
      reason: `${suffix.length} employees share the last six digits "${normalized.lastSix}"`,
    };
  }

  return {
    status: 'UNMAPPED',
    employeeId: null,
    candidates: [],
    rule: 'NONE',
    normalized,
    reason: `No employee registered for device id "${normalized.normalized}"`,
  };
}

/**
 * The enrollment number as it should be stored on a mapping row, so lookups can
 * use the same normalisation the punch path applies.
 */
export function deriveMappingKeys(enrollmentNumber: string): { normalizedEnrollment: string; lastSixDigits: string } {
  const n = normalizeDeviceUserId(enrollmentNumber);
  return { normalizedEnrollment: n.normalized, lastSixDigits: n.lastSix };
}
