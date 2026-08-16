/**
 * A small TTL cache for Quran.com responses.
 *
 * The Quran's text and the ayah audio files do not change, so the only reason
 * to expire anything is to pick up upstream corrections to translations and to
 * keep an idle server from holding the whole mushaf in memory forever. That
 * makes a plain time-to-live cache the right shape here — no revalidation, no
 * conditional requests.
 *
 * Two properties matter beyond "don't refetch":
 *
 * - **Single-flight.** Al-Baqarah is six upstream requests. If ten readers open
 *   it at once while the cache is cold, they should share one fetch chain
 *   rather than start ten. Concurrent callers await the same promise.
 * - **Failures are not cached.** A rejected loader is removed from the in-flight
 *   map so the next caller retries, instead of a transient upstream blip being
 *   pinned for the whole TTL.
 */

type CacheEntry = { value: unknown; expiresAt: number };

const DEFAULT_MAX_ENTRIES = 512;

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  /**
   * Return the cached value for `key`, or run `loader` and cache what it
   * resolves to for `ttlMs`.
   */
  async fetch<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      // Refresh insertion order so the hottest surahs are evicted last.
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.value as T;
    }
    if (entry) this.entries.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const request = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  private set(key: string, value: unknown, ttlMs: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Number of live (unexpired) entries. Exposed for tests and diagnostics. */
  get size(): number {
    const now = Date.now();
    let live = 0;
    this.entries.forEach((entry) => {
      if (entry.expiresAt > now) live += 1;
    });
    return live;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}
