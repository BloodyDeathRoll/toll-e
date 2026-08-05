import type { TradingCalendar } from './calendar';

// Markets are data, not code. Adding a market = adding an entry here
// (+ verifying provider symbol coverage). UI, search, formatting, and
// badges all render from this registry. See toll-e-plan.md §2.2.

export interface MarketDef {
  id: string; // 'US', 'IL', later 'UK', 'EU', 'JP'…
  currency: string; // ISO 4217
  currencySymbol: string;
  /** Provider symbols for the homepage index strip, in display order. */
  indexes: string[];
  calendar: TradingCalendar;
  /** Provider symbol suffix (Yahoo convention); UI shows the clean symbol. */
  symbolSuffix?: string;
  numberLocale: string;
}

const h = (hh: number, mm: number) => hh * 60 + mm;

// NYSE/Nasdaq regular session, US Eastern. Holidays filled in Phase 1.
const usCalendar: TradingCalendar = {
  timezone: 'America/New_York',
  schedules: [
    {
      hours: {
        1: { open: h(9, 30), close: h(16, 0) },
        2: { open: h(9, 30), close: h(16, 0) },
        3: { open: h(9, 30), close: h(16, 0) },
        4: { open: h(9, 30), close: h(16, 0) },
        5: { open: h(9, 30), close: h(16, 0) },
      },
    },
  ],
  holidays: [],
};

// TASE: Sun–Thu historically; moved to Mon–Fri in January 2026.
// Encoded as effective-dated schedules so backdated views stay correct.
// TODO(verify): exact switch date and Friday closing time against TASE.
const ilCalendar: TradingCalendar = {
  timezone: 'Asia/Jerusalem',
  schedules: [
    {
      // Legacy week: Sun–Thu, continuous trading ~09:59–17:25.
      hours: {
        0: { open: h(9, 59), close: h(17, 25) },
        1: { open: h(9, 59), close: h(17, 25) },
        2: { open: h(9, 59), close: h(17, 25) },
        3: { open: h(9, 59), close: h(17, 25) },
        4: { open: h(9, 59), close: h(17, 25) },
      },
    },
    {
      // Mon–Fri week (Friday shortened session).
      effectiveFrom: '2026-01-05',
      hours: {
        1: { open: h(9, 59), close: h(17, 25) },
        2: { open: h(9, 59), close: h(17, 25) },
        3: { open: h(9, 59), close: h(17, 25) },
        4: { open: h(9, 59), close: h(17, 25) },
        5: { open: h(9, 59), close: h(13, 45) },
      },
    },
  ],
  holidays: [],
};

export const markets: Record<string, MarketDef> = {
  US: {
    id: 'US',
    currency: 'USD',
    currencySymbol: '$',
    indexes: ['^GSPC', '^DJI', '^IXIC'],
    calendar: usCalendar,
    numberLocale: 'en-US',
  },
  IL: {
    id: 'IL',
    currency: 'ILS',
    currencySymbol: '₪',
    indexes: ['TA35.TA', 'TA125.TA', 'TA90.TA'],
    calendar: ilCalendar,
    symbolSuffix: '.TA',
    numberLocale: 'he-IL',
  },
};

export const marketIds = Object.keys(markets);

export function getMarket(id: string): MarketDef {
  const m = markets[id];
  if (!m) throw new Error(`Unknown market: ${id}`);
  return m;
}

/** Strip the provider suffix for display: 'TEVA.TA' → 'TEVA'. */
export function displaySymbol(symbol: string, market: MarketDef): string {
  return market.symbolSuffix && symbol.endsWith(market.symbolSuffix)
    ? symbol.slice(0, -market.symbolSuffix.length)
    : symbol;
}
