import axios from 'axios';
import { getSession } from 'next-auth/react';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let sessionToken: string | null = null;

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

api.interceptors.request.use(async (config) => {
  let token = getStoredToken() || sessionToken;

  if (!token) {
    const session = await getSession().catch(() => null);
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

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      sessionToken = null;
      localStorage.removeItem('bsc_token');
      localStorage.removeItem('token');
      localStorage.removeItem('bsc_user');
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

      if (!pathname.startsWith('/login')) {
        const redirectTarget = `/login?callbackUrl=${encodeURIComponent(pathname + window.location.search)}`;
        window.location.href = redirectTarget;
      }
    }
    return Promise.reject(error);
  }
);

export { api };
export default api;
