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

export async function cached<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = (store.get(key) ?? { expires: 0 }) as Entry<T>;

  if (entry.value !== undefined && entry.expires > now) return entry.value;
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
      // Stale beats broken: serve the expired value if we have one.
      if (entry.value !== undefined) return entry.value;
      throw err;
    });
  store.set(key, entry);
  return entry.pending;
}
