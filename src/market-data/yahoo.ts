import YahooFinance from 'yahoo-finance2';
import type {
  ChartRange,
  ChartSeries,
  FxRate,
  MarketDataProvider,
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
import {
  hoursFor,
  sessionWindow,
  toExchangeLocal,
  type SessionPhase,
  type TradingCalendar,
} from '@/src/markets/calendar';
import { getMarket, marketForSymbol, marketIdForSymbol } from '@/src/markets/registry';

// Unofficial Yahoo endpoints (toll-e-plan.md §5) — accepted MVP risk, and the
// reason everything routes through the MarketDataProvider interface.

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * The screener endpoint needs a crumb, and the library only mints one on an
 * ordinary GET. Priming it per screener call meant a throwaway quote on every
 * cache miss — two upstream requests where the screen needs one, against an
 * unofficial endpoint that toll-e-plan.md §5 asks us to be gentle with.
 *
 * Held per process instead, and deliberately NOT expired on a timer: the
 * crumb's lifetime is Yahoo's business and guessing at it is how a wasted
 * request turns into a broken screen. The screener call itself is the probe —
 * `withCrumb` re-primes and retries once on any failure, so the worst case is
 * the two requests we used to make unconditionally, and only on a failure.
 */
let crumbPrimed: Promise<unknown> | undefined;

function primeCrumb(): Promise<unknown> {
  crumbPrimed ??= yf.quote('AAPL').catch(() => undefined);
  return crumbPrimed;
}

async function withCrumb<T>(call: () => Promise<T>): Promise<T> {
  await primeCrumb();
  try {
    return await call();
  } catch {
    crumbPrimed = undefined;
    await primeCrumb();
    return call();
  }
}

const phaseMap: Record<string, SessionPhase> = {
  PRE: 'pre',
  PREPRE: 'pre',
  REGULAR: 'open',
  POST: 'post',
  POSTPOST: 'post',
};

// Range → Yahoo period1/interval. Intraday ranges over-fetch a little so a
// weekend/holiday query still contains the last session, then trim.
const day = 24 * 60 * 60 * 1000;
const rangeSpec: Record<ChartRange, { back: number | 'ytd' | 'max'; interval: '5m' | '15m' | '1d' | '1wk' | '1mo' }> = {
  '1d': { back: 4 * day, interval: '5m' },
  '5d': { back: 9 * day, interval: '15m' },
  '1mo': { back: 32 * day, interval: '1d' },
  '6mo': { back: 184 * day, interval: '1d' },
  ytd: { back: 'ytd', interval: '1d' },
  '1y': { back: 367 * day, interval: '1d' },
  '5y': { back: 5 * 366 * day, interval: '1wk' },
  max: { back: 'max', interval: '1mo' },
};

type YQuote = Awaited<ReturnType<typeof yf.quote>>;

/**
 * The screener's spelling of a classification, which is not the profile's.
 * A profile says 'Software - Infrastructure'; the screener only answers to
 * 'Software—Infrastructure', em dash and no spaces, and returns an empty set
 * for anything else rather than an error.
 */
export function screenerName(name: string): string {
  return name.replace(/ - /g, '—');
}

/**
 * Screener criteria. The endpoint's operator grammar is undocumented and
 * fussy: equality only matches wrapped in an 'or' (the shape Yahoo's own
 * site emits), while gt/lt must be bare AND lowercase — 'GT' and or-wrapped
 * comparisons are silently ignored rather than rejected, which is worse
 * than an error. Verified against the live endpoint 2026-08-14.
 */
const eq = (field: string, value: string) => ({
  operator: 'or',
  operands: [{ operator: 'EQ', operands: [field, value] }],
});
const gt = (field: string, value: number) => ({ operator: 'gt', operands: [field, value] });
const lt = (field: string, value: number) => ({ operator: 'lt', operands: [field, value] });

const ms = (t: Date | number | string | undefined): number | undefined =>
  t === undefined ? undefined : new Date(t).getTime();

/**
 * Yahoo quotes TASE in agorot under the pseudo-currency 'ILA' (₪109.50
 * arrives as `10950`), while the rest of the app — portfolio values,
 * commission floors quoted in real shekels — speaks ILS. The unit is
 * corrected here at the provider boundary so 'ILA' never escapes: every
 * quote-denominated field is divided by 100 and the currency reported as
 * ILS. Ratios (percent change, P/E, beta) and counts (volume) pass through.
 *
 * What counts as quote-denominated was verified against live data, not
 * guessed: prices, day/52wk ranges, market cap, analyst price targets and
 * institutional-holding values all ride the ILA scale (holder value ÷
 * position reproduces the agorot price exactly). EPS and the financials
 * charts do NOT — they are reported in the *statement* currency
 * (`financialCurrency`: ₪7.19 for POLI.TA against a 7,774-agorot price and
 * a coherent P/E of 10.8; USD for TEVA.TA) and must pass through untouched.
 */
const AGOROT_PER_ILS = 100;
const ilaFactor = (currency: string | undefined): number => (currency === 'ILA' ? AGOROT_PER_ILS : 1);
const ilaCurrency = (currency: string | undefined): string | undefined =>
  currency === 'ILA' ? 'ILS' : currency;

/**
 * The extended-session print, when there is one newer than the regular close.
 *
 * The stamp decides this, never `marketState`, whatever the state names
 * suggest. From the after-hours bell until 04:00 ET the state reads `PREPRE`
 * while the figure is still sitting in the `postMarket*` fields — the whole
 * Israeli morning, which is when this app is most likely to be open. And in
 * the other direction, a `REGULAR` quote still carries last night's
 * `postMarket*` unchanged, so a state that merely *permits* a phase would
 * print an hours-stale price beside a live one.
 *
 * A price therefore counts only when it was printed after the regular close
 * it is measured against, and the newest candidate wins: during pre-market
 * both fields are populated, and the morning's print supersedes last night's.
 */
export function extendedOf(q: YQuote): Quote['extended'] {
  const regularAt = ms(q.regularMarketTime) ?? 0;
  const candidates = [
    {
      phase: 'pre' as const,
      price: q.preMarketPrice,
      change: q.preMarketChange ?? 0,
      changePct: q.preMarketChangePercent ?? 0,
      asOf: ms(q.preMarketTime),
    },
    {
      phase: 'post' as const,
      price: q.postMarketPrice,
      change: q.postMarketChange ?? 0,
      changePct: q.postMarketChangePercent ?? 0,
      asOf: ms(q.postMarketTime),
    },
  ].filter(
    (c): c is typeof c & { price: number; asOf: number } =>
      c.price !== undefined && c.asOf !== undefined && c.asOf > regularAt,
  );

  // An unstamped price is dropped rather than shown: the row is labelled by
  // its stamp ("After hours: 8:00 PM EDT"), and an extended figure that
  // cannot say when it was struck is exactly the one nobody should trade on.
  return candidates.sort((a, b) => b.asOf - a.asOf)[0];
}

export function toQuote(q: YQuote): Quote {
  const f = ilaFactor(q.currency);
  const money = (v: number | undefined) => (v === undefined ? undefined : v / f);
  const ext = extendedOf(q);
  return {
    symbol: q.symbol,
    name: q.shortName ?? q.longName ?? q.symbol,
    currency: ilaCurrency(q.currency) ?? 'USD',
    exchange: q.fullExchangeName ?? q.exchange,
    price: (q.regularMarketPrice ?? 0) / f,
    change: (q.regularMarketChange ?? 0) / f,
    changePct: q.regularMarketChangePercent ?? 0,
    previousClose: money(q.regularMarketPreviousClose),
    open: money(q.regularMarketOpen),
    dayLow: money(q.regularMarketDayLow),
    dayHigh: money(q.regularMarketDayHigh),
    wk52Low: money(q.fiftyTwoWeekLow),
    wk52High: money(q.fiftyTwoWeekHigh),
    volume: q.regularMarketVolume,
    avgVolume: q.averageDailyVolume3Month,
    marketCap: money(q.marketCap),
    marketState: q.marketState ? (phaseMap[q.marketState] ?? 'closed') : undefined,
    extended: ext && { ...ext, price: ext.price / f, change: ext.change / f },
    asOf: ms(q.regularMarketTime),
  };
}

export class YahooProvider implements MarketDataProvider {
  async getQuote(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    const res = await yf.quote(symbols);
    return (Array.isArray(res) ? res : [res]).map(toQuote);
  }

  async getChart(symbol: string, range: ChartRange): Promise<ChartSeries> {
    const spec = rangeSpec[range];
    const period1 =
      spec.back === 'max'
        ? new Date('1980-01-01')
        : spec.back === 'ytd'
          ? new Date(new Date().getFullYear(), 0, 1)
          : new Date(Date.now() - spec.back);

    const res = await yf.chart(symbol, { period1, interval: spec.interval });
    const f = ilaFactor(res.meta.currency);
    let points = res.quotes
      .filter((p) => p.close != null)
      .map((p) => ({
        t: new Date(p.date).getTime(),
        close: (p.close as number) / f,
        open: p.open != null ? p.open / f : undefined,
        high: p.high != null ? p.high / f : undefined,
        low: p.low != null ? p.low / f : undefined,
        volume: p.volume ?? undefined,
      }));

    let sessionPrevClose: number | undefined;
    if (range === '1d') {
      // The tape's own last-trade stamp decides whether the exchange is
      // really trading today — the calendar alone cannot tell a bell that
      // just rang from a holiday it does not know about.
      const lastTradeAt = res.meta.regularMarketTime
        ? new Date(res.meta.regularMarketTime).getTime()
        : undefined;
      const session = pickSession(points, marketForSymbol(symbol).calendar, Date.now(), lastTradeAt);
      points = session.points;
      sessionPrevClose = session.previousClose;
    }

    return {
      symbol,
      currency: ilaCurrency(res.meta.currency) ?? 'USD',
      range,
      interval: spec.interval,
      timezone: res.meta.exchangeTimezoneName ?? 'UTC',
      // sessionPrevClose comes off already-converted points; the meta
      // fallback is raw provider data and needs the factor itself.
      previousClose:
        sessionPrevClose ?? (res.meta.chartPreviousClose != null ? res.meta.chartPreviousClose / f : undefined),
      points,
    };
  }

  /**
   * Run a query against Yahoo's POST screener.
   *
   * Yahoo's screener has two faces. The library wraps the GET one, which only
   * serves fifteen canned screens ("day_gainers"); real filters live on a
   * POST endpoint it does not model. So this goes through the client's own
   * fetch — which is the point, since that is what carries the cookie/crumb
   * handshake the endpoint demands. `_fetch` would otherwise apply our POST
   * to the crumb request too and get a 405 back, hence the priming call: an
   * ordinary GET first leaves a cached crumb behind.
   */
  private async runScreener(
    sortField: string,
    sortType: 'ASC' | 'DESC',
    operands: unknown[],
    size = 30,
  ): Promise<{ total: number; quotes: Quote[] }> {
    const body = {
      size,
      offset: 0,
      sortField,
      sortType,
      quoteType: 'EQUITY',
      query: { operator: 'AND', operands },
      userId: '',
      userIdType: 'guid',
    };

    const client = yf as unknown as {
      _fetch: (
        url: string,
        params: Record<string, string>,
        opts: { fetchOptions: RequestInit },
        type: string,
        needsCrumb: boolean,
      ) => Promise<unknown>;
    };
    const res = (await withCrumb(() =>
      client._fetch(
        'https://query2.finance.yahoo.com/v1/finance/screener',
        { lang: 'en-US', region: 'US', formatted: 'false' },
        {
          fetchOptions: {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        },
        'json',
        true,
      ),
    )) as { finance?: { result?: Array<{ total?: number; quotes?: YQuote[] }> } };

    const result = res.finance?.result?.[0];
    return { total: result?.total ?? 0, quotes: (result?.quotes ?? []).map(toQuote) };
  }

  /** Leading instruments in a sector or industry, largest first. */
  async getScreen(kind: ScreenKind, name: string, marketId: string): Promise<Screen> {
    const { total, quotes } = await this.runScreener('intradaymarketcap', 'DESC', [
      // Region keeps a TASE screen on TASE rather than answering with Wall
      // Street's version of the same industry.
      eq('region', marketId.toLowerCase()),
      eq(kind, screenerName(name)),
    ]);
    return { kind, name, total, quotes };
  }

  /**
   * The market's real movers: most active by volume, gainers and losers by
   * percent change across the whole region — not a re-sort of some fixed
   * universe.
   *
   * The screener is only trusted to SHORTLIST. Its filters and sort run on
   * a lagged internal index — mid-session even Yahoo's own canned
   * day_gainers answers with losers in it — so this takes a wide slate on
   * loose indexed filters and ranks it here by the live figures the quotes
   * themselves carry. Whatever order we show is then the order of the
   * numbers on screen. The price/volume floors keep halted and micro
   * listings from topping the change lists with meaningless ±50% prints.
   */
  async getMovers(kind: MoversKind, marketId: string): Promise<Quote[]> {
    const market = getMarket(marketId);
    const floors = [gt('dayvolume', market.moverMinVolume), gt('intradayprice', market.moverMinPrice)];
    const spec: Record<MoversKind, { sort: string; dir: 'ASC' | 'DESC'; extra: unknown[]; rank: (a: Quote, b: Quote) => number; keep: (q: Quote) => boolean }> = {
      mostActive: {
        sort: 'dayvolume',
        dir: 'DESC',
        extra: [],
        rank: (a, b) => (b.volume ?? 0) - (a.volume ?? 0),
        keep: (q) => (q.volume ?? 0) > 0,
      },
      gainers: {
        sort: 'percentchange',
        dir: 'DESC',
        // Loose on purpose: the indexed value only shortlists, the live one decides.
        extra: [gt('percentchange', 0.5)],
        rank: (a, b) => b.changePct - a.changePct,
        keep: (q) => q.changePct > 0,
      },
      losers: {
        sort: 'percentchange',
        dir: 'ASC',
        extra: [lt('percentchange', -0.5)],
        rank: (a, b) => a.changePct - b.changePct,
        keep: (q) => q.changePct < 0,
      },
    };
    const s = spec[kind];
    const { quotes } = await this.runScreener(
      s.sort,
      s.dir,
      [eq('region', marketId.toLowerCase()), ...floors, ...s.extra],
      100,
    );
    // Two classes of junk survive the indexed floors and need the live data
    // to catch: symbols that did not actually trade today (Yahoo test tickers
    // report volume 0 but sit in the index), and whatever listings the market
    // itself says are not equity — `moverExcludeSymbol` in the registry, which
    // is where a per-market rule belongs.
    const base = (sym: string) =>
      market.symbolSuffix && sym.endsWith(market.symbolSuffix)
        ? sym.slice(0, -market.symbolSuffix.length)
        : sym;
    const sane = (q: Quote) =>
      (q.volume ?? 0) > 0 && !market.moverExcludeSymbol?.test(base(q.symbol));
    return quotes
      .filter((q) => sane(q) && s.keep(q))
      .sort(s.rank)
      .slice(0, 30);
  }

  async search(query: string): Promise<SearchResult[]> {
    const res = await yf.search(query);
    return res.quotes
      .filter((q): q is typeof q & { symbol: string } => 'symbol' in q && typeof q.symbol === 'string')
      .map((q) => {
        const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
        const rec = q as Record<string, unknown>;
        return {
          symbol: q.symbol,
          name: str(rec.shortname) ?? str(rec.longname) ?? q.symbol,
          exchange: str(rec.exchDisp),
          type: str(rec.quoteType),
          market: marketIdForSymbol(q.symbol),
        };
      });
  }

  async getSummary(symbol: string): Promise<Summary> {
    const res = await yf.quoteSummary(symbol, {
      modules: ['price', 'summaryProfile', 'summaryDetail', 'defaultKeyStatistics', 'calendarEvents'],
    });
    const price = res.price;
    const detail = res.summaryDetail;
    const stats = res.defaultKeyStatistics;
    const earningsDate = res.calendarEvents?.earnings?.earningsDate?.[0];
    const f = ilaFactor(price?.currency);
    const money = (v: number | undefined) => (v === undefined ? undefined : v / f);

    return {
      symbol,
      name: price?.longName ?? price?.shortName ?? symbol,
      currency: ilaCurrency(price?.currency) ?? 'USD',
      exchange: price?.exchangeName,
      sector: res.summaryProfile?.sector,
      industry: res.summaryProfile?.industry,
      description: res.summaryProfile?.longBusinessSummary,
      stats: {
        marketCap: money(price?.marketCap ?? detail?.marketCap),
        peTtm: detail?.trailingPE,
        // Deliberately NOT scaled: trailingEps is in the statement currency
        // (see the ILA note above), so dividing it by 100 is how POLI.TA's
        // ₪7.19 became ₪0.07. It may still differ from the quote currency
        // for foreign-reporting listings (TEVA.TA reports USD).
        epsTtm: stats?.trailingEps,
        dividendYieldPct: detail?.dividendYield !== undefined ? detail.dividendYield * 100 : undefined,
        beta: detail?.beta,
        wk52Low: money(detail?.fiftyTwoWeekLow),
        wk52High: money(detail?.fiftyTwoWeekHigh),
      },
      nextEarningsDate: earningsDate ? new Date(earningsDate).toISOString().slice(0, 10) : undefined,
    };
  }

  async getNews(symbol: string): Promise<NewsItem[]> {
    const res = await yf.search(symbol, { newsCount: 12, quotesCount: 0 });
    // Search news is fuzzy — untagged/off-symbol items show up (worst on TASE
    // symbols). Only keep articles Yahoo explicitly tagged with the symbol.
    return res.news
      .filter((n) => n.relatedTickers?.includes(symbol))
      .map((n) => ({
        id: n.uuid,
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        publishedAt: new Date(n.providerPublishTime).getTime(),
        // Smallest resolution suffices for a list thumbnail.
        thumbnail: n.thumbnail?.resolutions?.reduce((a, b) => (a.width <= b.width ? a : b))?.url,
        relatedTickers: n.relatedTickers ? [...n.relatedTickers] : undefined,
      }));
  }

  async getAnalysis(symbol: string): Promise<StockAnalysis> {
    // 'price' rides along only for its currency: analyst targets are quoted
    // in the trading unit (agorot on TASE), not the statement currency, and
    // financialData carries no field that says so.
    const res = await yf.quoteSummary(symbol, {
      modules: ['recommendationTrend', 'financialData', 'upgradeDowngradeHistory', 'price'],
    });
    const fin = res.financialData;
    const f = ilaFactor(res.price?.currency);
    const target =
      fin?.targetLowPrice !== undefined && fin?.targetMeanPrice !== undefined && fin?.targetHighPrice !== undefined
        ? {
            low: fin.targetLowPrice / f,
            mean: fin.targetMeanPrice / f,
            high: fin.targetHighPrice / f,
            current: fin.currentPrice !== undefined ? fin.currentPrice / f : undefined,
          }
        : undefined;

    return {
      symbol,
      recommendationTrend: (res.recommendationTrend?.trend ?? []).map((p) => ({
        period: p.period,
        strongBuy: p.strongBuy,
        buy: p.buy,
        hold: p.hold,
        sell: p.sell,
        strongSell: p.strongSell,
      })),
      recommendationKey: fin?.recommendationKey,
      numberOfAnalysts: fin?.numberOfAnalystOpinions,
      target,
      upgrades: (res.upgradeDowngradeHistory?.history ?? [])
        .map((h) => ({
          date: new Date(h.epochGradeDate).getTime(),
          firm: h.firm,
          toGrade: String(h.toGrade),
          fromGrade: h.fromGrade ? String(h.fromGrade) : undefined,
          action: String(h.action),
        }))
        .sort((a, b) => b.date - a.date)
        .slice(0, 20),
    };
  }

  async getFinancials(symbol: string): Promise<StockFinancials> {
    // 'price' rides along only for its currency — see getAnalysis. Note the
    // asymmetry: holder values are position × trading price (agorot on
    // TASE), while everything from `earnings` is statement-currency and
    // passes through untouched.
    const res = await yf.quoteSummary(symbol, {
      modules: ['earnings', 'earningsHistory', 'majorHoldersBreakdown', 'institutionOwnership', 'price'],
    });
    const f = ilaFactor(res.price?.currency);
    const chart = res.earnings?.financialsChart;
    const holders = res.majorHoldersBreakdown;

    // EPS beats: earningsChart quarterly labels ('4Q2025') + actual/estimate.
    const epsHistory = (res.earnings?.earningsChart?.quarterly ?? []).map((q) => {
      const surprisePct =
        q.actual !== undefined && q.estimate ? ((q.actual - q.estimate) / Math.abs(q.estimate)) * 100 : undefined;
      return { period: q.date, actual: q.actual, estimate: q.estimate, surprisePct };
    });

    return {
      symbol,
      currency: res.earnings?.financialCurrency,
      epsHistory,
      revenueEarnings: {
        yearly: (chart?.yearly ?? []).map((y) => ({
          label: String(y.date),
          revenue: y.revenue,
          earnings: y.earnings,
        })),
        quarterly: (chart?.quarterly ?? []).map((q) => ({
          label: q.date,
          revenue: q.revenue,
          earnings: q.earnings,
        })),
      },
      holders: {
        insidersPctHeld: holders?.insidersPercentHeld !== undefined ? holders.insidersPercentHeld * 100 : undefined,
        institutionsPctHeld:
          holders?.institutionsPercentHeld !== undefined ? holders.institutionsPercentHeld * 100 : undefined,
        institutionsCount: holders?.institutionsCount,
        top: (res.institutionOwnership?.ownershipList ?? []).slice(0, 10).map((o) => ({
          organization: o.organization,
          pctHeld: o.pctHeld * 100,
          value: o.value / f,
          reportDate: o.reportDate ? new Date(o.reportDate).toISOString().slice(0, 10) : undefined,
        })),
      },
    };
  }

  async getFx(pair: string): Promise<FxRate> {
    const q = await yf.quote(`${pair}=X`);
    return {
      pair,
      rate: q.regularMarketPrice ?? 0,
      asOf: new Date(q.regularMarketTime ?? Date.now()).toISOString().slice(0, 10),
    };
  }
}

/**
 * Reduce an over-fetched intraday series to a single regular session.
 *
 * A session is bell-to-bell: only regular-hours bars count. Which day wins
 * follows the clock, in the two views the charts draw:
 *
 * - **Trading.** The regular session is running and the tape has printed
 *   inside it, so today is the session — one bar, or none at all. A 5m feed
 *   is up to five minutes behind the bell, and holding yesterday's finished
 *   day over that gap is what made the first minutes of trading render as a
 *   full-width chart of the wrong day. The chart draws the gap from the
 *   previous close and the live quote.
 * - **Closed.** The newest exchange-local day that has actually traded — so
 *   the last finished session stays up through the pre-market, where a
 *   handful of 04:00 prints is not a day.
 *
 * Extended-hours bars are dropped rather than plotted: the pre/post move has
 * its own quote pill, and mixing it in is what stretched fifteen minutes of
 * pre-market across a sixteen-hour axis.
 *
 * `lastTradeAt` is the provider's last-trade stamp. Without a trade inside
 * today's session the exchange is shut whatever the calendar says (an
 * unlisted TASE holiday), and the finished day stays up.
 *
 * `previousClose` is the previous session's last regular print: a fallback
 * datum for the dashed reference line. Callers prefer the quote's official
 * previous close, which is what the percentage pills are computed from. Chart
 * metadata's chartPreviousClose is not usable at all — it sits before the
 * whole over-fetched window, days away.
 */
export function pickSession<T extends { t: number; close: number }>(
  points: T[],
  cal: TradingCalendar,
  now: number = Date.now(),
  lastTradeAt?: number,
): { points: T[]; previousClose?: number } {
  const today = toExchangeLocal(cal, new Date(now));
  const todayHours = hoursFor(cal, today.isoDate, today.weekday);
  const bell = sessionWindow(cal, new Date(now))?.regular;
  const trading =
    todayHours !== undefined &&
    bell !== undefined &&
    today.minuteOfDay >= todayHours.open &&
    today.minuteOfDay < todayHours.close &&
    (lastTradeAt === undefined || lastTradeAt >= bell.start);

  if (points.length === 0) return { points };

  const stamped = points.map((p) => {
    const local = toExchangeLocal(cal, new Date(p.t));
    const hours = hoursFor(cal, local.isoDate, local.weekday);
    return {
      p,
      day: local.isoDate,
      // The bell itself is in: a bar stamped 16:00 is the closing auction,
      // not after-hours.
      regular: hours !== undefined && local.minuteOfDay >= hours.open && local.minuteOfDay <= hours.close,
    };
  });

  const newestFirst = [...new Set(stamped.map((s) => s.day))].sort().reverse();
  const regularOn = (d: string) => stamped.filter((s) => s.day === d && s.regular);
  // While the bell is ringing the session is today's, full stop — even before
  // a single bar has printed. Off hours, the newest day that traded.
  const chosen = trading
    ? today.isoDate
    : (newestFirst.find((d) => regularOn(d).length >= 2) ??
      newestFirst.find((d) => regularOn(d).length >= 1) ??
      // Nothing looks like a regular session — an exchange whose hours we have
      // wrong. Show the newest day whole rather than nothing at all.
      newestFirst[0]);

  const session = regularOn(chosen);
  const kept = session.length || trading ? session : stamped.filter((s) => s.day === chosen);
  const before = stamped.filter((s) => s.day < chosen && s.regular);
  return {
    points: kept.map((s) => s.p),
    previousClose: before.length ? before[before.length - 1].p.close : undefined,
  };
}
