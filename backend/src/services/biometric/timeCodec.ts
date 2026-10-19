/**
 * Biometric time codec.
 *
 * The eSSL MB160 sends *naive* wall-clock timestamps — "2026-10-16 09:12:34"
 * with no offset attached. Those are only meaningful in the timezone the
 * terminal's clock is set to, so every conversion in this module is explicit in
 * three parts: the naive wall time, the IANA zone it belongs to, and the UTC
 * instant it denotes. Nothing here ever calls `new Date(naiveString)`, because
 * that silently reinterprets the value in the OS timezone — which is what made
 * punch times move around depending on which machine ran the server.
 *
 * Storage contract (see docs/BIOMETRIC_MB160.md):
 *   - `biometric_raw_punches.punchTimeUtc` holds UTC wall time and is written as
 *     a pre-formatted string so the MySQL driver's session timezone cannot shift
 *     it. This is the authoritative instant.
 *   - `biometric_raw_punches.punchTime` keeps the shared legacy convention: a JS
 *     Date passed through the pool, which serialises at a pinned +05:30. It
 *     exists because the rest of the HRMS reads that column.
 */

export const MIN_VALID_YEAR_DEFAULT = 2020;
export const FUTURE_SKEW_SECONDS_DEFAULT = 300;

export interface NaiveParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

export type RejectionReason =
  | 'UNPARSEABLE'
  | 'IMPOSSIBLE_DATE'
  | 'FUTURE_DATED'
  | 'MISSING_TIME';

export interface SafePunchTime {
  ok: boolean;
  /** UTC instant of the punch. Only set when ok. */
  instant?: Date;
  /** Naive wall time exactly as understood, for the raw/debug column. */
  wall?: NaiveParts;
  rejection?: RejectionReason;
  detail?: string;
}

const WALL_TIME_RE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?)?/;

function pad(n: number, width = 2): string {
  return String(Math.abs(Math.trunc(n))).padStart(width, '0');
}

/**
 * Offset in milliseconds to ADD to a UTC instant to obtain wall time in `tz`.
 * Uses Intl so the zone database — not the host's timezone — decides.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const hour = get('hour') % 24; // Intl renders midnight as 24 in hour12:false
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));

  // Round to whole seconds; sub-second noise comes from the truncated seconds.
  return Math.round((asUtc - instant.getTime()) / 1000) * 1000;
}

/**
 * Interpret a naive wall-clock string as being in `timeZone` and return the
 * absolute instant. One correction pass handles zones with transitions.
 */
export function wallTimeToInstant(wall: NaiveParts, timeZone: string): Date {
  const naiveAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, wall.ms);
  let offset = zoneOffsetMs(new Date(naiveAsUtc), timeZone);
  let instant = naiveAsUtc - offset;

  const refined = zoneOffsetMs(new Date(instant), timeZone);
  if (refined !== offset) {
    offset = refined;
    instant = naiveAsUtc - offset;
  }
  return new Date(instant);
}

/** Format a UTC instant as the wall-clock time observed in `timeZone`. */
export function instantToWallParts(instant: Date, timeZone: string): NaiveParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
    ms: instant.getUTCMilliseconds(),
  };
}

export function formatWallString(instant: Date, timeZone: string, withMs = false): string {
  const w = instantToWallParts(instant, timeZone);
  const base = `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
  return withMs ? `${base}.${pad(w.ms, 3)}` : base;
}

export function formatWallString12(instant: Date, timeZone: string, includeDate = true): string {
  const w = instantToWallParts(instant, timeZone);
  const hour12 = w.hour % 12 === 0 ? 12 : w.hour % 12;
  const period = w.hour < 12 ? 'AM' : 'PM';
  const timeStr = `${pad(hour12)}:${pad(w.minute)}:${pad(w.second)} ${period}`;
  if (!includeDate) return timeStr;
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)} ${timeStr}`;
}


/**
 * The calendar date the *device* considered it to be when the punch happened.
 * Deriving this from `toISOString()` is the bug that moved early-morning Indian
 * punches onto the previous day, because IST 00:00-05:29 is still the prior UTC
 * date.
 */
