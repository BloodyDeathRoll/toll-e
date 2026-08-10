// Demo dataset backing the design screens until the market-data provider
// (Phase 1) and the tax engine (Phase 3) feed real values. Numbers are
// per-market and match the approved Claude Design frames one-for-one.
// Pure TS — no framework imports (same rule as src/engine/*).

export interface DemoIndex {
  symbol: string;
  name: string;
  nameHe?: string;
  /** Secondary line on the Markets page. */
  longName?: string;
  longNameHe?: string;
  value: number;
  changePct: number;
  /** SVG y-coordinates (0–24 viewBox, lower = higher) for sparklines. */
  spark?: number[];
}

export interface DemoHolding {
  symbol: string;
  name: string;
  nameHe?: string;
  shares: number;
  avgCost: number;
  price: number;
  marketValue: number;
  dayChangePct: number;
  totalGain: number;
  totalGainPct: number;
  taxIfSold: number;
  trades: number;
}

export interface DemoQuote {
  symbol: string;
  name: string;
  nameHe?: string;
  price: number;
  changePct: number;
}

export interface DemoMonthRow {
  /** 1-based month number; label via Intl. */
  month: number;
  gains: number | null;
  losses: number | null;
  net: number;
  /** Earlier-in-the-year losses absorbed by this month's gains. */
  poolUsed: number;
  /** Tax withheld at source at month end; null ⇒ nothing withheld. */
  tax: number | null;
}

export interface DemoSale {
  symbol: string;
  nameHe?: string;
  shares: number;
  date: string;
  amount: number;
  /** null ⇒ shielded. */
  tax: number | null;
}

export interface DemoMarketData {
  portfolio: {
    value: number;
    dayChange: number;
    dayChangePct: number;
    allTimeChange: number;
    allTimePct: number;
    /** Portfolio value curve, y-coords in a 0–150 viewBox. */
    chart: number[];
  };
  indexes: DemoIndex[];
  holdings: DemoHolding[];
  mostActive: DemoQuote[];
  tax: {
    year: number;
    due: number;
    heldInCash: number;
    short: number;
    realizedGains: number;
    realizedLosses: number;
    carriedLoss: number;
    carriedFromYear: number;
    taxable: number;
    ratePct: number;
    filingDue: string;
    months: DemoMonthRow[];
    sales: DemoSale[];
  };
}

