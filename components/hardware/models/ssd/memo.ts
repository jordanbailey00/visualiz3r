const store = new Map<string, unknown>();

/**
 * Module-level memo for bundles of geometry/materials that are built once
 * and shared by every mount (like kit `cached`, but for any value).
 */
export function memo<T>(key: string, make: () => T): T {
  if (!store.has(key)) store.set(key, make());
  return store.get(key) as T;
}
