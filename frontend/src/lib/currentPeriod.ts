/**
 * Reporting-period helpers.
 *
 * The business runs entirely on Asia/Kolkata (IST) — every store, shift and
 * attendance day is IST wall-clock — while the browser (and the Next.js server
 * rendering the first paint) may sit in any timezone at all. Reading
 * `new Date().getMonth()` therefore hands the API the wrong period for users
 * outside IST, and hardcoding a period (the old `year=2024&month=10` default)
 * hands it a stale one for everybody.
 *
 * Rules implemented here:
 *   1. A default period is always derived from *today in IST*.
 *   2. An explicit selection beats the default, in this order:
 *        URL query parameters → localStorage → derived IST current period.
 *      A user's chosen month is never silently reset.
 *   3. Resolution happens on the client behind a mounted guard, so the server
 *      render and the first client render agree and React never logs a
 *      hydration mismatch.
 */

/** Single source of truth for the business timezone. */
export const APP_TIME_ZONE = 'Asia/Kolkata';

/** Query-string keys used to carry an explicitly selected period. */
export const PERIOD_YEAR_PARAM = 'year';
export const PERIOD_MONTH_PARAM = 'month';

/** Screen keys registered here so two screens never share one stored period. */
export const MY_DESK_PERIOD_SCREEN = 'my-desk';

export interface ReportingPeriod {
  /** Calendar year, e.g. 2026. */
  year: number;
  /** Month number 1-12 (API convention, not `Date`'s 0-11). */
  month: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** IST wall-clock parts of an instant, without relying on the host timezone. */
export function istParts(instant: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  // `en-CA` yields `YYYY-MM-DD` deterministically; parse defensively anyway.
  const [year, month, day] = formatted.split('-').map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    // Extremely old/invalid instants: fall back to UTC so we still return a
    // valid period instead of `NaN` leaking into a query string.
    return {
      year: instant.getUTCFullYear(),
      month: instant.getUTCMonth() + 1,
      day: instant.getUTCDate(),
    };
  }
  return { year, month, day };
}

/** `{ year, month }` for the current month in Asia/Kolkata. */
export function getCurrentPeriodIST(instant: Date = new Date()): ReportingPeriod {
  const { year, month } = istParts(instant);
  return { year, month };
}

/** `YYYY-MM-DD` for today in Asia/Kolkata (used by date inputs). */
export function getCurrentDateIST(instant: Date = new Date()): string {
  const { year, month, day } = istParts(instant);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isValidPeriod(value: unknown): value is ReportingPeriod {
  if (!value || typeof value !== 'object') return false;
  const { year, month } = value as ReportingPeriod;
  return (
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2100 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}

/** Coerce raw query/localStorage values into a validated period, or `null`. */
export function parsePeriod(rawYear: unknown, rawMonth: unknown): ReportingPeriod | null {
  const year = Number(rawYear);
  const month = Number(rawMonth);
  return isValidPeriod({ year, month }) ? { year, month } : null;
}

/** Read `?year=&month=` from a search string (accepts a leading `?`). */
export function readPeriodFromSearch(search: string | null | undefined): ReportingPeriod | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (!params.has(PERIOD_YEAR_PARAM) && !params.has(PERIOD_MONTH_PARAM)) return null;
    return parsePeriod(params.get(PERIOD_YEAR_PARAM), params.get(PERIOD_MONTH_PARAM));
  } catch {
    return null;
  }
}

/** Per-screen storage key so two pages never overwrite each other's period. */
export function periodStorageKey(screen: string): string {
  return `bsc-period:${screen}`;
}

/**
 * localStorage period written by a previous visit (the user's last explicit
 * choice). Guarded for SSR, private-mode rejections and corrupt values.
 */
export function readStoredPeriod(screen: string): ReportingPeriod | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(periodStorageKey(screen));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsePeriod(parsed?.year, parsed?.month);
  } catch {
    return null;
  }
}

export function writeStoredPeriod(screen: string, period: ReportingPeriod): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(periodStorageKey(screen), JSON.stringify(period));
  } catch {
    // Storage disabled (private mode / quota) — the in-memory choice still holds.
  }
}

/**
 * Resolve the period to use, in precedence order:
 * URL query parameters → localStorage → today in Asia/Kolkata.
 */
export function resolveReportingPeriod(
  screen: string,
  search: string | null | undefined = typeof window !== 'undefined' ? window.location.search : null
): ReportingPeriod {
  return (
    readPeriodFromSearch(search) ?? readStoredPeriod(screen) ?? getCurrentPeriodIST()
  );
}

/** Keep the address bar shareable without triggering a router navigation. */
export function writePeriodToUrl(period: ReportingPeriod): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(PERIOD_YEAR_PARAM, String(period.year));
    url.searchParams.set(PERIOD_MONTH_PARAM, String(period.month));
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Never break the screen because the address bar could not be updated.
  }
}

/** Persist an explicit user selection (localStorage + shareable URL). */
export function persistReportingPeriod(screen: string, period: ReportingPeriod): void {
  writeStoredPeriod(screen, period);
  writePeriodToUrl(period);
}

/** `October 2026` — the label the period picker and section headers show. */
export function formatPeriodLabel(period: ReportingPeriod | null): string {
  if (!period) return '—';
  return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
}

/** Shift a period by `delta` months, crossing year boundaries correctly. */
export function shiftPeriod(period: ReportingPeriod, delta: number): ReportingPeriod {
  const index = period.year * 12 + (period.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
