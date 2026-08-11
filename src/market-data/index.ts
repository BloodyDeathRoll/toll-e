import 'server-only';

import { cached } from './cache';
import { getChartFromDb, getFxFallback, getQuotesFromDb } from './fallback';
import { persistDailyCloses, persistFx } from './persist';
import { YahooProvider } from './yahoo';
import { sessionWindow } from '@/src/markets/calendar';
import { getMarket, marketForSymbol } from '@/src/markets/registry';
import type {
  ChartRange,
  ChartSeries,
  FxRate,
  NewsItem,
  Quote,
  Screen,
  ScreenKind,
  SearchResult,
  StockAnalysis,
  StockFinancials,
  Summary,
} from './types';

// The app-facing market-data facade: Yahoo adapter behind per-class TTL
// caching (toll-e-plan.md §5), server-side only. UI code never imports the
// adapter directly.

const provider = new YahooProvider();

// Kill-switch for outage drills and local fallback testing: with
// MARKET_DATA_DISABLE_YAHOO=1 every Yahoo call throws, so requests exercise
// the fallback chain (BoI/ECB FX, persisted closes) exactly like a real block.
function yahoo<T>(fetch: () => Promise<T>): Promise<T> {
  if (process.env.MARKET_DATA_DISABLE_YAHOO === '1') {
    return Promise.reject(new Error('yahoo disabled via MARKET_DATA_DISABLE_YAHOO'));
  }
  return fetch();
}

const TTL = {
  quote: 30_000, // 15–60s class
  chartIntraday: 5 * 60_000,
  // Plan says 1d for closed history; 1h keeps today's still-open candle
  // reasonably fresh without hammering the endpoint.
  chartDaily: 60 * 60_000,
  search: 60 * 60_000,
  // A sector's leading names barely move; their prices do, a little.
  screen: 5 * 60_000,
  summary: 24 * 60 * 60_000,
  news: 15 * 60_000,
  // Analyst data and reported financials move on earnings cadence.
  analysis: 6 * 60 * 60_000,
  financials: 24 * 60 * 60_000,
  fx: 12 * 60 * 60_000,
} as const;

/**
 * How many symbols go to the provider at once. A watchlist screen can ask for
 * far more than this in one breath; the answer is to split the ask, not to
 * drop its tail.
 */
const QUOTE_BATCH = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  // Overlapping watchlists ask for the same ticker twice; the provider should
  // hear it once, and the cache key should not care about the order asked in.
  const wanted = [...new Set(symbols)];
  const key = [...wanted].sort().join(',');
  return cached(`quote:${key}`, TTL.quote, async () => {
    try {
      const batches = await Promise.all(
        chunk(wanted, QUOTE_BATCH).map((part) => yahoo(() => provider.getQuote(part))),
      );
      return batches.flat();
    } catch {
      // Degraded mode: last persisted closes (asOf tells the UI how old).
      return getQuotesFromDb(wanted);
    }
  });
}

/**
 * Intraday TTL, clamped so a cached entry never outlives the session it was
 * fetched in. Five minutes either side of the opening bell is one cache
 * entry, and the one fetched at 09:29 holds *yesterday's* finished session —
 * serving it until 09:34 is what made the first minutes of trading render a
 * full-width chart of the wrong day. Expire exactly on the bell instead.
 */
function intradayTtl(symbol: string, now: number = Date.now()): number {
  const win = sessionWindow(marketForSymbol(symbol).calendar, new Date(now));
  const nextEdge = win
    ? [win.regular.start, win.regular.end].find((edge) => edge > now)
    : undefined;
  if (nextEdge === undefined) return TTL.chartIntraday;
  return Math.max(1_000, Math.min(TTL.chartIntraday, nextEdge - now));
}

export async function getChart(symbol: string, range: ChartRange): Promise<ChartSeries> {
  const intraday = range === '1d' || range === '5d';
  return cached(`chart:${symbol}:${range}`, intraday ? intradayTtl(symbol) : TTL.chartDaily, async () => {
    try {
      const series = await yahoo(() => provider.getChart(symbol, range));
      persistDailyCloses(series);
      return series;
    } catch (err) {
      // Degraded mode: replay persisted daily closes (1d/5d become daily bars).
      return getChartFromDb(symbol, range).catch(() => {
        throw err;
      });
    }
  });
}

export async function search(query: string, marketId?: string): Promise<SearchResult[]> {
  const results = await cached(`search:${query.toLowerCase()}`, TTL.search, () =>
    yahoo(() => provider.search(query)),
  );
  if (!marketId) return results;
  // Active market's listings surface first — the lens orders, never filters
  // (toll-e-plan.md §2.2).
  return [...results].sort(
    (a, b) => Number(b.market === marketId) - Number(a.market === marketId),
  );
}

/** Leading instruments in a sector or industry, largest first. */
export async function getScreen(
  kind: ScreenKind,
  name: string,
  marketId: string,
): Promise<Screen> {
  return cached(`screen:${kind}:${name}:${marketId}`, TTL.screen, () =>
    yahoo(() => provider.getScreen(kind, name, marketId)),
  );
}

export async function getSummary(symbol: string): Promise<Summary> {
  return cached(`summary:${symbol}`, TTL.summary, () => yahoo(() => provider.getSummary(symbol)));
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  return cached(`news:${symbol}`, TTL.news, () => yahoo(() => provider.getNews(symbol)));
}

export async function getAnalysis(symbol: string): Promise<StockAnalysis> {
  return cached(`analysis:${symbol}`, TTL.analysis, () => yahoo(() => provider.getAnalysis(symbol)));
}

export async function getFinancials(symbol: string): Promise<StockFinancials> {
  return cached(`financials:${symbol}`, TTL.financials, () => yahoo(() => provider.getFinancials(symbol)));
}

export async function getFx(pair: string): Promise<FxRate> {
  return cached(`fx:${pair}`, TTL.fx, async () => {
    let fx: FxRate;
    try {
      fx = await yahoo(() => provider.getFx(pair));
    } catch {
      fx = await getFxFallback(pair);
    }
    persistFx(fx);
    return fx;
  });
}

export async function getIndexQuotes(marketId: string): Promise<Quote[]> {
  return getQuotes(getMarket(marketId).indexes);
}

export type {
  ChartRange,
  ChartSeries,
  FxRate,
  NewsItem,
  Quote,
  Screen,
  ScreenKind,
  SearchResult,
  StockAnalysis,
  StockFinancials,
  Summary,
};

/**
 * Last close on or before `date` (ISO, exchange-local) — prefills backdated
 * transaction prices. Served from the cached daily chart, which also
 * persists the closes to price_history.
 */
export async function getCloseOn(symbol: string, date: string): Promise<number | null> {
  const series = await getChart(symbol, '1y');
  let best: number | null = null;
  for (const p of series.points) {
    const localDate = new Date(p.t).toLocaleDateString('en-CA', { timeZone: series.timezone });
    if (localDate <= date) best = p.close;
    else break;
  }
  return best;
}
