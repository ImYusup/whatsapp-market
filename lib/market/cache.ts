// lib/market/cache.ts

type CacheItem = {
  value: unknown;
  expiresAt: number;
};

const cache =
  new Map<string, CacheItem>();

// ============================================================
// SET
// ============================================================

export function setCache<T>(
  key: string,
  value: T,
  ttlMs: number
): void {
  cache.set(key, {
    value,
    expiresAt:
      Date.now() + ttlMs,
  });
}

// ============================================================
// GET
// ============================================================

export function getCache<T>(
  key: string
): T | null {
  const item =
    cache.get(key);

  if (!item) {
    return null;
  }

  if (
    Date.now() >
    item.expiresAt
  ) {
    cache.delete(key);

    return null;
  }

  return item.value as T;
}

// ============================================================
// DELETE
// ============================================================

export function deleteCache(
  key: string
): void {
  cache.delete(key);
}

// ============================================================
// CLEAR
// ============================================================

export function clearCache(): void {
  cache.clear();
}