export function deviceCalendarDate(instant: Date, timeZone: string): string {
  const w = instantToWallParts(instant, timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** 'YYYY-MM-DD HH:mm:ss.SSS' in UTC, for writing an authoritative UTC column. */
export function toUtcMysqlString(instant: Date): string {
  return (
    `${pad(instant.getUTCFullYear(), 4)}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())} ` +
    `${pad(instant.getUTCHours())}:${pad(instant.getUTCMinutes())}:${pad(instant.getUTCSeconds())}.${pad(instant.getUTCMilliseconds(), 3)}`
  );
}

/** Read back a UTC wall-time DATETIME(3) as an absolute instant. */
export function fromUtcMysqlString(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    // The pool decodes DATETIME with its pinned session timezone (+05:30), so a stored
    // UTC wall time arrives anchored to Asia/Kolkata. Reconstruct it from the Asia/Kolkata
    // wall digits rather than host-local getHours() which varies by runner OS.
    const w = instantToWallParts(value, 'Asia/Kolkata');
    const wall =
      `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)} ` +
      `${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}.${pad(w.ms, 3)}`;
    return new Date(`${wall.replace(' ', 'T')}Z`);
  }

  const s = String(value).trim();
  const match = WALL_TIME_RE.exec(s);
  if (!match) return null;
  const datePart = `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}`;
  const timePart =
    `${pad(Number(match[4] ?? 0))}:${pad(Number(match[5] ?? 0))}:${pad(Number(match[6] ?? 0))}` +
    `.${pad(Number((match[7] ?? '0').padEnd(3, '0')), 3)}`;
  const instant = new Date(`${datePart}T${timePart}Z`);
  return isNaN(instant.getTime()) ? null : instant;
}

export interface SafeTimeOptions {
  timeZone?: string;
  /** Injected for deterministic tests. */
  now?: Date;
  minValidYear?: number;
  futureSkewSeconds?: number;
  requireTimeOfDay?: boolean;
}

/**
 * Parse and vet one device timestamp. Dates that cannot be real — before the
 * minimum year, or meaningfully in the future — are rejected here rather than
 * written to the ledger, so a terminal with a dead RTC coin cell cannot poison
 * attendance history.
 */
export function toSafePunchInstant(
  raw: string | number | Date | null | undefined,
  options: SafeTimeOptions = {}
): SafePunchTime {
  const timeZone = options.timeZone || 'Asia/Kolkata';
  const now = options.now || new Date();
  const minValidYear = options.minValidYear ?? MIN_VALID_YEAR_DEFAULT;
  const futureSkewSeconds = options.futureSkewSeconds ?? FUTURE_SKEW_SECONDS_DEFAULT;

  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, rejection: 'MISSING_TIME', detail: 'Device sent no timestamp' };
  }

  let wall: NaiveParts;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { ok: false, rejection: 'UNPARSEABLE', detail: 'Invalid Date object' };
    // Already an absolute instant (ZK pull path decodes to a UTC-based Date).
    wall = instantToWallParts(raw, timeZone);
    return vet(wall, timeZone, now, minValidYear, futureSkewSeconds, raw);
  }

  if (typeof raw === 'number') {
    return { ok: false, rejection: 'UNPARSEABLE', detail: `Numeric timestamp ${raw} needs the ZK decoder, not the wall-clock parser` };
  }

  const text = String(raw).trim();
  const match = WALL_TIME_RE.exec(text);
  if (!match) return { ok: false, rejection: 'UNPARSEABLE', detail: `Unrecognised timestamp "${text}"` };

  wall = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
    ms: Number((match[7] ?? '0').padEnd(3, '0')),
  };

  if (options.requireTimeOfDay && !match[4]) {
    return { ok: false, rejection: 'MISSING_TIME', detail: `Date-only value "${text}" has no clock time` };
  }

  // Reject structurally impossible dates (month 13, day 45) before vetting.
  const probe = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second));
  if (
    probe.getUTCMonth() + 1 !== wall.month ||
    probe.getUTCDate() !== wall.day ||
    wall.hour > 23 || wall.minute > 59 || wall.second > 59
  ) {
    return { ok: false, rejection: 'UNPARSEABLE', detail: `Impossible calendar value "${text}"` };
  }

  return vet(wall, timeZone, now, minValidYear, futureSkewSeconds);
}

function vet(
  wall: NaiveParts,
  timeZone: string,
  now: Date,
  minValidYear: number,
  futureSkewSeconds: number,
  knownInstant?: Date
): SafePunchTime {
  if (wall.year < minValidYear) {
    return {
      ok: false,
      wall,
      rejection: 'IMPOSSIBLE_DATE',
      detail: `Year ${wall.year} is before the ${minValidYear} floor — terminal clock has probably reset`,
    };
  }

  const instant = knownInstant ?? wallTimeToInstant(wall, timeZone);
  if (isNaN(instant.getTime())) {
    return { ok: false, wall, rejection: 'UNPARSEABLE', detail: 'Conversion produced an invalid instant' };
  }

  const skewMs = instant.getTime() - now.getTime();
  if (skewMs > futureSkewSeconds * 1000) {
    return {
      ok: false,
      wall,
      instant,
      rejection: 'FUTURE_DATED',
      detail: `Dated ${Math.round(skewMs / 1000)}s in the future, beyond the ${futureSkewSeconds}s tolerance`,
    };
  }

  return { ok: true, instant, wall };
}

/**
 * Decode the ZK 32-bit packed timestamp. The device packs its *local* wall
 * clock, so the result is wall time — callers must pair it with the device
 * timezone before treating it as an instant.
 */
export function decodeZkPackedTime(packed: number): NaiveParts {
  let value = Math.trunc(packed);
  const second = value % 60; value = Math.floor(value / 60);
  const minute = value % 60; value = Math.floor(value / 60);
  const hour = value % 24; value = Math.floor(value / 24);
  const day = (value % 31) + 1; value = Math.floor(value / 31);
  const month = (value % 12) + 1; value = Math.floor(value / 12);
  const year = value + 2000;
  return { year, month, day, hour, minute, second, ms: 0 };
}

/** Encode wall parts back into the ZK 32-bit form (round-trip of the above). */
export function encodeZkPackedTime(wall: NaiveParts): number {
  return (
    (((((wall.year - 2000) * 12 + (wall.month - 1)) * 31 + (wall.day - 1)) * 24 + wall.hour) * 60 + wall.minute) * 60 +
    wall.second
  );
}

/**
 * Turn a device wall time into the packed form for CMD_SET_TIME, so the server
 * can correct a terminal whose clock has drifted.
 */
export function encodeZkPackedTimeForInstant(instant: Date, timeZone: string): number {
  return encodeZkPackedTime(instantToWallParts(instant, timeZone));
}

/** Signed device-minus-server offset in whole seconds. */
export function clockDriftSeconds(deviceWall: NaiveParts, timeZone: string, serverNow: Date): number {
  const deviceInstant = wallTimeToInstant(deviceWall, timeZone);
  return Math.round((deviceInstant.getTime() - serverNow.getTime()) / 1000);
}
