'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '@/lib/api';
import {
  ShiftRegistryItem,
  SHIFTS_CHANGED_EVENT,
  buildShiftRegistry,
  getCachedRawShifts,
  setCachedRawShifts,
  clearShiftRegistryCache,
} from '@/lib/shiftRegistry';

export function useShiftRegistry(locationId?: string) {
  const [rawShifts, setRawShifts] = useState<any[]>(() => getCachedRawShifts() || []);
  const [loading, setLoading] = useState<boolean>(() => !getCachedRawShifts());
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchShifts = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedRawShifts();
      if (cached && cached.length > 0) {
        if (isMountedRef.current) {
          setRawShifts(cached);
          setLoading(false);
        }
        return;
      }
    }

    try {
      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      const res = await api.get('/shifts', { params: { limit: 100 } });
      const list = res.data?.shifts || res.data || [];

      setCachedRawShifts(list);

      if (isMountedRef.current) {
        setRawShifts(list);
        setError(null);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setError('Could not load shifts');
        console.error('Failed to load shared shift registry:', err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Live Sync: Listen for cross-module shift creation / invalidation
  useEffect(() => {
    const handleShiftEvent = () => {
      clearShiftRegistryCache();
      fetchShifts(true);
    };

    window.addEventListener(SHIFTS_CHANGED_EVENT, handleShiftEvent);

    let bc: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('bsc_shifts_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'SHIFTS_CHANGED') {
            clearShiftRegistryCache();
            fetchShifts(true);
          }
        };
      }
    } catch {}

    const handleWindowFocus = () => {
      // Re-verify registry cache on tab / window focus
      const cached = getCachedRawShifts();
      if (!cached) {
        fetchShifts(true);
      }
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener(SHIFTS_CHANGED_EVENT, handleShiftEvent);
      window.removeEventListener('focus', handleWindowFocus);
      if (bc) bc.close();
    };
  }, [fetchShifts]);

  // Build normalized registry representation scoped to current location
  const registry = useMemo(() => {
    return buildShiftRegistry(rawShifts, locationId);
  }, [rawShifts, locationId]);

  return {
    ...registry,
    rawShifts,
    loading,
    error,
    refetch: () => fetchShifts(true),
  };
}
