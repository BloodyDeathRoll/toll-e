import YahooFinance from 'yahoo-finance2';
import type {
  ChartRange,
  ChartSeries,
  FxRate,
  MarketDataProvider,
  NewsItem,
  Quote,
  SearchResult,
  StockAnalysis,
  StockFinancials,
  Summary,
} from './types';
import { hoursFor, toExchangeLocal, type SessionPhase, type TradingCalendar } from '@/src/markets/calendar';
import { marketForSymbol } from '@/src/markets/registry';

// Unofficial Yahoo endpoints (toll-e-plan.md §5) — accepted MVP risk, and the
// reason everything routes through the MarketDataProvider interface.

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

function toQuote(q: YQuote): Quote {
  const extended =
    q.marketState === 'PRE' && q.preMarketPrice !== undefined
      ? {
          phase: 'pre' as const,
          price: q.preMarketPrice,
          change: q.preMarketChange ?? 0,
          changePct: q.preMarketChangePercent ?? 0,
        }
      : (q.marketState === 'POST' || q.marketState === 'POSTPOST') && q.postMarketPrice !== undefined
        ? {
            phase: 'post' as const,
            price: q.postMarketPrice,
            change: q.postMarketChange ?? 0,
            changePct: q.postMarketChangePercent ?? 0,
          }
        : undefined;

  return {
    symbol: q.symbol,
    name: q.shortName ?? q.longName ?? q.symbol,
    currency: q.currency ?? 'USD',
    exchange: q.fullExchangeName ?? q.exchange,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePct: q.regularMarketChangePercent ?? 0,
    previousClose: q.regularMarketPreviousClose,
    open: q.regularMarketOpen,
    dayLow: q.regularMarketDayLow,
    dayHigh: q.regularMarketDayHigh,
    wk52Low: q.fiftyTwoWeekLow,
    wk52High: q.fiftyTwoWeekHigh,
    volume: q.regularMarketVolume,
    avgVolume: q.averageDailyVolume3Month,
    marketCap: q.marketCap,
    marketState: q.marketState ? (phaseMap[q.marketState] ?? 'closed') : undefined,
    extended,
    asOf: q.regularMarketTime ? new Date(q.regularMarketTime).getTime() : undefined,
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
    let points = res.quotes
      .filter((p) => p.close != null)
      .map((p) => ({
        t: new Date(p.date).getTime(),
        close: p.close as number,
        open: p.open ?? undefined,
        high: p.high ?? undefined,
        low: p.low ?? undefined,
        volume: p.volume ?? undefined,
      }));

    let sessionPrevClose: number | undefined;
    if (range === '1d' && points.length > 0) {
      const session = pickSession(points, marketForSymbol(symbol).calendar);
      points = session.points;
      sessionPrevClose = session.previousClose;
    }

    return {
      symbol,
      currency: res.meta.currency ?? 'USD',
      range,
      interval: spec.interval,
      timezone: res.meta.exchangeTimezoneName ?? 'UTC',
      previousClose: sessionPrevClose ?? res.meta.chartPreviousClose ?? undefined,
      points,
    };
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
          market: q.symbol.endsWith('.TA') ? 'IL' : q.symbol.includes('.') ? undefined : 'US',
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

    return {
      symbol,
      name: price?.longName ?? price?.shortName ?? symbol,
      currency: price?.currency ?? 'USD',
      exchange: price?.exchangeName,
      sector: res.summaryProfile?.sector,
      stats: {
        marketCap: price?.marketCap ?? detail?.marketCap,
        peTtm: detail?.trailingPE,
        epsTtm: stats?.trailingEps,
        dividendYieldPct: detail?.dividendYield !== undefined ? detail.dividendYield * 100 : undefined,
        beta: detail?.beta,
        wk52Low: detail?.fiftyTwoWeekLow,
        wk52High: detail?.fiftyTwoWeekHigh,
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
    const res = await yf.quoteSummary(symbol, {
      modules: ['recommendationTrend', 'financialData', 'upgradeDowngradeHistory'],
    });
    const fin = res.financialData;
    const target =
      fin?.targetLowPrice !== undefined && fin?.targetMeanPrice !== undefined && fin?.targetHighPrice !== undefined
        ? {
            low: fin.targetLowPrice,
            mean: fin.targetMeanPrice,
            high: fin.targetHighPrice,
            current: fin.currentPrice,
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
    const res = await yf.quoteSummary(symbol, {
      modules: ['earnings', 'earningsHistory', 'majorHoldersBreakdown', 'institutionOwnership'],
    });
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
          value: o.value,
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
 * A session is bell-to-bell: only regular-hours bars count, and the newest
 * exchange-local day that has actually *traded* wins. So the chart keeps
 * showing the last finished session until the next one opens — a handful of
 * 04:00 pre-market prints is not a day, and an index at 09:31 holding a
 * single print would collapse to a dot.
 *
 * Extended-hours bars are dropped rather than plotted: the pre/post move has
 * its own quote pill, and mixing it in is what stretched fifteen minutes of
 * pre-market across a sixteen-hour axis.
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
): { points: T[]; previousClose?: number } {
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
  const chosen =
    newestFirst.find((d) => regularOn(d).length >= 2) ??
    newestFirst.find((d) => regularOn(d).length >= 1) ??
    // Nothing looks like a regular session — an exchange whose hours we have
    // wrong. Show the newest day whole rather than nothing at all.
    newestFirst[0];

  const session = regularOn(chosen);
  const kept = session.length ? session : stamped.filter((s) => s.day === chosen);
  const before = stamped.filter((s) => s.day < chosen && s.regular);
  return {
    points: kept.map((s) => s.p),
    previousClose: before.length ? before[before.length - 1].p.close : undefined,
  };
}
