/**
 * Verification-method resolution for eSSL / ZKTeco terminals.
 *
 * The terminal reports a small integer per punch. Which integer means "face"
 * depends on the firmware, so the code->label table lives in the database
 * (`verify_mode_mapping`) and is editable from the Device Settings page, and
 * this module is deliberately dumb: it looks the code up and says `Unknown`
 * when it is not in the table.
 *
 * Two behaviours that used to be wrong and are asserted by tests:
 *   - an unmapped code must never be reported as Card or Face;
 *   - a payload that carries no verify code at all must stay "not reported"
 *     rather than inheriting a default.
 */

export type MethodFamily = 'FACE' | 'FINGERPRINT' | 'CARD' | 'PASSWORD' | 'COMBINED' | 'UNKNOWN';

export interface VerifyModeRow {
  rawCode: number;
  label: string;
  methodFamily: MethodFamily;
}

export interface ResolvedVerifyMode {
  /** The raw code as received, or null when the device sent none. */
  rawCode: number | null;
  label: string;
  methodFamily: MethodFamily;
  /** False when the code was absent or missing from the mapping table. */
  known: boolean;
  reason?: 'NOT_REPORTED' | 'UNMAPPED_CODE';
}

export const NOT_REPORTED_LABEL = 'Not reported by device';
export const UNKNOWN_LABEL = 'Unknown';

/**
 * The usual ZK codes, used to seed the table and as a last-resort read-only
 * fallback if the mapping table is missing entirely (a fresh database that has
 * not been seeded). Admins edit the table, not this constant.
 */
export const STANDARD_ZK_VERIFY_MODES: VerifyModeRow[] = [
  { rawCode: 0, label: 'Password', methodFamily: 'PASSWORD' },
  { rawCode: 1, label: 'Fingerprint', methodFamily: 'FINGERPRINT' },
  { rawCode: 2, label: 'Card', methodFamily: 'CARD' },
  { rawCode: 3, label: 'Fingerprint + Password', methodFamily: 'COMBINED' },
  { rawCode: 4, label: 'Fingerprint + Card', methodFamily: 'COMBINED' },
  { rawCode: 5, label: 'Password + Card', methodFamily: 'COMBINED' },
  { rawCode: 8, label: 'Card + Face', methodFamily: 'COMBINED' },
  { rawCode: 9, label: 'Face + Fingerprint', methodFamily: 'COMBINED' },
  { rawCode: 10, label: 'Face + Password', methodFamily: 'COMBINED' },
  { rawCode: 15, label: 'Face', methodFamily: 'FACE' },
];

export type VerifyModeMap = Map<number, VerifyModeRow> | VerifyModeRow[];

function asMap(map: VerifyModeMap): Map<number, VerifyModeRow> {
  return map instanceof Map ? map : new Map(map.map((row) => [row.rawCode, row]));
}

/**
 * @param rawCode verify code exactly as the terminal sent it (may be absent)
 * @param map rows from `verify_mode_mapping`
 */
export function resolveVerifyMode(
  rawCode: number | string | null | undefined,
  map: VerifyModeMap
): ResolvedVerifyMode {
  if (rawCode === null || rawCode === undefined || rawCode === '') {
    return { rawCode: null, label: NOT_REPORTED_LABEL, methodFamily: 'UNKNOWN', known: false, reason: 'NOT_REPORTED' };
  }

  const code = Number(rawCode);
  if (!Number.isFinite(code) || code < 0) {
    return { rawCode: null, label: UNKNOWN_LABEL, methodFamily: 'UNKNOWN', known: false, reason: 'UNMAPPED_CODE' };
  }

  const row = asMap(map).get(code);
  if (!row) {
    return {
      rawCode: code,
      label: `${UNKNOWN_LABEL} (${code})`,
      methodFamily: 'UNKNOWN',
      known: false,
      reason: 'UNMAPPED_CODE',
    };
  }

  return { rawCode: code, label: row.label, methodFamily: row.methodFamily, known: true };
}

/** True only when the resolved method genuinely involved a face. */
export function involvesFace(resolved: ResolvedVerifyMode): boolean {
  if (resolved.methodFamily === 'FACE') return true;
  return resolved.methodFamily === 'COMBINED' && /face/i.test(resolved.label);
}

/**
 * Punch status/state byte from the terminal. Values follow the ZK attendance
 * status field; anything unrecognised stays `AUTO_PAIR` so the pairing engine
 * decides instead of inventing a check-in or check-out.
 */
export type PunchType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'AUTO_PAIR';

const PUNCH_STATE_LABELS: Record<number, PunchType> = {
  0: 'CHECK_IN',
  1: 'CHECK_OUT',
  2: 'BREAK_OUT',
  3: 'BREAK_IN',
  4: 'CHECK_IN',
  5: 'CHECK_OUT',
};

export function resolvePunchState(state: number | string | null | undefined): { punchType: PunchType; code: number | null; known: boolean } {
  if (state === null || state === undefined || state === '') {
    return { punchType: 'AUTO_PAIR', code: null, known: false };
  }
  const code = Number(state);
  if (!Number.isFinite(code) || code < 0) {
    return { punchType: 'AUTO_PAIR', code: null, known: false };
  }
  const punchType = PUNCH_STATE_LABELS[code];
  return { punchType: punchType ?? 'AUTO_PAIR', code, known: Boolean(punchType) };
}
