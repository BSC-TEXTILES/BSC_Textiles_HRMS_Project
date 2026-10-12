/**
 * Parse a JSON string (or pass through an already-parsed value) without ever throwing.
 *
 * Database JSON columns and browser localStorage frequently end up holding an empty
 * string or a truncated payload. A bare `JSON.parse('')` throws
 * "Unexpected end of JSON input", which surfaces as an unrecoverable runtime crash.
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value as unknown as T;
  }

  try {
    const parsed = JSON.parse(value) as T;
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}
