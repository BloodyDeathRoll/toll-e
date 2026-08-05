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
// Extended hours: pre-market 04:00–09:30, after-hours 16:00–20:00.
const usDay = { preOpen: h(4, 0), open: h(9, 30), close: h(16, 0), postClose: h(20, 0) };
const usCalendar: TradingCalendar = {
  timezone: 'America/New_York',
  schedules: [
    {
      hours: { 1: usDay, 2: usDay, 3: usDay, 4: usDay, 5: usDay },
    },
  ],
  holidays: [],
};

// TASE: Sun–Thu historically; moved to Mon–Fri in January 2026.
// Encoded as effective-dated schedules so backdated views stay correct.
// TODO(verify): exact switch date and Friday closing time against TASE.
// Pre-open auction phase ~09:00 before continuous trading; TASE has no
// after-hours session (closing-auction prints land within minutes of close).
// TODO(verify): pre-open start and Friday auction times against TASE.
const ilDay = { preOpen: h(9, 0), open: h(9, 59), close: h(17, 25) };
const ilFri = { preOpen: h(9, 0), open: h(9, 59), close: h(13, 45) };
const ilCalendar: TradingCalendar = {
  timezone: 'Asia/Jerusalem',
  schedules: [
    {
      // Legacy week: Sun–Thu, continuous trading ~09:59–17:25.
      hours: { 0: ilDay, 1: ilDay, 2: ilDay, 3: ilDay, 4: ilDay },
    },
    {
      // Mon–Fri week (Friday shortened session).
      effectiveFrom: '2026-01-05',
      hours: { 1: ilDay, 2: ilDay, 3: ilDay, 4: ilDay, 5: ilFri },
    },
  ],
  holidays: [],
};

export const markets: Record<string, MarketDef> = {
  US: {
    id: 'US',
    currency: 'USD',
    currencySymbol: '$',
    // First three feed the homepage trio; the strip shows all of them.
    indexes: ['^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX'],
    calendar: usCalendar,
    numberLocale: 'en-US',
  },
  IL: {
    id: 'IL',
    currency: 'ILS',
    currencySymbol: '₪',
    // Yahoo quirk: TA-125 needs the caret prefix, TA-35/TA-90 don't.
    indexes: ['TA35.TA', '^TA125.TA', 'TA90.TA'],
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
