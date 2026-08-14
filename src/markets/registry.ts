import type { SessionHours, TradingCalendar } from './calendar';
import { taseCalendarDays, type TaseCalendarDays } from './hebrew-calendar';

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
  /**
   * Screener liquidity floors for the Markets movers: listings below this
   * day volume or price are noise — halted, OTC and micro names printing
   * meaningless ±50% moves. Sized to the market: TASE trades far thinner
   * than NYSE. The price floor is in the PROVIDER'S raw quote unit, the one
   * exception to "agorot never escape yahoo.ts": screener criteria are sent
   * upstream before any conversion can happen, so IL's floor is agorot
   * (100 = ₪1) while US's is dollars.
   */
  moverMinVolume: number;
  moverMinPrice: number;
}

const h = (hh: number, mm: number) => hh * 60 + mm;

// NYSE/Nasdaq regular session, US Eastern.
// Extended hours: pre-market 04:00–09:30, after-hours 16:00–20:00.
const usDay = { preOpen: h(4, 0), open: h(9, 30), close: h(16, 0), postClose: h(20, 0) };
// Half-day: 13:00 bell, after-hours ends 17:00. The intraday axis narrows to
// match, so an early close still reads as a full session.
const usHalfDay = { preOpen: h(4, 0), open: h(9, 30), close: h(13, 0), postClose: h(17, 0) };
const usCalendar: TradingCalendar = {
  timezone: 'America/New_York',
  schedules: [
    {
      hours: { 1: usDay, 2: usDay, 3: usDay, 4: usDay, 5: usDay },
    },
  ],
  // NYSE/Nasdaq closures, weekend dates already resolved to their observed
  // weekday. Extend each December for the year after next.
  holidays: [
    // 2026
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Washington's Birthday
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (observed, the 4th is a Saturday)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Christmas
    // 2027
    '2027-01-01',
    '2027-01-18',
    '2027-02-15',
    '2027-03-26', // Good Friday
    '2027-05-31',
    '2027-06-18', // Juneteenth (observed)
    '2027-07-05', // Independence Day (observed)
    '2027-09-06',
    '2027-11-25',
    '2027-12-24', // Christmas (observed)
    // 2028 — New Year's Day falls on a Saturday, and the NYSE alone among
    // US holidays does not observe that one on the Friday before.
    '2028-01-17',
    '2028-02-21',
    '2028-04-14', // Good Friday
    '2028-05-29',
    '2028-06-19',
    '2028-07-04',
    '2028-09-04',
    '2028-11-23',
    '2028-12-25',
  ],
  specialHours: {
    '2026-11-27': usHalfDay, // day after Thanksgiving
    '2026-12-24': usHalfDay, // Christmas Eve
    '2027-11-26': usHalfDay, // day after Thanksgiving
    '2028-07-03': usHalfDay, // day before Independence Day
    '2028-11-24': usHalfDay, // day after Thanksgiving
  },
};

// TASE: Sun–Thu historically; moved to Mon–Fri in January 2026.
// Encoded as effective-dated schedules so backdated views stay correct.
// TODO(verify): exact switch date and Friday closing time against TASE.
// Pre-open auction phase ~09:00 before continuous trading; TASE has no
// after-hours session (closing-auction prints land within minutes of close).
// TODO(verify): pre-open start and Friday auction times against TASE.
const ilDay = { preOpen: h(9, 0), open: h(9, 59), close: h(17, 25) };
const ilFri = { preOpen: h(9, 0), open: h(9, 59), close: h(13, 45) };
// Holiday eves trade a shortened session. Assumed to close with the Friday
// bell at 13:45 — one number to change here if TASE's pre-holiday close
// differs. TODO(verify) against TASE's published trading calendar.
const ilEve = ilFri;

// Derived from the Hebrew calendar, not transcribed — see hebrew-calendar.ts.
// Extend the span as the app's horizon moves; a year outside it simply has no
// holidays, which the "no prints today" fallback survives.
//
// Derived on first read, not at module load. Stamping every Gregorian day in
// 2023–2033 with its Hebrew date is ~8 ms of Intl work, and this module is
// imported by 'use client' components (watchlist rows, price charts, the
// screen view) purely for `getMarket` / `marketForSymbol` / `displaySymbol` —
// so the browser was paying it on every page load, including the ones that
// never look at a TASE closure. The memo makes the second reader free.
let ilDaysMemo: TaseCalendarDays | undefined;
const ilDays = () => (ilDaysMemo ??= taseCalendarDays(2024, 2032));
let ilShortHoursMemo: Record<string, SessionHours> | undefined;

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
  // Festivals close the exchange; their eves shorten it. Election days shut
  // TASE too and follow no calendar — add them here when one is called.
  get holidays() {
    return ilDays().holidays;
  },
  get specialHours() {
    return (ilShortHoursMemo ??= Object.fromEntries(
      ilDays().shortDays.map((iso) => [iso, ilEve]),
    ));
  },
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
    moverMinVolume: 50_000,
    moverMinPrice: 5, // USD
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
    moverMinVolume: 5_000,
    moverMinPrice: 100, // agorot — ₪1 (see the field's unit note)
  },
};

export const marketIds = Object.keys(markets);

export function getMarket(id: string): MarketDef {
  const m = markets[id];
  if (!m) throw new Error(`Unknown market: ${id}`);
  return m;
}

/**
 * The market a symbol belongs to, from its provider suffix ('TEVA.TA' → IL).
 * Lists can hold instruments from several markets at once, and each row must
 * be priced in its own currency — the active lens says which market you are
 * browsing, not what a given ticker trades in.
 */
export function marketForSymbol(symbol: string): MarketDef {
  const suffixed = Object.values(markets).find(
    (m) => m.symbolSuffix && symbol.endsWith(m.symbolSuffix),
  );
  return suffixed ?? Object.values(markets).find((m) => !m.symbolSuffix) ?? markets.US;
}

/**
 * The registry id a provider symbol can be *attributed* to, or undefined when
 * nothing in the registry claims it. Unlike {@link marketForSymbol} — which
 * always answers, because a price has to be formatted somehow — this one
 * admits ignorance, which is what a search result needs: 'VOD.L' is a real
 * listing on an exchange we do not carry, and labelling it 'US' is worse than
 * leaving it unlabelled.
 *
 * The registry decides, not a hardcoded suffix: adding 'UK' with
 * `symbolSuffix: '.L'` starts attributing those hits with no other edit.
 */
export function marketIdForSymbol(symbol: string): string | undefined {
  const suffixed = Object.values(markets).find(
    (m) => m.symbolSuffix && symbol.endsWith(m.symbolSuffix),
  );
  if (suffixed) return suffixed.id;
  // A bare symbol belongs to the market that needs no suffix; a suffix we do
  // not recognize belongs to an exchange we do not carry.
  return symbol.includes('.') ? undefined : Object.values(markets).find((m) => !m.symbolSuffix)?.id;
}

/** Strip the provider suffix for display: 'TEVA.TA' → 'TEVA'. */
export function displaySymbol(symbol: string, market: MarketDef): string {
  return market.symbolSuffix && symbol.endsWith(market.symbolSuffix)
    ? symbol.slice(0, -market.symbolSuffix.length)
    : symbol;
}
