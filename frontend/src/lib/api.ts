import axios from 'axios';
import { getSession } from 'next-auth/react';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  let token: string | null = null;
  
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('bsc_token') || localStorage.getItem('token');
  }

  if (!token) {
    const session = await getSession().catch(() => null);
    if (session?.token) {
      token = session.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem('bsc_token', session.token);
      }
    }
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
      if (!window.location.pathname.startsWith('/login')) {
        localStorage.removeItem('bsc_token');
        localStorage.removeItem('token');
        localStorage.removeItem('bsc_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export { api };
export default api;
