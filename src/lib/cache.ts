/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Ambil data dari cache jika masih dalam batas TTL (Time-To-Live)
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttlMs;
    if (isExpired) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Simpan data ke cache dengan TTL default 3 menit (180.000 ms)
   */
  set<T>(key: string, data: T, ttlMs = 180000): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs,
    });
  }

  /**
   * Hapus kunci tertentu
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate semua kunci yang berawalan prefix (misal: 'academicYears', 'subjects')
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Bersihkan seluruh cache memori
   */
  clear(): void {
    this.store.clear();
  }
}

export const memoryCache = new MemoryCache();

/**
 * Helper untuk mengambil data dengan cache memori otomatis
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlMs = 180000
): Promise<T> {
  const cached = memoryCache.get<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const fresh = await fetcher();
  memoryCache.set(cacheKey, fresh, ttlMs);
  return fresh;
}