export const demo: Record<string, DemoMarketData> = {
  US: {
    portfolio: {
      value: 126_034.89,
      dayChange: 4_470.76,
      dayChangePct: 3.68,
      allTimeChange: 8_357.89,
      allTimePct: 7.1,
      chart: [124, 116, 131, 100, 110, 92, 98, 74, 84, 58, 68, 42, 52, 30, 38, 20, 14],
    },
    indexes: [
      { symbol: '^GSPC', name: 'S&P 500', value: 6_412.08, changePct: 0.62, spark: [17, 15, 18, 12, 14, 9, 11, 6, 4] },
      { symbol: '^IXIC', name: 'Nasdaq', value: 21_880.44, changePct: 0.94, spark: [16, 14, 15, 11, 13, 10, 8, 7, 5] },
      { symbol: '^DJI', name: 'Dow 30', value: 44_102.19, changePct: -0.18, spark: [10, 12, 9, 13, 11, 15, 13, 17, 16] },
      { symbol: '^RUT', name: 'Russell 2000', value: 2_388.61, changePct: 0.31, spark: [12, 14, 11, 9, 12, 8, 10, 9, 7] },
      { symbol: '^VIX', name: 'VIX', value: 14.02, changePct: -2.44, spark: [8, 10, 7, 12, 10, 14, 13, 16, 17] },
    ],
    holdings: [
      { symbol: 'NVDA', name: 'NVIDIA', shares: 250, avgCost: 194.8, price: 210.1, marketValue: 52_525, dayChangePct: 1.64, totalGain: 3_825, totalGainPct: 7.85, taxIfSold: 956.25, trades: 2 },
      { symbol: 'SNDK', name: 'Sandisk', shares: 210, avgCost: 124.9, price: 139.14, marketValue: 29_218.98, dayChangePct: 8.02, totalGain: 2_989.98, totalGainPct: 11.31, taxIfSold: 747.5, trades: 1 },
      { symbol: 'AMD', name: 'Advanced Micro Devices', shares: 120, avgCost: 178.4, price: 213.44, marketValue: 25_613.41, dayChangePct: 5.7, totalGain: 4_205.41, totalGainPct: 19.64, taxIfSold: 1_051.35, trades: 3 },
      { symbol: 'GOOG', name: 'Alphabet', shares: 90, avgCost: 188.2, price: 205.1, marketValue: 18_459, dayChangePct: 1.12, totalGain: 1_521, totalGainPct: 8.98, taxIfSold: 380.25, trades: 1 },
    ],
    mostActive: [
      { symbol: 'NVDA', name: 'NVIDIA', price: 210.1, changePct: 1.64 },
      { symbol: 'TSLA', name: 'Tesla', price: 318.44, changePct: -1.21 },
      { symbol: 'AMD', name: 'Advanced Micro Devices', price: 213.44, changePct: 5.7 },
      { symbol: 'AAPL', name: 'Apple', price: 244.62, changePct: 0.38 },
    ],
    tax: {
      year: 2026,
      // `due` is the year's true liability after the registered shield; the
      // months carry what was actually withheld. Withheld − due = the refund.
      due: 2_932.5,
      heldInCash: 2_170,
      short: 1_990, // against the 4,160 withheld
      realizedGains: 18_240,
      realizedLosses: 4_110,
      carriedLoss: 2_400,
      carriedFromYear: 2025,
      taxable: 14_130, // gains − losses, before the shield
      ratePct: 25,
      filingDue: '2027-04-30',
      months: [
        { month: 2, gains: 3_200, losses: null, net: 3_200, poolUsed: 0, tax: 800 },
        { month: 4, gains: null, losses: -1_600, net: -1_600, poolUsed: 0, tax: null },
        // April's 1,600 is absorbed here, so only 5,300 of the 6,900 is taxed.
        { month: 5, gains: 6_900, losses: null, net: 6_900, poolUsed: 1_600, tax: 1_325 },
        { month: 7, gains: 8_140, losses: null, net: 8_140, poolUsed: 0, tax: 2_035 },
        { month: 8, gains: null, losses: -2_510, net: -2_510, poolUsed: 0, tax: null },
      ],
      sales: [
        { symbol: 'TEVA', shares: 400, date: '2026-08-01', amount: -2_510, tax: null },
        { symbol: 'AMD', shares: 60, date: '2026-07-18', amount: 8_140, tax: 2_035 },
      ],
    },
  },
  IL: {
    portfolio: {
      value: 412_806.4,
      dayChange: 9_412.2,
      dayChangePct: 2.34,
      allTimeChange: 24_030.6,
      allTimePct: 6.18,
      chart: [118, 110, 124, 96, 104, 88, 94, 72, 80, 58, 66, 44, 52, 34, 40, 28, 24],
    },
    indexes: [
      { symbol: 'TA35.TA', name: 'TA-35', nameHe: 'ת״א 35', longName: 'Tel Aviv 35', longNameHe: 'תל אביב 35', value: 2_914.06, changePct: 0.84, spark: [17, 15, 18, 12, 14, 9, 11, 6, 4] },
      { symbol: '^TA125.TA', name: 'TA-125', nameHe: 'ת״א 125', longName: 'Tel Aviv 125', longNameHe: 'תל אביב 125', value: 2_706.31, changePct: 0.67, spark: [16, 14, 15, 11, 13, 10, 8, 7, 5] },
      { symbol: 'TA90.TA', name: 'TA-90', nameHe: 'ת״א 90', longName: 'Tel Aviv 90', longNameHe: 'תל אביב 90', value: 3_180.72, changePct: -0.31, spark: [10, 12, 9, 13, 11, 15, 13, 17, 16] },
      { symbol: 'SME60.TA', name: 'TA-SME60', nameHe: 'ת״א SME60', longName: 'Small & mid caps', longNameHe: 'מניות קטנות ובינוניות', value: 1_842.55, changePct: 0.22, spark: [12, 14, 11, 9, 12, 8, 10, 9, 7] },
    ],
    holdings: [
      { symbol: 'ESLT', name: 'Elbit Systems', nameHe: 'אלביט מערכות', shares: 80, avgCost: 1_540, price: 1_704, marketValue: 136_320, dayChangePct: 0.44, totalGain: 13_120, totalGainPct: 10.6, taxIfSold: 3_280, trades: 2 },
      { symbol: 'NICE', name: 'NICE', nameHe: 'נייס', shares: 180, avgCost: 574.2, price: 612.3, marketValue: 110_214, dayChangePct: 2.08, totalGain: 6_858, totalGainPct: 6.63, taxIfSold: 1_714.5, trades: 1 },
      { symbol: 'POLI', name: 'Bank Hapoalim', nameHe: 'בנק הפועלים', shares: 1_600, avgCost: 52.1, price: 58.42, marketValue: 93_472, dayChangePct: 1.24, totalGain: 10_112, totalGainPct: 12.1, taxIfSold: 2_528, trades: 4 },
    ],
    mostActive: [
      { symbol: 'POLI', name: 'Bank Hapoalim', nameHe: 'בנק הפועלים', price: 58.42, changePct: 1.24 },
      { symbol: 'TEVA', name: 'Teva', nameHe: 'טבע', price: 72.1, changePct: -0.62 },
      { symbol: 'NICE', name: 'NICE', nameHe: 'נייס', price: 612.3, changePct: 2.08 },
      { symbol: 'ESLT', name: 'Elbit Systems', nameHe: 'אלביט מערכות', price: 1_704, changePct: 0.44 },
    ],
    tax: {
      year: 2026,
      due: 10_592,
      heldInCash: 7_838,
      short: 4_437, // against the 12,275 withheld
      realizedGains: 61_400,
      realizedLosses: 12_300,
      carriedLoss: 6_732,
      carriedFromYear: 2025,
      taxable: 49_100, // gains − losses, before the shield
      ratePct: 25,
      filingDue: '2027-04-30',
      months: [
        { month: 1, gains: 12_400, losses: null, net: 12_400, poolUsed: 0, tax: 3_100 },
        { month: 3, gains: null, losses: -5_800, net: -5_800, poolUsed: 0, tax: null },
        // March's 5,800 is absorbed here, so only 15,800 of the 21,600 is taxed.
        { month: 5, gains: 21_600, losses: null, net: 21_600, poolUsed: 5_800, tax: 3_950 },
        { month: 6, gains: 27_400, losses: -6_500, net: 20_900, poolUsed: 0, tax: 5_225 },
      ],
      sales: [
        { symbol: 'TEVA', nameHe: 'טבע', shares: 900, date: '2026-06-12', amount: -6_500, tax: null },
        { symbol: 'ESLT', nameHe: 'אלביט מערכות', shares: 20, date: '2026-05-22', amount: 21_600, tax: 3_950 },
      ],
    },
  },
};

