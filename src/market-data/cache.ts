// Per-class TTL cache with request coalescing and stale-on-error
// (toll-e-plan.md §5 "politeness"). In-memory is fine for one server
// process; daily closes and FX additionally persist to Postgres.

interface Entry<T> {
  value?: T;
  expires: number;
  /** In-flight fetch — concurrent callers coalesce onto it. */
  pending?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Hard ceiling on retained keys. The keys are minted from user input on
 * unauthenticated routes — `search:${q}` from any query string, `quote:${set}`
 * from any combination of symbols — so an uncapped map is a memory-exhaustion
 * vector, not just untidy. Well above every real working set: the index strip,
 * a user's watchlists and holdings, and the charts behind them are a few
 * hundred keys per process.
 */
const MAX_ENTRIES = 5_000;

/**
 * How long a failed refresh holds its stale value before another attempt is
 * made. Without it, every request during an outage is a fresh (doomed) provider
 * call: the entry stays expired, so "stale beats broken" serves the right value
 * but throttles nothing. Short enough that recovery is felt within one poll of
 * the watchlist screen, long enough to cap the rate under load.
 */
const ERROR_BACKOFF_MS = 2_000;

/** Map iterates in insertion order, so re-inserting on use makes this LRU. */
function touch(key: string, entry: Entry<unknown>): void {
  store.delete(key);
  store.set(key, entry);
  for (const oldest of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    // Never evict a fetch other callers are already waiting on.
    if (store.get(oldest)?.pending) continue;
    store.delete(oldest);
  }
}

export async function cached<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = (store.get(key) ?? { expires: 0 }) as Entry<T>;

  if (entry.value !== undefined && entry.expires > now) {
    touch(key, entry as Entry<unknown>);
    return entry.value;
  }
  if (entry.pending) return entry.pending;

  entry.pending = fetch()
    .then((value) => {
      entry.value = value;
      entry.expires = Date.now() + ttlMs;
      entry.pending = undefined;
      return value;
    })
    .catch((err) => {
      entry.pending = undefined;
      // Stale beats broken: serve the expired value if we have one, and hold
      // it briefly so a provider that is down is not asked again by every
      // caller in the meantime. A key with nothing cached keeps trying — it
      // has nothing to serve, and a cached failure would be worse than a slow
      // one.
      if (entry.value !== undefined) {
        entry.expires = Date.now() + ERROR_BACKOFF_MS;
        return entry.value;
      }
      throw err;
    });
  touch(key, entry as Entry<unknown>);
  return entry.pending;
}
