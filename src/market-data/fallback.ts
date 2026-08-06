import 'server-only';

import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/src/db';
import { priceHistory } from '@/src/db/schema';
import type { ChartRange, ChartSeries, FxRate, Quote } from './types';

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

export async function getFxFallback(pair: string): Promise<FxRate> {
  try {
    return await boiFx(pair);
  } catch {
    return frankfurterFx(pair);
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
    currency: '', // unknown here; display layers already know the market
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

/** Last persisted close as a degraded quote — change is close-over-close. */
export async function getQuotesFromDb(symbols: string[]): Promise<Quote[]> {
  const quotes: Quote[] = [];
  for (const symbol of symbols) {
    const rows = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.symbol, symbol))
      .orderBy(desc(priceHistory.date))
      .limit(2);
    if (rows.length === 0) continue;
    const last = Number(rows[0].close);
    const prev = rows.length > 1 ? Number(rows[1].close) : undefined;
    quotes.push({
      symbol,
      name: symbol,
      currency: '',
      price: last,
      change: prev !== undefined ? last - prev : 0,
      changePct: prev !== undefined && prev !== 0 ? ((last - prev) / prev) * 100 : 0,
      previousClose: prev,
      volume: rows[0].volume ?? undefined,
      asOf: new Date(`${rows[0].date}T00:00:00Z`).getTime(),
    });
  }
  if (quotes.length === 0) throw new Error('no persisted closes for any requested symbol');
  return quotes;
}
