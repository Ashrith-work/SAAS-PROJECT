// Tiny in-process TTL + LRU cache. Per-instance only (each Vercel lambda has its
// own memory), which is exactly what the agency-rollup read cache wants: a 60s
// shield against repeated identical DB reads within one instance. Not for
// correctness-critical state — it's a short-lived read cache, nothing more.

type Entry<V> = { value: V; expiresAt: number };

export class TtlLruCache<V> {
  private map = new Map<string, Entry<V>>();

  constructor(
    private readonly maxEntries = 100,
    private readonly ttlMs = 60_000,
  ) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch — re-insert so it becomes the most-recently used.
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    // Evict the least-recently used (first key) until within bounds.
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
