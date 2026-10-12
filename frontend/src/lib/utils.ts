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

export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
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