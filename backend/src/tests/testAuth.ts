/**
 * Shared test authentication helper.
 *
 * The login endpoint is protected by the sensitive sliding-window limiter
 * (RATE_LIMIT_SENSITIVE per RATE_LIMIT_SENSITIVE_WINDOW seconds per IP +
 * identity). A full test run signs in the same personas from the same address
 * several times, and running the suite twice inside one window used to abort
 * with a 429 before a single test executed. Retrying with the Retry-After the
 * server itself advertises keeps consecutive runs deterministic without
 * weakening the limiter.
 */

export function apiBaseUrl(): string {
  return (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginWithRetry(
  email: string,
  password = 'password123',
  options: { baseUrl?: string; attempts?: number } = {}
): Promise<string> {
  const baseUrl = (options.baseUrl || apiBaseUrl()).replace(/\/api\/?$/, '');
  const attempts = options.attempts ?? 6;
  let lastError = '';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err: any) {
      lastError = err?.message || String(err);
      await sleep(Math.min(2000 * attempt, 5000));
      continue;
    }

    if (res.ok) {
      const data: any = await res.json();
      return data.token;
    }

    const text = await res.text();
    lastError = `Login failed for ${email} (${res.status}): ${text}`;

    if (res.status === 429) {
      let waitSeconds = Number(res.headers.get('retry-after') || 0);
      try {
        const parsed = JSON.parse(text);
        if (!waitSeconds && parsed?.retryAfterSeconds) waitSeconds = Number(parsed.retryAfterSeconds);
      } catch {
        /* body was not JSON — the header is authoritative then */
      }
      const waitMs = Math.max(1000, Math.min((waitSeconds || 5) * 1000 + 250, 90_000));
      console.warn(`  ⏳ Login for ${email} rate limited — waiting ${Math.ceil(waitMs / 1000)}s (attempt ${attempt}/${attempts})`);
      await sleep(waitMs);
      continue;
    }

    // Wrong credentials and similar hard failures are not worth retrying.
    throw new Error(lastError);
  }

  throw new Error(`Still rate limited after ${attempts} attempts: ${lastError}`);
}
