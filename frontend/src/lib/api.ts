import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { signOut } from 'next-auth/react';

const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== 'undefined'
      ? '/api'
      : process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api`
      : 'http://localhost:4000/api'),
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Authentication is carried entirely by HttpOnly cookies set by
 * `POST /api/session/login`. Nothing here reads a token from
 * localStorage: a script-readable token turns any XSS on the dashboard into a
 * session hijack, and it cannot be revoked before the page reloads.
 *
 * The only value mirrored into a readable cookie is the CSRF token, which the
 * double-submit pattern requires the client to send back as a header.
 */
function csrfHeader(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const ABSOLUTE_SESSION_SECONDS = 8 * 60 * 60;

let isRedirecting = false;
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new token pair. Single-flight: fifty
 * components that all observe the same 401 trigger one refresh, not fifty.
 */
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${api.defaults.baseURL}/session/refresh`, {}, { withCredentials: true, timeout: 10000 })
      .then((response) => {
        if (response.data?.csrfToken && typeof document !== 'undefined') {
          document.cookie = `csrf_token=${response.data.csrfToken}; path=/; max-age=${ABSOLUTE_SESSION_SECONDS}; SameSite=Strict`;
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.request.use((config) => {
  if (!config.headers['x-correlation-id']) {
    config.headers['x-correlation-id'] = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const csrf = csrfHeader();
  if (csrf) {
    config.headers['x-csrf-token'] = csrf;
  }

  return config;
});

function beginSignOut(): void {
  if (typeof window === 'undefined' || isRedirecting) return;
  const pathname = window.location.pathname;
  if (pathname.startsWith('/login') || pathname.startsWith('/403')) return;
  isRedirecting = true;
  signOut({ redirect: false })
    .catch(() => undefined)
    .finally(() => {
      window.location.href = `/login?callbackUrl=${encodeURIComponent(pathname + window.location.search)}`;
    });
}

api.interceptors.response.use(
  (response) => {
    isRedirecting = false;
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const config = error.config;

    if (status === 401 && config && !config._retriedAfterRefresh) {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      if (pathname.startsWith('/login') || pathname.startsWith('/403')) {
        error.isHandled401 = true;
        return Promise.reject(error);
      }
      config._retriedAfterRefresh = true;
      if (await refreshSession()) {
        try {
          return await api(config);
        } catch (retryError) {
          beginSignOut();
          throw retryError;
        }
      }
      beginSignOut();
      error.isHandled401 = true;
      return Promise.reject(error);
    }

    // An outstanding temporary password locks the API; the change-password
    // screen is the only place that can clear it.
    if (status === 403 && error.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/change-password')) {
        window.location.href = '/change-password?forced=1';
      }
      error.isHandled403 = true;
    }

    // Transparent retry for transient network dropouts / server reload
    if (
      !error.response &&
      config &&
      !config._isRetry &&
      (error.code === 'ERR_NETWORK' || error.message === 'Network Error')
    ) {
      config._isRetry = true;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(api(config));
        }, 800);
      });
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
