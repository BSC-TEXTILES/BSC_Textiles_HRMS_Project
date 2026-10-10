import axios from 'axios';

// By default in dev, Android emulator accesses localhost via 10.0.2.2, while iOS simulator uses localhost
const DEFAULT_API_URL = 'http://10.0.2.2:4000/api';

export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) || DEFAULT_API_URL;

let storedAuthToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  storedAuthToken = token;
};

export const getAuthToken = () => storedAuthToken;

export const mobileApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

mobileApi.interceptors.request.use((config) => {
  if (storedAuthToken) {
    config.headers.Authorization = `Bearer ${storedAuthToken}`;
  }
  return config;
});

mobileApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[MobileApi] 401 Unauthorized - Session may have expired');
      storedAuthToken = null;
    }
    return Promise.reject(error);
  }
);