/** USD/ILS demo rate shown on the Markets page footer. */
export const demoFx = { pair: 'USD/ILS', rate: 3.612 };

export interface DemoWatchlist {
  name: string;
  currency: string;
  items: Array<DemoQuote & { spark: number[] }>;
}

export const demoWatchlists: DemoWatchlist[] = [
  {
    name: 'Semis',
    currency: 'USD',
    items: [
      { symbol: 'NVDA', name: 'NVIDIA', price: 210.1, changePct: 1.64, spark: [14, 11, 13, 7, 5] },
      { symbol: 'AMD', name: 'Advanced Micro Devices', price: 213.44, changePct: 5.7, spark: [12, 13, 9, 8, 4] },
      { symbol: 'SNDK', name: 'Sandisk', price: 139.14, changePct: 8.02, spark: [15, 12, 10, 9, 5] },
      { symbol: 'TSM', name: 'Taiwan Semiconductor', price: 248.36, changePct: 1.42, spark: [14, 11, 13, 7, 5] },
      { symbol: 'AVGO', name: 'Broadcom', price: 402.11, changePct: -0.86, spark: [8, 10, 7, 12, 13] },
      { symbol: 'MU', name: 'Micron', price: 118.74, changePct: 2.1, spark: [12, 13, 9, 8, 4] },
    ],
  },
  {
    name: 'TASE picks',
    currency: 'ILS',
    items: [
      { symbol: 'ESLT', name: 'Elbit Systems', nameHe: 'אלביט מערכות', price: 1_704, changePct: 0.44, spark: [13, 11, 12, 8, 6] },
      { symbol: 'NICE', name: 'NICE', nameHe: 'נייס', price: 612.3, changePct: 2.08, spark: [14, 12, 9, 8, 5] },
      { symbol: 'POLI', name: 'Bank Hapoalim', nameHe: 'בנק הפועלים', price: 58.42, changePct: 1.24, spark: [12, 10, 11, 7, 6] },
    ],
  },
  {
    name: 'Dividends',
    currency: 'USD',
    items: [
      { symbol: 'KO', name: 'Coca-Cola', price: 71.18, changePct: 0.12, spark: [11, 12, 10, 11, 9] },
      { symbol: 'O', name: 'Realty Income', price: 58.9, changePct: -0.3, spark: [10, 11, 12, 11, 12] },
    ],
  },
];

