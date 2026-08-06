import 'server-only';

import { cached } from './cache';
import { persistDailyCloses, persistFx } from './persist';
import { YahooProvider } from './yahoo';
import { getMarket } from '@/src/markets/registry';
import type {
  ChartRange,
  ChartSeries,
  FxRate,
  NewsItem,
  Quote,
  SearchResult,
  StockAnalysis,
  StockFinancials,
  Summary,
} from './types';

// The app-facing market-data facade: Yahoo adapter behind per-class TTL
// caching (toll-e-plan.md §5), server-side only. UI code never imports the
// adapter directly.

const provider = new YahooProvider();

const TTL = {
  quote: 30_000, // 15–60s class
  chartIntraday: 5 * 60_000,
  // Plan says 1d for closed history; 1h keeps today's still-open candle
  // reasonably fresh without hammering the endpoint.
  chartDaily: 60 * 60_000,
  search: 60 * 60_000,
  summary: 24 * 60 * 60_000,
  news: 15 * 60_000,
  // Analyst data and reported financials move on earnings cadence.
  analysis: 6 * 60 * 60_000,
  financials: 24 * 60 * 60_000,
  fx: 12 * 60 * 60_000,
} as const;

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const key = [...symbols].sort().join(',');
  return cached(`quote:${key}`, TTL.quote, () => provider.getQuote(symbols));
}

export async function getChart(symbol: string, range: ChartRange): Promise<ChartSeries> {
  const intraday = range === '1d' || range === '5d';
  return cached(`chart:${symbol}:${range}`, intraday ? TTL.chartIntraday : TTL.chartDaily, async () => {
    const series = await provider.getChart(symbol, range);
    persistDailyCloses(series);
    return series;
  });
}

export async function search(query: string, marketId?: string): Promise<SearchResult[]> {
  const results = await cached(`search:${query.toLowerCase()}`, TTL.search, () =>
    provider.search(query),
  );
  if (!marketId) return results;
  // Active market's listings surface first — the lens orders, never filters
  // (toll-e-plan.md §2.2).
  return [...results].sort(
    (a, b) => Number(b.market === marketId) - Number(a.market === marketId),
  );
}

export async function getSummary(symbol: string): Promise<Summary> {
  return cached(`summary:${symbol}`, TTL.summary, () => provider.getSummary(symbol));
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  return cached(`news:${symbol}`, TTL.news, () => provider.getNews(symbol));
}

export async function getAnalysis(symbol: string): Promise<StockAnalysis> {
  return cached(`analysis:${symbol}`, TTL.analysis, () => provider.getAnalysis(symbol));
}

export async function getFinancials(symbol: string): Promise<StockFinancials> {
  return cached(`financials:${symbol}`, TTL.financials, () => provider.getFinancials(symbol));
}

export async function getFx(pair: string): Promise<FxRate> {
  return cached(`fx:${pair}`, TTL.fx, async () => {
    const fx = await provider.getFx(pair);
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
