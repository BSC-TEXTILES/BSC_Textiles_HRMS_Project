/**
 * BSC Textiles HRMS — High-Performance In-Memory & Redis Cache Service
 * Provides sub-millisecond response caching with TTL, ETag support, and strict write-invalidation
 */

import crypto from 'node:crypto';

interface CacheEntry<T> {
  data: T;
  etag: string;
  expiresAt: number;
}

class CacheService {
  private store: Map<string, CacheEntry<any>> = new Map();
  private defaultTtlMs: number = 30_000; // 30 seconds

  /**
   * Retrieve cached value or return null if expired or missing
   */
  get<T>(key: string): { data: T; etag: string } | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return { data: entry.data, etag: entry.etag };
  }

  /**
   * Set cached value with TTL in milliseconds
   */
  set<T>(key: string, data: T, ttlMs: number = this.defaultTtlMs): string {
    const serialized = JSON.stringify(data);
    const etag = `"${crypto.createHash('md5').update(serialized).digest('hex')}"`;
    this.store.set(key, {
      data,
      etag,
      expiresAt: Date.now() + ttlMs,
    });
    return etag;
  }

  /**
   * Delete specific cache key
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix or pattern
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Specific domain invalidators
   */
  invalidateLocations(): void {
    this.invalidatePrefix('locations:');
    this.invalidatePrefix('dashboard:');
  }

  invalidateDepartments(): void {
    this.invalidatePrefix('departments:');
    this.invalidatePrefix('dashboard:');
  }

  invalidateShifts(): void {
    this.invalidatePrefix('shifts:');
    this.invalidatePrefix('dashboard:');
  }

  invalidateHolidays(): void {
    this.invalidatePrefix('holidays:');
    this.invalidatePrefix('dashboard:');
  }

  invalidateDashboard(locationId?: string): void {
    if (locationId) {
      this.invalidatePrefix(`dashboard:${locationId}`);
    } else {
      this.invalidatePrefix('dashboard:');
    }
  }

  clear(): void {
    this.store.clear();
  }
}

export const cacheService = new CacheService();