export interface DemoStock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  /** Price curve, y-coords in a 0–250 viewBox. */
  chart: number[];
  stats: { open: number; dayLow: number; dayHigh: number; wk52Low: number; wk52High: number; volume: string; marketCap: string; pe: number; eps: number; divYieldPct: number; beta: number };
  /** Revenue/earnings in $B per fiscal year. */
  financials: Array<{ label: string; revenue: number; earnings: number }>;
  financialsMax: number;
  wk52Spark: number[];
  nextEvent: { title: string; titleHe: string; date: string };
}

export const demoStocks: Record<string, DemoStock> = {
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    sector: 'Semiconductors',
    price: 210.1,
    change: 3.39,
    changePct: 1.64,
    chart: [196, 182, 206, 160, 176, 146, 158, 118, 134, 92, 106, 68, 84, 50, 62, 34, 24],
    stats: { open: 207.44, dayLow: 206.1, dayHigh: 211.82, wk52Low: 167.02, wk52High: 225.32, volume: '184.2M', marketCap: '5.12T', pe: 42.6, eps: 4.93, divYieldPct: 0.03, beta: 1.68 },
    financials: [
      { label: 'FY 2023', revenue: 61, earnings: 8 },
      { label: 'FY 2024', revenue: 100, earnings: 56 },
      { label: 'FY 2025', revenue: 136, earnings: 77 },
      { label: 'FY 2026', revenue: 192, earnings: 116 },
    ],
    financialsMax: 200,
    wk52Spark: [50, 54, 42, 46, 30, 38, 34, 44, 40, 22, 10, 26, 34, 20, 28, 16, 18],
    nextEvent: { title: 'Q2 earnings', titleHe: 'דוח רבעון 2', date: '2026-08-26' },
  },
};

/** Fallback so any holding row can open a stock page before real data exists. */
export function getDemoStock(symbol: string): DemoStock {
  const known = demoStocks[symbol];
  if (known) return known;
  const all = [...demo.US.holdings, ...demo.IL.holdings, ...demoWatchlists.flatMap((w) => w.items)];
  const match = all.find((h) => h.symbol === symbol);
  const base = demoStocks.NVDA;
  return {
    ...base,
    symbol,
    name: match?.name ?? symbol,
    exchange: demo.IL.holdings.some((h) => h.symbol === symbol) ? 'TASE' : 'NASDAQ',
    sector: '—',
    price: match && 'price' in match ? match.price : base.price,
    change: 0,
    changePct: match ? ('changePct' in match ? match.changePct : match.dayChangePct) : 0,
  };
}

/** Position demo values used by the add-transaction tax preview. */
export function getDemoHolding(marketId: string, symbol: string): DemoHolding | undefined {
  return demo[marketId]?.holdings.find((h) => h.symbol === symbol);
}
