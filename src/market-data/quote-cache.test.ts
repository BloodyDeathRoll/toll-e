import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { cachedQuotes, clearQuoteCache } from './quote-cache';
import type { Quote } from './types';

const quote = (symbol: string, price: number): Quote => ({
  symbol,
  name: symbol,
  currency: 'USD',
  price,
  change: 0,
  changePct: 0,
});

const TTL = 30_000;
const noMiss = async () => [];

beforeEach(() => {
  clearQuoteCache();
});

describe('cachedQuotes', () => {
  it('serves an overlapping set from cache and fetches only the new names', async () => {
    const fetchBatch = vi.fn(async (symbols: string[]) => symbols.map((s) => quote(s, 10)));
    const opts = { ttlMs: TTL, batchSize: 20, fetchBatch, onMiss: noMiss };

    await cachedQuotes(['AAA', 'BBB'], opts);
    const second = await cachedQuotes(['AAA', 'BBB', 'CCC'], opts);

    expect(second.map((q) => q.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
    // The whole point: the second ask goes upstream for CCC alone. Keyed by
    // set, this would have been a second round trip for all three.
    expect(fetchBatch.mock.calls).toEqual([[['AAA', 'BBB']], [['CCC']]]);
  });

  it('never returns a provider-omitted symbol as a hit', async () => {
    // AAA is answered; BBB is one nothing has a price for. BBB must never
    // reach the caller as a quote, and must not block AAA from being served.
    // The absence itself IS retained for the TTL — the set-keyed cache froze
    // the whole array for 30s and so remembered it too, and re-asking a dead
    // ticker on every 30s poll is the politeness cost this cache exists to
    // avoid. Retained as absent, never served as present.
    const fetchBatch = vi.fn(async (symbols: string[]) =>
      symbols.filter((s) => s === 'AAA').map((s) => quote(s, 10)),
    );
    const onMiss = vi.fn(async () => []);
    const opts = { ttlMs: TTL, batchSize: 20, fetchBatch, onMiss };

    expect((await cachedQuotes(['AAA', 'BBB'], opts)).map((q) => q.symbol)).toEqual(['AAA']);
    expect((await cachedQuotes(['AAA', 'BBB'], opts)).map((q) => q.symbol)).toEqual(['AAA']);
    expect(fetchBatch.mock.calls).toEqual([[['AAA', 'BBB']]]);
    expect(onMiss.mock.calls).toEqual([[['BBB']]]);
  });

  it('re-asks an absent symbol once its entry expires, and can turn it into a hit', async () => {
    // The other half of the contract: an absence is retained, not permanent.
    // A just-listed or resumed symbol starts answering without a restart.
    let listed = false;
    const fetchBatch = vi.fn(async (symbols: string[]) =>
      listed ? symbols.map((s) => quote(s, 10)) : [],
    );
    const opts = { ttlMs: 0, batchSize: 20, fetchBatch, onMiss: noMiss };

    expect(await cachedQuotes(['BBB'], opts)).toEqual([]);
    listed = true;
    expect((await cachedQuotes(['BBB'], opts)).map((q) => q.price)).toEqual([10]);
    expect(fetchBatch).toHaveBeenCalledTimes(2);
  });

  it('degrades only the batch that failed, per miss set', async () => {
    // Two batches, one of which throws outright. The survivors must not be
    // dragged into the degraded path with it, and the casualties must reach
    // onMiss as their own set.
    const fetchBatch = vi.fn(async (symbols: string[]) => {
      if (symbols.includes('CCC')) throw new Error('upstream down');
      return symbols.map((s) => quote(s, 10));
    });
    const onMiss = vi.fn(async (symbols: string[]) => symbols.map((s) => quote(s, 7)));

    const out = await cachedQuotes(['AAA', 'BBB', 'CCC', 'DDD'], {
      ttlMs: TTL,
      batchSize: 2,
      fetchBatch,
      onMiss,
    });

    expect(out.map((q) => [q.symbol, q.price])).toEqual([
      ['AAA', 10],
      ['BBB', 10],
      ['CCC', 7],
      ['DDD', 7],
    ]);
    expect(onMiss.mock.calls).toEqual([[['CCC', 'DDD']]]);
  });

  it('survives onMiss throwing, and does not drag the answered symbols down', async () => {
    // getQuotesFromDb throws when NO requested symbol has a persisted close.
    // That throw is a per-symbol miss like any other: it must not reject the
    // whole call, which would take the symbols that DID answer with it — and,
    // at the getQuotes level, the other half of the stock/fund split too.
    const fetchBatch = vi.fn(async (symbols: string[]) =>
      symbols.filter((s) => s === 'AAA').map((s) => quote(s, 10)),
    );
    const onMiss = vi.fn(async () => {
      throw new Error('no persisted closes for any requested symbol');
    });

    const out = await cachedQuotes(['AAA', 'BBB'], {
      ttlMs: TTL,
      batchSize: 20,
      fetchBatch,
      onMiss,
    });

    expect(out.map((q) => q.symbol)).toEqual(['AAA']);
    expect(onMiss).toHaveBeenCalledWith(['BBB']);
  });

  it('survives every source failing at once', async () => {
    // Both upstream and the degraded source are down. The answer is empty,
    // not a rejection — the positions screen prices at cost and badges it.
    const fetchBatch = vi.fn(async () => {
      throw new Error('upstream down');
    });
    const onMiss = vi.fn(async () => {
      throw new Error('db down');
    });

    await expect(
      cachedQuotes(['AAA', 'BBB'], { ttlMs: TTL, batchSize: 20, fetchBatch, onMiss }),
    ).resolves.toEqual([]);
  });

  it('coalesces concurrent asks for the same symbol into one fetch', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchBatch = vi.fn(async (symbols: string[]) => {
      await gate;
      return symbols.map((s) => quote(s, 10));
    });
    const opts = { ttlMs: TTL, batchSize: 20, fetchBatch, onMiss: noMiss };

    const a = cachedQuotes(['AAA', 'BBB'], opts);
    const b = cachedQuotes(['BBB', 'CCC'], opts);
    release();
    const [first, second] = await Promise.all([a, b]);

    expect(first.map((q) => q.symbol)).toEqual(['AAA', 'BBB']);
    expect(second.map((q) => q.symbol)).toEqual(['BBB', 'CCC']);
    // BBB was in flight when the second ask arrived, so it waited rather than
    // starting a second round trip for the same name.
    expect(fetchBatch.mock.calls).toEqual([[['AAA', 'BBB']], [['CCC']]]);
  });

  it('serves a stale value when a refresh fails', async () => {
    let live = true;
    const fetchBatch = vi.fn(async (symbols: string[]) => {
      if (!live) throw new Error('upstream down');
      return symbols.map((s) => quote(s, 10));
    });
    const opts = { ttlMs: 0, batchSize: 20, fetchBatch, onMiss: noMiss };

    await cachedQuotes(['AAA'], opts);
    live = false;
    const after = await cachedQuotes(['AAA'], opts);

    expect(after.map((q) => q.price)).toEqual([10]);
  });
});
