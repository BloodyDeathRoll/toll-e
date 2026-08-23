import 'server-only';

import { cached } from './cache';
import { cachedQuotes } from './quote-cache';
import { getChartFromDb, getCloseOnFromDb, getFxFallback, getQuotesFromDb } from './fallback';
import { persistDailyCloses, persistDailyClosesNow, persistFx } from './persist';
import { getGlobesNews } from './globes';
import { getFundHistory, getFundQuotes, getFundSummary } from './maya';
import { YahooProvider } from './yahoo';
import { localDateIn, sessionWindow } from '@/src/markets/calendar';
import { getMarket, isTaseFund, marketForSymbol } from '@/src/markets/registry';
import { searchTaseFunds } from '@/src/markets/tase-funds';
import { hasHebrew, searchTase, taseHeAbout } from '@/src/markets/tase-search';
import type {
  ChartRange,
  ChartSeries,
  FxRate,
  MoversKind,
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
  // The movers boards reshuffle all session long — quote-class freshness.
  movers: 60_000,
  summary: 24 * 60 * 60_000,
  news: 15 * 60_000,
  // Analyst data and reported financials move on earnings cadence.
  analysis: 6 * 60 * 60_000,
  financials: 24 * 60 * 60_000,
  fx: 12 * 60 * 60_000,
  // Mutual fund NAVs move once a day; an hour keeps the day-of-publication
  // update reasonably fresh without hammering Maya.
  fund: 60 * 60_000,
} as const;

/**
 * How many symbols go to the provider at once. A watchlist screen can ask for
 * far more than this in one breath; the answer is to split the ask, not to
 * drop its tail.
 */
const QUOTE_BATCH = 20;

/**
 * A price has to be a positive finite number — the instrument-side twin of
 * {@link usableRate}, and against the same `?? 0`. Yahoo answers for a halted,
 * delisted or just-listed symbol with a full quote envelope (name, currency,
 * exchange) and no `regularMarketPrice`, which the adapter maps to a price of
 * 0. Nothing downstream can tell that apart from a real price: the position
 * screen renders the holding at 0 and −100%, and — because a quote object
 * *did* come back — without the `unpriced` badge that exists to say the number
 * is not a market number. A missing quote is already survivable everywhere; a
 * priceless one has to take the same route rather than invent a price.
 */
const usableQuote = (q: Quote) => Number.isFinite(q.price) && q.price > 0;

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  // Overlapping watchlists ask for the same ticker twice; the provider should
  // hear it once. The cache is keyed per SYMBOL (see ./quote-cache), so the
  // positions screen, the holdings list and a user list share every name they
  // have in common instead of each paying a full round trip for its own set.
  // Mutual funds peel off to the Maya adapter — Yahoo has never heard of them.
  const unique = [...new Set(symbols)];
  const funds = unique.filter(isTaseFund);
  const wanted = unique.filter((s) => !isTaseFund(s));

  // A symbol the provider answered pricelessly (halted, delisted) or dropped
  // from a successful batch is a per-symbol miss, and it takes the same route
  // a fund Maya dropped takes: its last persisted close, with `asOf` saying
  // how old it is — rather than vanishing and leaving the position priced at
  // its own cost. The same route serves a batch that failed outright.
  const fromDb = async (missing: string[]) =>
    (await getQuotesFromDb(missing).catch(() => [])).filter(usableQuote);

  const stockQuotes = wanted.length
    ? cachedQuotes(wanted, {
        ttlMs: TTL.quote,
        batchSize: QUOTE_BATCH,
        fetchBatch: async (part) => (await yahoo(() => provider.getQuote(part))).filter(usableQuote),
        onMiss: fromDb,
      })
    : Promise.resolve<Quote[]>([]);
  const fundQuotes = funds.length
    ? cachedQuotes(funds, {
        ttlMs: TTL.fund,
        batchSize: funds.length,
        fetchBatch: async (part) => (await getFundQuotes(part)).filter(usableQuote),
        onMiss: fromDb,
      })
    : Promise.resolve<Quote[]>([]);
  return (await Promise.all([stockQuotes, fundQuotes])).flat();
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
  if (isTaseFund(symbol)) {
    // Funds are NAV-a-day: Maya serves one month, the database accumulates the
    // rest. Persist what Maya has, then answer from the persisted series —
    // one code path whether Maya answered or not. Sub-monthly ranges widen to
    // the month so a "1D" ask still draws a line rather than a dot.
    const effective: ChartRange = range === '1d' || range === '5d' ? '1mo' : range;
    return cached(`fundchart:${symbol}:${effective}`, TTL.fund, async () => {
      const points = await getFundHistory(symbol).catch(() => []);
      if (points.length > 0) {
        await persistDailyClosesNow({
          symbol,
          currency: 'ILS',
          range: effective,
          interval: '1d',
          timezone: 'Asia/Jerusalem',
          points,
        }).catch(() => {});
      }
      return getChartFromDb(symbol, effective);
    });
  }
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
  // TASE catalogue hits (local, shipped data): the provider rejects Hebrew
  // queries outright and knows no Hebrew names, so the catalogue is the only
  // path to Israeli listings by Hebrew name or ticker — and it also catches
  // Latin queries the provider misses ('poali' → POLI.TA).
  // Skipped outright when the lens is another market: its rows would only be
  // filtered away below, and their presence would wrongly downgrade a provider
  // outage to "no results" for a market the catalogue says nothing about.
  const local: SearchResult[] =
    marketId && marketId !== 'IL'
      ? []
      : searchTase(query).map((e) => ({
          symbol: e.symbol,
          name: hasHebrew(query) ? e.heName : e.name,
          exchange: 'Tel Aviv',
          type: e.type,
          market: 'IL',
        }));
  // Mutual funds close the IL list: securities first, funds after — the same
  // order a broker's search presents them in.
  const funds = !marketId || marketId === 'IL' ? searchTaseFunds(query) : [];
  let remote: SearchResult[] = [];
  if (!hasHebrew(query)) {
    // A provider outage degrades to catalogue-only rather than failing the
    // whole search — but only when the catalogue actually has an answer.
    const fetch = () =>
      cached(`search:${query.toLowerCase()}`, TTL.search, () => yahoo(() => provider.search(query)));
    remote = local.length + funds.length > 0 ? await fetch().catch(() => []) : await fetch();
  }
  const seen = new Set(remote.map((r) => r.symbol));
  // Provider rows win the dedupe: their names carry the fuller legal form.
  const results = [...remote, ...local.filter((r) => !seen.has(r.symbol)), ...funds];
  if (!marketId) return results;
  // The lens filters: browsing TASE, a US ticker is not a result at all, and
  // vice versa. Listings on an exchange we do not carry (market undefined)
  // are nobody's, so they never surface either.
  return results.filter((r) => r.market === marketId);
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

