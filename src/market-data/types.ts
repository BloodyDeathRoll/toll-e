// Provider-agnostic market data contracts (toll-e-plan.md §5). The app only
// ever sees these shapes; swapping Yahoo for EODHD/Polygon/TASE DataHub later
// means writing a new adapter, not touching product code.

import type { SessionPhase } from '@/src/markets/calendar';

export interface Quote {
  symbol: string;
  name: string;
  currency: string;
  exchange?: string;
  price: number;
  change: number;
  changePct: number;
  previousClose?: number;
  open?: number;
  dayLow?: number;
  dayHigh?: number;
  wk52Low?: number;
  wk52High?: number;
  volume?: number;
  /** 3-month average daily volume. */
  avgVolume?: number;
  marketCap?: number;
  /** Provider's session flag, normalized to our phase vocabulary. */
  marketState?: SessionPhase;
  /**
   * Extended-session trade, when the provider reports one newer than the
   * regular close. `asOf` (epoch ms) is what the UI labels it with — an
   * after-hours price is only meaningful next to the moment it was struck.
   */
  extended?: {
    phase: 'pre' | 'post';
    price: number;
    change: number;
    changePct: number;
    asOf: number;
  };
  /** Epoch ms of the quote's last trade — powers "As of HH:MM, delayed". */
  asOf?: number;
}

export type ChartRange = '1d' | '5d' | '1mo' | '6mo' | 'ytd' | '1y' | '5y' | 'max';

export interface ChartPoint {
  /** Epoch ms. */
  t: number;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface ChartSeries {
  symbol: string;
  currency: string;
  range: ChartRange;
  /** Provider interval actually used, e.g. '5m' | '1d' | '1wk'. */
  interval: string;
  timezone: string;
  previousClose?: number;
  points: ChartPoint[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string; // EQUITY | ETF | INDEX | …
  /** Registry market id when recognizable ('US', 'IL'), else undefined. */
  market?: string;
}

export interface KeyStats {
  marketCap?: number;
  peTtm?: number;
  epsTtm?: number;
  dividendYieldPct?: number;
  beta?: number;
  wk52Low?: number;
  wk52High?: number;
}

export interface Summary {
  symbol: string;
  name: string;
  currency: string;
  exchange?: string;
  sector?: string;
  /** Finer than sector: 'Semiconductors' inside 'Technology'. */
  industry?: string;
  /** The provider's business description — a paragraph, not a tagline. */
  description?: string;
  stats: KeyStats;
  nextEarningsDate?: string; // ISO date
}

/** Sector or industry — the two lenses a screen can be built on. */
export type ScreenKind = 'sector' | 'industry';

export interface Screen {
  kind: ScreenKind;
  /** The classification as the provider spells it. */
  name: string;
  /** How many instruments match in total; `quotes` is the leading slice. */
  total: number;
  quotes: Quote[];
}

export interface FxRate {
  pair: string; // 'USDILS'
  rate: number;
  asOf: string; // ISO date
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  link: string;
  /** Epoch ms. */
  publishedAt: number;
  thumbnail?: string;
  /** Symbols Yahoo tagged the article with — rendered as chips with their change. */
  relatedTickers?: string[];
}

export interface RecommendationPeriod {
  /** '0m' | '-1m' | '-2m' | '-3m' — months back from now. */
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface GradeChange {
  /** Epoch ms. */
  date: number;
  firm: string;
  toGrade: string;
  fromGrade?: string;
  /** up | down | init | main | reit */
  action: string;
}

export interface StockAnalysis {
  symbol: string;
  recommendationTrend: RecommendationPeriod[];
  /** e.g. 'buy' — Yahoo's aggregate key. */
  recommendationKey?: string;
  numberOfAnalysts?: number;
  target?: { low: number; mean: number; high: number; current?: number };
  upgrades: GradeChange[];
}

export interface EpsQuarter {
  /** e.g. '4Q2025'. */
  period: string;
  /** Quarter end, ISO date. */
  quarter?: string;
  actual?: number;
  estimate?: number;
  surprisePct?: number;
}

export interface RevenueEarningsPeriod {
  /** '2025' or '1Q2026'. */
  label: string;
  revenue: number;
  earnings: number;
}

export interface TopHolder {
  organization: string;
  pctHeld: number;
  value: number;
  /** ISO date. */
  reportDate?: string;
}

export interface StockFinancials {
  symbol: string;
  /** Currency the financial figures are reported in. */
  currency?: string;
  epsHistory: EpsQuarter[];
  revenueEarnings: { yearly: RevenueEarningsPeriod[]; quarterly: RevenueEarningsPeriod[] };
  holders: {
    insidersPctHeld?: number;
    institutionsPctHeld?: number;
    institutionsCount?: number;
    top: TopHolder[];
  };
}

export interface MarketDataProvider {
  getQuote(symbols: string[]): Promise<Quote[]>;
  getChart(symbol: string, range: ChartRange): Promise<ChartSeries>;
  search(query: string): Promise<SearchResult[]>;
  /** Leading instruments in a sector or industry, largest first. */
  getScreen(kind: ScreenKind, name: string, marketId: string): Promise<Screen>;
  getSummary(symbol: string): Promise<Summary>;
  getFx(pair: string): Promise<FxRate>;
  getNews(symbol: string): Promise<NewsItem[]>;
  getAnalysis(symbol: string): Promise<StockAnalysis>;
  getFinancials(symbol: string): Promise<StockFinancials>;
}
