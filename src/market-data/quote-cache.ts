import 'server-only';

import type { Quote } from './types';

// Quote caching, keyed by SYMBOL rather than by the set that was asked for.
//
// The generic per-key cache in ./cache is the right shape for everything whose
// answer belongs to its key — a chart, a search, a summary. A quote does not:
// the positions screen ([A,B]), the holdings watchlist ([A,B]) and a user list
// ([A,B,C]) are three different set-keys over the same names, so within one
// 30s window the same ticker went upstream up to three times, and every new
// permutation of a growing watchlist minted another retained entry. Keying by
// symbol makes overlapping asks free, makes the footprint O(symbols) instead
// of O(sets), and coalesces in-flight fetches per symbol — a set that arrives
// while an overlapping set is still in flight waits on the names it shares and
// only fetches the rest.
//
// Semantics deliberately preserved from the set-keyed path:
//  - a symbol the provider answers pricelessly or omits is a per-symbol miss
//    and takes the persisted-close route (the caller's `onMiss`);
//  - a whole-batch failure degrades that whole batch to persisted closes;
//  - "nothing anywhere" is cached as a known absence for the same TTL, so an
//    unknown ticker is not re-asked on every poll;
//  - stale beats broken: an expired value is served when a refresh fails.

/** `null` = known absent (the provider has nothing for this symbol). */
interface Entry {
  value?: Quote | null;
  expires: number;
  /** In-flight refresh — concurrent callers coalesce onto it. */
  pending?: Promise<Quote | null>;
}

const store = new Map<string, Entry>();

/**
 * Hard ceiling on retained symbols. Symbols reach here from unauthenticated
 * routes, so the map is user-controlled and must be capped. One entry per
 * symbol rather than per set makes this bound meaningful: a real working set
 * is the index strip plus a user's lists and holdings.
 */
const MAX_ENTRIES = 5_000;

/** How long a failed refresh holds its stale value before another attempt. */
const ERROR_BACKOFF_MS = 2_000;

/** Map iterates in insertion order, so re-inserting on use makes this LRU. */
function touch(symbol: string, entry: Entry): void {
  store.delete(symbol);
  store.set(symbol, entry);
  for (const oldest of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    // Never evict a fetch other callers are already waiting on.
    if (store.get(oldest)?.pending) continue;
    store.delete(oldest);
  }
}

export interface QuoteCacheOptions {
  ttlMs: number;
  /** Fetch these symbols upstream. May answer for fewer than it was asked. */
  fetchBatch: (symbols: string[]) => Promise<Quote[]>;
  /**
   * Last-resort source for symbols `fetchBatch` did not answer for, and for
   * every symbol of a batch that threw. May answer for fewer, or none.
   */
  onMiss: (symbols: string[]) => Promise<Quote[]>;
  /** How many symbols go upstream at once. */
  batchSize: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Quotes for `symbols`, in the order asked, omitting any the caller's sources
 * had nothing for. Duplicates in the input are asked for once.
 */
export async function cachedQuotes(
  symbols: string[],
  { ttlMs, fetchBatch, onMiss, batchSize }: QuoteCacheOptions,
): Promise<Quote[]> {
  const unique = [...new Set(symbols)];
  if (unique.length === 0) return [];

  const now = Date.now();
  const answers = new Map<string, Promise<Quote | null>>();
  const toFetch: string[] = [];

  for (const symbol of unique) {
    const entry = store.get(symbol);
    if (entry?.pending) {
      answers.set(symbol, entry.pending);
      continue;
    }
    if (entry && entry.value !== undefined && entry.expires > now) {
      touch(symbol, entry);
      answers.set(symbol, Promise.resolve(entry.value));
      continue;
    }
    toFetch.push(symbol);
  }

  if (toFetch.length) {
    // One deferred per symbol, installed as `pending` BEFORE any awaiting, so
    // a concurrent overlapping request coalesces onto it rather than starting
    // a second fetch for the same name.
    const settle = new Map<string, (q: Quote | null) => void>();
    for (const symbol of toFetch) {
      const entry = store.get(symbol) ?? { expires: 0 };
      const pending = new Promise<Quote | null>((resolve) => settle.set(symbol, resolve));
      entry.pending = pending;
      touch(symbol, entry);
      answers.set(symbol, pending);
    }

    const publish = (symbol: string, quote: Quote | null): void => {
      const entry = store.get(symbol);
      if (entry) {
        // "Stale beats broken": a failed refresh with something cached keeps
        // the old value, held briefly so a dead provider is not re-asked by
        // every caller in the meantime.
        const stale = quote === null && entry.value !== undefined && entry.value !== null;
        entry.value = stale ? entry.value : quote;
        entry.expires = Date.now() + (stale ? ERROR_BACKOFF_MS : ttlMs);
        entry.pending = undefined;
        settle.get(symbol)?.(entry.value ?? null);
        return;
      }
      settle.get(symbol)?.(quote);
    };

    // Batches run concurrently and settle independently: one failing batch
    // degrades only its own symbols.
    await Promise.all(
      chunk(toFetch, batchSize).map(async (part) => {
        let live: Quote[] = [];
        try {
          live = await fetchBatch(part);
        } catch {
          live = [];
        }
        const got = new Map(live.map((q) => [q.symbol, q]));
        const missing = part.filter((s) => !got.has(s));
        if (missing.length) {
          const recovered = await onMiss(missing).catch(() => []);
          for (const q of recovered) got.set(q.symbol, q);
        }
        for (const symbol of part) publish(symbol, got.get(symbol) ?? null);
      }),
    );
  }

  const out: Quote[] = [];
  for (const symbol of unique) {
    const quote = await answers.get(symbol);
    if (quote) out.push(quote);
  }
  return out;
}

/** Test seam: drop everything retained. */
export function clearQuoteCache(): void {
  store.clear();
}