/** The market's real movers — most active, gainers, losers — off the screener. */
export async function getMovers(kind: MoversKind, marketId: string): Promise<Quote[]> {
  return cached(`movers:${kind}:${marketId}`, TTL.movers, () =>
    yahoo(() => provider.getMovers(kind, marketId)),
  );
}

export async function getSummary(symbol: string): Promise<Summary> {
  if (isTaseFund(symbol)) {
    return cached(`fundsummary:${symbol}`, TTL.fund, () => getFundSummary(symbol));
  }
  const summary = await cached(`summary:${symbol}`, TTL.summary, () =>
    yahoo(() => provider.getSummary(symbol)),
  );
  // TASE listings: the provider writes about Israeli companies in English
  // only; the catalogue carries the company's own Hebrew text, so a Hebrew
  // reader gets the origin rather than a translation.
  const heAbout = taseHeAbout(symbol);
  return heAbout ? { ...summary, heDescription: heAbout } : summary;
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  // IL listings: Yahoo has next to nothing on TASE, so the market's own press
  // (Globes' capital-market feed) fills the tab — provider items, when any
  // exist (dual-listed names), lead.
  if (marketForSymbol(symbol).id === 'IL') {
    return cached(`news:${symbol}`, TTL.news, async () => {
      const [own, market] = await Promise.all([
        isTaseFund(symbol)
          ? Promise.resolve<NewsItem[]>([])
          : yahoo(() => provider.getNews(symbol)).catch(() => []),
        getGlobesNews().catch(() => []),
      ]);
      const seen = new Set(own.map((n) => n.link));
      return [...own, ...market.filter((n) => !seen.has(n.link))];
    });
  }
  return cached(`news:${symbol}`, TTL.news, () => yahoo(() => provider.getNews(symbol)));
}

export async function getAnalysis(symbol: string): Promise<StockAnalysis> {
  return cached(`analysis:${symbol}`, TTL.analysis, () => yahoo(() => provider.getAnalysis(symbol)));
}

export async function getFinancials(symbol: string): Promise<StockFinancials> {
  return cached(`financials:${symbol}`, TTL.financials, () => yahoo(() => provider.getFinancials(symbol)));
}

/**
 * A rate has to be a positive finite number. Nothing else is a degraded rate
 * — it is a wrong one, and silently: `makeConvert(0, 'ILS')` zeroes every USD
 * figure on the page and `makeConvert(0, 'USD')` turns every ILS one into
 * Infinity. The adapter can produce exactly that (`regularMarketPrice ?? 0`),
 * which is the "invent a rate" the fallback chain exists to avoid.
 */
const usableRate = (fx: FxRate) => Number.isFinite(fx.rate) && fx.rate > 0;

export async function getFx(pair: string): Promise<FxRate> {
  return cached(`fx:${pair}`, TTL.fx, async () => {
    let fx: FxRate;
    try {
      fx = await yahoo(() => provider.getFx(pair));
      // An unusable answer is an outage, not an answer: take the same route a
      // thrown one takes, down the BoI → ECB → persisted chain.
      if (!usableRate(fx)) throw new Error(`unusable rate for ${pair}: ${fx.rate}`);
    } catch {
      fx = await getFxFallback(pair);
    }
    // Every link exhausted and still no rate. Failing here is loud, and loud
    // beats a page of zeroes and infinities — and beats writing the bad rate
    // to fx_rates, where `onConflictDoNothing` would make it the day's answer
    // for good.
    if (!usableRate(fx)) throw new Error(`no usable rate for ${pair}`);
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
  MoversKind,
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
 *
 * Past the chart's one-year window the chart has nothing to say, but
 * price_history often does — so fall back to it rather than answering `null`
 * and prefilling an empty field on exactly the backdate that matters most.
 * The value is a suggestion the user confirms, which is what makes serving a
 * genuinely old close acceptable here.
 */
export async function getCloseOn(symbol: string, date: string): Promise<number | null> {
  const series = await getChart(symbol, '1y');
  let best: number | null = null;
  for (const p of series.points) {
    const localDate = localDateIn(series.timezone, p.t);
    if (localDate <= date) best = p.close;
    else break;
  }
  if (best !== null) return best;
  return getCloseOnFromDb(symbol, date).catch(() => null);
}
