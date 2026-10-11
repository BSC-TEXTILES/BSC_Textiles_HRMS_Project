'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MetricDetailType } from '@/types/metricDetail';

const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const AUTO_REFRESH_MS = 10 * 1000; // 10 seconds auto-refresh while open

const memoryCache = new Map<string, { data: any; timestamp: number }>();

const METRIC_ENDPOINTS: Record<NonNullable<MetricDetailType>, string> = {
  punches: '/api/attendance/punches/detail',
  presence: '/api/presence/live-floor',
  terminals: '/api/terminals/network-status',
  punctuality: '/api/analytics/punctuality',
  liveness: '/api/biometric/liveness-logs',
};

interface UseMetricDetailOptions {
  params?: Record<string, string>;
  autoRefresh?: boolean;
}

export function useMetricDetail<T = any>(
  metric: MetricDetailType,
  options: UseMetricDetailOptions = {}
) {
  const { params = {}, autoRefresh = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  const serializedParams = JSON.stringify(params);

  const fetchData = useCallback(
    async (force = false) => {
      if (!metric) {
        setData(null);
        return;
      }

      const endpoint = METRIC_ENDPOINTS[metric];
      if (!endpoint) return;

      const qp = new URLSearchParams(params);
      const queryString = qp.toString() ? `?${qp.toString()}` : '';
      const fullUrl = `${endpoint}${queryString}`;
      const cacheKey = `${metric}:${fullUrl}`;

      // Check 30-second cache if not forcing refresh
      if (!force) {
        const cached = memoryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          setData(cached.data);
          setLastRefreshed(new Date(cached.timestamp));
          setLoading(false);
          return;
        }
      }

      if (activeRequestRef.current) {
        activeRequestRef.current.abort();
      }
      const controller = new AbortController();
      activeRequestRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(fullUrl, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const json = await res.json();
        memoryCache.set(cacheKey, { data: json, timestamp: Date.now() });
        setData(json);
        setLastRefreshed(new Date());
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err?.message || 'Failed to fetch metric detail');
        }
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metric, serializedParams]
  );

  useEffect(() => {
    fetchData();

    return () => {
      if (activeRequestRef.current) {
        activeRequestRef.current.abort();
      }
    };
  }, [fetchData]);

  // 10s polling while active
  useEffect(() => {
    if (!metric || !autoRefresh) return;

    const interval = setInterval(() => {
      fetchData(true);
    }, AUTO_REFRESH_MS);

    return () => clearInterval(interval);
  }, [metric, autoRefresh, fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refresh, lastRefreshed };
}
