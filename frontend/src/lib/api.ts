import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getSession } from 'next-auth/react';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let sessionToken: string | null = null;
let inFlightSessionPromise: Promise<any> | null = null;

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;

  const local = localStorage.getItem('bsc_token') || localStorage.getItem('token');
  if (local) return local;

  // Check document cookie as fallback
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (match && match[1]) {
    try {
      const decoded = decodeURIComponent(match[1]);
      localStorage.setItem('bsc_token', decoded);
      return decoded;
    } catch {
      return match[1];
    }
  }

  return null;
}

async function resolveSession(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (!inFlightSessionPromise) {
    inFlightSessionPromise = getSession()
      .catch(() => null)
      .finally(() => {
        inFlightSessionPromise = null;
      });
  }
  return inFlightSessionPromise;
}

let isRedirecting = false;

api.interceptors.request.use(async (config) => {
  let token = getStoredToken() || sessionToken;

  if (!token) {
    const session = await resolveSession();
    if (session?.token) {
      token = session.token;
      sessionToken = session.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem('bsc_token', session.token);
        localStorage.setItem('token', session.token);
      }
    }
  } else if (!sessionToken) {
    sessionToken = token;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Generate correlation ID for request tracing
  if (!config.headers['x-correlation-id']) {
    config.headers['x-correlation-id'] = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // Attach CSRF header for double-submit cookie validation if present
  if (typeof document !== 'undefined') {
    const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (csrfMatch && csrfMatch[1]) {
      config.headers['x-csrf-token'] = decodeURIComponent(csrfMatch[1]);
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    isRedirecting = false;
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      sessionToken = null;
      localStorage.removeItem('bsc_token');
      localStorage.removeItem('token');
      localStorage.removeItem('bsc_user');
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'bsc_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'next-auth.session-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = '__Secure-next-auth.session-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

      if (!pathname.startsWith('/login') && !isRedirecting) {
        isRedirecting = true;
        const redirectTarget = `/login?callbackUrl=${encodeURIComponent(pathname + window.location.search)}`;
        window.location.href = redirectTarget;
      }

      // Mark the error as auth-handled to allow callers to suppress noisy console logs
      error.isHandled401 = true;
    }
    return Promise.reject(error);
  }
);

// In-Flight Promise Sharing and Request Deduplication for GET Requests
const inFlightRequests = new Map<string, Promise<any>>();
const responseCache = new Map<string, { response: any; expiresAt: number }>();

function buildCacheKey(url: string, config?: any): string {
  const paramsStr = config?.params ? JSON.stringify(config.params) : '';
  return `${url}::${paramsStr}`;
}

const originalGet = api.get.bind(api);
const originalPost = api.post.bind(api);
const originalPut = api.put.bind(api);
const originalPatch = api.patch.bind(api);
const originalDelete = api.delete.bind(api);

export function clearApiCache(): void {
  responseCache.clear();
  inFlightRequests.clear();
}

api.get = (function (url: string, config?: any): Promise<any> {
  const cacheKey = buildCacheKey(url, config);
  const now = Date.now();

  // 1. Check response cache
  const cached = responseCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return Promise.resolve(cached.response);
  }

  // 2. Check in-flight promise (share active request)
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  // 3. Make real request and share promise
  const promise = (originalGet as any)(url, config)
    .then((response: any) => {
      // Cache successful GET responses for 2.5s to deduplicate concurrent component mounts
      if (response && response.status >= 200 && response.status < 300) {
        responseCache.set(cacheKey, {
          response,
          expiresAt: Date.now() + 2500,
        });
      }
      return response;
    })
    .catch((err: any) => {
      // If we are redirecting to /login due to 401, absorb the GET error gracefully
      if (err?.response?.status === 401 && (isRedirecting || (typeof window !== 'undefined' && window.location.pathname.startsWith('/login')))) {
        return { data: {}, status: 401, isHandled401: true };
      }
      return Promise.reject(err);
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, promise);
  return promise;
}) as any;

// Mutations automatically clear cached GET data
api.post = (function (url: string, data?: any, config?: any): Promise<any> {
  clearApiCache();
  return (originalPost as any)(url, data, config);
}) as any;

api.put = (function (url: string, data?: any, config?: any): Promise<any> {
  clearApiCache();
  return (originalPut as any)(url, data, config);
}) as any;

api.patch = (function (url: string, data?: any, config?: any): Promise<any> {
  clearApiCache();
  return (originalPatch as any)(url, data, config);
}) as any;

api.delete = (function (url: string, config?: any): Promise<any> {
  clearApiCache();
  return (originalDelete as any)(url, config);
}) as any;

export { api };
export default api;
