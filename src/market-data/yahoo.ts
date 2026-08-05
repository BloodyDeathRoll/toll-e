import YahooFinance from 'yahoo-finance2';
import type {
  ChartRange,
  ChartSeries,
  FxRate,
  MarketDataProvider,
  Quote,
  SearchResult,
  Summary,
} from './types';
import type { SessionPhase } from '@/src/markets/calendar';

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

    // '1d' = last session only: keep points sharing the newest exchange-local day.
    if (range === '1d' && points.length > 0) {
      const offsetMs = (res.meta.gmtoffset ?? 0) * 1000;
      const dayKey = (t: number) => Math.floor((t + offsetMs) / day);
      const last = dayKey(points[points.length - 1].t);
      points = points.filter((p) => dayKey(p.t) === last);
    }

    return {
      symbol,
      currency: res.meta.currency ?? 'USD',
      range,
      interval: spec.interval,
      timezone: res.meta.exchangeTimezoneName ?? 'UTC',
      previousClose: res.meta.chartPreviousClose ?? undefined,
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

  async getFx(pair: string): Promise<FxRate> {
    const q = await yf.quote(`${pair}=X`);
    return {
      pair,
      rate: q.regularMarketPrice ?? 0,
      asOf: new Date(q.regularMarketTime ?? Date.now()).toISOString().slice(0, 10),
    };
  }
}
