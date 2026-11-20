import 'server-only';

import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { fxRates, priceHistory, splits as splitsTable } from '@/src/db/schema';
import { marketForSymbol } from '@/src/markets/registry';
import type { ChartRange, ChartSeries, FxRate, Quote, Split } from './types';

// Degraded-mode sources for when Yahoo is unreachable (toll-e-plan.md §10):
// FX falls back to official providers (Bank of Israel first — §11 names it as
// the tax-grade source — then ECB via Frankfurter); quotes and daily charts
// fall back to our own persisted price_history closes. News/analysis/
// financials have no free fallback — their UI degrades to empty states.

const FETCH_TIMEOUT = 8_000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

/** Bank of Israel official representative rate — only quotes X→ILS pairs. */
async function boiFx(pair: string): Promise<FxRate> {
  if (!pair.endsWith('ILS')) throw new Error(`BoI cannot quote ${pair}`);
  const base = pair.slice(0, -3);
  const json = (await getJson(`https://boi.org.il/PublicApi/GetExchangeRate?key=${base}`)) as {
    currentExchangeRate: number;
    lastUpdate: string;
  };
  if (typeof json.currentExchangeRate !== 'number') throw new Error('BoI: bad payload');
  return { pair, rate: json.currentExchangeRate, asOf: json.lastUpdate.slice(0, 10) };
}

/** ECB daily reference rates via Frankfurter — generic pairs. */
async function frankfurterFx(pair: string): Promise<FxRate> {
  const base = pair.slice(0, 3);
  const quote = pair.slice(3);
  const json = (await getJson(
    `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`,
  )) as { date: string; rates: Record<string, number> };
  const rate = json.rates?.[quote];
  if (typeof rate !== 'number') throw new Error('Frankfurter: bad payload');
  return { pair, rate, asOf: json.date };
}

/**
 * Last rate we persisted for the pair — the final link in the FX chain.
 *
 * Every successful `getFx` writes `fx_rates`, so by the time all three live
 * sources are unreachable there is almost always an official rate on disk. It
 * is the same shape as the other degraded reads: `asOf` carries the date the
 * rate was official on, so the UI labels an old rate rather than passing it
 * off as today's. Without this link an FX outage fails `getPerformance`
 * outright — totals, months and allocation for every portfolio — because the
 * screen awaits the rate before it computes anything.
 */
export async function getFxFromDb(pair: string): Promise<FxRate> {
  const [row] = await db
    .select()
    .from(fxRates)
    .where(eq(fxRates.pair, pair))
    .orderBy(desc(fxRates.date))
    .limit(1);
  if (!row) throw new Error(`no persisted rate for ${pair}`);
  return { pair, rate: Number(row.rate), asOf: row.date };
}

export async function getFxFallback(pair: string): Promise<FxRate> {
  try {
    return await boiFx(pair);
  } catch {
    try {
      return await frankfurterFx(pair);
    } catch {
      return getFxFromDb(pair);
    }
  }
}

/** Days of history each range needs — mirrors the Yahoo adapter's spec. */
const rangeDays: Record<ChartRange, number | 'ytd' | 'max'> = {
  '1d': 5,
  '5d': 9,
  '1mo': 32,
  '6mo': 184,
  ytd: 'ytd',
  '1y': 367,
  '5y': 5 * 366,
  max: 'max',
};

export function rangeStartDate(range: ChartRange, now: Date): string {
  const days = rangeDays[range];
  const start =
    days === 'max'
      ? new Date('1980-01-01')
      : days === 'ytd'
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getTime() - days * 86_400_000);
  return start.toISOString().slice(0, 10);
}

/**
 * Daily chart replayed from persisted closes. Intraday granularity cannot be
 * reconstructed — 1d/5d degrade to daily bars over the same span.
 */
export async function getChartFromDb(symbol: string, range: ChartRange): Promise<ChartSeries> {
  const rows = await db
    .select()
    .from(priceHistory)
    .where(and(eq(priceHistory.symbol, symbol), gte(priceHistory.date, rangeStartDate(range, new Date()))))
    .orderBy(priceHistory.date);
  if (rows.length === 0) throw new Error(`no persisted closes for ${symbol}`);
  return {
    symbol,
    // The symbol names its market and the market names its currency, so
    // there is nothing to be unknown about. An empty string here does not
    // read as "absent" to a `??` downstream — it reaches the UI and renders
    // the price with no currency sign at all, which is the one thing a
    // degraded mode must not do to a number.
    currency: marketForSymbol(symbol).currency,
    range,
    interval: '1d',
    timezone: 'UTC',
    previousClose: rows.length > 1 ? Number(rows[rows.length - 2].close) : undefined,
    points: rows.map((r) => ({
      t: new Date(`${r.date}T00:00:00Z`).getTime(),
      close: Number(r.close),
      open: r.open === null ? undefined : Number(r.open),
      high: r.high === null ? undefined : Number(r.high),
      low: r.low === null ? undefined : Number(r.low),
      volume: r.volume ?? undefined,
    })),
  };
}

