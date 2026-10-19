import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Optional-value date formatting. Employee fields such as lastLoginAt,
 * exitDate or lastWorkingDay are frequently null or hold an unparseable
 * legacy value — Intl throws on an Invalid Date, so never format those
 * directly. Falls back to a placeholder instead of crashing the table row.
 */
function isDateLike(date: Date | string | null | undefined): boolean {
  if (date === null || date === undefined || date === '') return false;
  const ms = new Date(date).getTime();
  return !Number.isNaN(ms);
}

export function formatDateSafe(date: Date | string | null | undefined, fallback = '—'): string {
  return isDateLike(date) ? formatDate(date as Date | string) : fallback;
}

export function formatDateTimeSafe(date: Date | string | null | undefined, fallback = '—'): string {
  return isDateLike(date) ? formatDateTime(date as Date | string) : fallback;
}

/**
 * Calendar date (YYYY-MM-DD) in Asia/Kolkata, without a UTC round-trip.
 *
 * `new Date('2026-10-17').toISOString().slice(0,10)` looks harmless but parses as
 * UTC midnight and re-emits UTC, so an IST attendance date of the 17th renders as
 * the 16th. Values that already carry no time component are returned as-is.
 */
export function toCalendarDateIST(value: Date | string | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatTime(date: Date | string | null | undefined, includeSeconds = false): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(date.trim())
      ? new Date(`1970-01-01T${date.trim().padStart(8, '0')}`)
      : new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: true,
    }).format(d);
  } catch {
    return String(date);
  }
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return String(date);
  }
}

export function formatTime12(val: Date | string | null | undefined, includeSeconds = false): string {
  if (!val) return '—';
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return '—';
    // Already in 12h: e.g. "09:49:35 AM" or "9:30 PM"
    if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i.test(s)) {
      return s.toUpperCase();
    }
    // Date + 12h: e.g. "2026-10-17 09:49:35 AM"
    const dt12Match = s.match(/^\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM))$/i);
    if (dt12Match) {
      return dt12Match[1].toUpperCase();
    }
    // "HH:MM" or "HH:MM:SS" (24-hour)
    const timeMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const h24 = parseInt(timeMatch[1], 10);
      const min = timeMatch[2];
      const sec = timeMatch[3];
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const hStr = String(h12).padStart(2, '0');
      return includeSeconds && sec ? `${hStr}:${min}:${sec} ${period}` : `${hStr}:${min} ${period}`;
    }
    // "YYYY-MM-DD HH:MM:SS"
    const dtMatch = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (dtMatch) {
      const h24 = parseInt(dtMatch[2], 10);
      const min = dtMatch[3];
      const sec = dtMatch[4] || '00';
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const hStr = String(h12).padStart(2, '0');
      return includeSeconds ? `${hStr}:${min}:${sec} ${period}` : `${hStr}:${min} ${period}`;
    }
  }

  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: includeSeconds ? '2-digit' : undefined,
        hour12: true,
      }).format(d);
    }
  } catch {}

  return String(val);
}


export function calculateDuration(start: Date | string, end: Date | string): string {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
    case 'PRESENT':
    case 'VERIFIED':
    case 'SUCCESS':
    case 'APPROVED':
      return 'badge-success';
    case 'PENDING':
    case 'LATE':
    case 'ON_LUNCH':
    case 'ON_TEA_BREAK':
    case 'WARNING':
      return 'badge-warning';
    case 'INACTIVE':
    case 'ABSENT':
    case 'FAILED':
    case 'REJECTED':
    case 'ERROR':
      return 'badge-danger';
    case 'WEEKLY_OFF':
    case 'ON_BREAK':
      return 'badge-info';
    default:
      return 'badge-gray';
  }
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Parse a JSON string (or pass through an already-parsed value) without ever throwing.
 *
 * localStorage and API payloads frequently hold an empty or truncated string. A bare
 * `JSON.parse('')` throws "Unexpected end of JSON input" and crashes the whole render
 * tree, so every untrusted parse must go through here instead.
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value as unknown as T;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as T;
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}