/**
 * Last persisted close as a degraded quote — change is close-over-close.
 *
 * The two most recent rows per symbol come back in ONE round trip: a
 * `row_number()` window partitioned by symbol, filtered to the top two. This
 * is the path taken precisely when the provider is already failing, which is
 * the moment the screen can least afford one round trip per symbol in series.
 *
 * The window is deliberately not bounded by date. Taking "the last two rows"
 * regardless of age is what the per-symbol queries did, and it is what a
 * degraded quote for a thinly-traded or delisted symbol depends on — a
 * cutoff would silently drop those instead of labelling them via `asOf`.
 */
export async function getQuotesFromDb(symbols: string[]): Promise<Quote[]> {
  if (symbols.length === 0) throw new Error('no persisted closes for any requested symbol');

  const ranked = db
    .select({
      symbol: priceHistory.symbol,
      date: priceHistory.date,
      close: priceHistory.close,
      volume: priceHistory.volume,
      rn: sql<number>`row_number() over (partition by ${priceHistory.symbol} order by ${priceHistory.date} desc)`.as(
        'rn',
      ),
    })
    .from(priceHistory)
    .where(inArray(priceHistory.symbol, symbols))
    .as('ranked');

  const rows = await db
    .select({
      symbol: ranked.symbol,
      date: ranked.date,
      close: ranked.close,
      volume: ranked.volume,
    })
    .from(ranked)
    .where(lte(ranked.rn, 2))
    .orderBy(ranked.symbol, desc(ranked.date));

  // Group by symbol, newest first — the ORDER BY above already guarantees it.
  const bySymbol = new Map<string, typeof rows>();
  for (const row of rows) {
    const got = bySymbol.get(row.symbol);
    if (got) got.push(row);
    else bySymbol.set(row.symbol, [row]);
  }

  // Walk the requested symbols, not the map, so the answer keeps the order it
  // was asked in rather than the alphabetical order the window returned.
  const quotes: Quote[] = [];
  for (const symbol of symbols) {
    const got = bySymbol.get(symbol);
    if (!got || got.length === 0) continue;
    const last = Number(got[0].close);
    const prev = got.length > 1 ? Number(got[1].close) : undefined;
    quotes.push({
      symbol,
      name: symbol,
      currency: marketForSymbol(symbol).currency,
      price: last,
      change: prev !== undefined ? last - prev : 0,
      changePct: prev !== undefined && prev !== 0 ? ((last - prev) / prev) * 100 : 0,
      previousClose: prev,
      volume: got[0].volume ?? undefined,
      asOf: new Date(`${got[0].date}T00:00:00Z`).getTime(),
    });
  }
  if (quotes.length === 0) throw new Error('no persisted closes for any requested symbol');
  return quotes;
}

/**
 * Last persisted close on or before `date` — the backdated-prefill fallback.
 *
 * `getCloseOn` answers from the cached `1y` daily chart, so a transaction
 * backdated further than that returns nothing even when `price_history` holds
 * the close: fund NAVs accumulate indefinitely, and any symbol ever charted at
 * `5y`/`max` persisted what those ranges carried. Backdating is a first-class
 * operation here (the tax engine recomputes on any backdate), and a >1y
 * backdate is exactly the tax-relevant kind — a prior-year loss entered late.
 */
export async function getCloseOnFromDb(symbol: string, date: string): Promise<number | null> {
  const [row] = await db
    .select({ close: priceHistory.close })
    .from(priceHistory)
    .where(and(eq(priceHistory.symbol, symbol), lte(priceHistory.date, date)))
    .orderBy(desc(priceHistory.date))
    .limit(1);
  return row ? Number(row.close) : null;
}

/** The splits we persisted for a symbol, oldest first. */
export async function getSplitsFromDb(symbol: string): Promise<Split[]> {
  const rows = await db
    .select()
    .from(splitsTable)
    .where(eq(splitsTable.symbol, symbol))
    .orderBy(splitsTable.date);
  return rows.map((r) => ({ date: r.date, ratio: Number(r.ratio) }));
}
