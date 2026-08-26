// Display-side number formatting. Tax/portfolio math never lives here —
// these only render values the engine (or, for now, the demo data) produced.

/** '52,525.00' — plain decimal, no currency symbol. */
export function fmtNum(n: number, locale: string, dp = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n);
}

/** '+4,470.76' / '−1,600.00' — sign redundancy for color-blind users. */
export function fmtSigned(n: number, locale: string, dp = 2): string {
  return new Intl.NumberFormat(locale, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n);
}

/** '+3.68%' — input in percent units (3.68, not 0.0368). */
export function fmtPct(pct: number, locale: string, dp = 2): string {
  return `${fmtSigned(pct, locale, dp)}%`;
}

/** '0.08%' from a fraction (0.0008) — trailing zeros trimmed, ≤3 dp. */
export function fmtRatePct(fraction: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(fraction * 100)}%`;
}

/**
 * Where a currency's symbol sits, as the currency itself is written — not as
 * the reader's language would write it. `$` leads and `₪` trails in both
 * locales: a dollar figure that renders "1,234.50 $" under Hebrew reads as a
 * different currency to anyone who deals in dollars, and the same is true of
 * a shekel figure forced in front of its symbol under English. Intl decides
 * placement from the locale, so placement is taken away from it here.
 */
const SUFFIX_CURRENCIES = new Set(['ILS']);
const SUFFIX_SYMBOLS = new Set(['₪']);
const BIDI_MARKS = /[\u200e\u200f\u061c]/g;

/** The locale's own symbol for a currency ('$', '₪'), stripped of marks. */
function symbolOf(currency: string, locale: string): string {
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  // Hebrew wraps the symbol in bidi marks; they belong to Intl's own
  // ordering, which is exactly what this is replacing.
  return (part?.value ?? currency).replace(BIDI_MARKS, '');
}

/** Place `symbol` on the side the currency is written on, sign kept outermost. */
function place(raw: string, symbol: string, suffix: boolean): string {
  // Hebrew stamps a left-to-right mark ahead of the sign; it would land
  // between the sign and the symbol and push the two apart.
  const formatted = raw.replace(BIDI_MARKS, '');
  if (suffix) return `${formatted}\u00a0${symbol}`;
  const sign = /^[+\-\u2212]/.exec(formatted)?.[0] ?? '';
  return `${sign}${symbol}${formatted.slice(sign.length)}`;
}

function withSymbol(raw: string, symbol: string, currency: string): string {
  return place(raw, symbol, SUFFIX_CURRENCIES.has(currency));
}

/**
 * An already-formatted figure given its market's symbol, on the side that
 * currency is written on. Screens that build a price out of `fmtNum` and the
 * registry's `currencySymbol` go through here rather than concatenating the
 * two, so `$` leads and `₪` trails in Hebrew exactly as they do in English.
 */
export function fmtWithSym(formatted: string, symbol: string): string {
  return place(formatted, symbol, SUFFIX_SYMBOLS.has(symbol));
}

/** '$126,034.89' / '412,806.40 ₪' — symbol side is the currency's, not the locale's. */
export function fmtMoney(amount: number, currency: string, locale: string, dp = 2): string {
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(amount);
  return withSymbol(n, symbolOf(currency, locale), currency);
}

/** '+$4,120.00' / '-15,340.00 ₪' — signed currency for P&L figures. */
export function fmtMoneySigned(amount: number, currency: string, locale: string, dp = 2): string {
  const n = new Intl.NumberFormat(locale, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(amount);
  return withSymbol(n, symbolOf(currency, locale), currency);
}

/** '5.12T' / '184.2M' — compact notation for caps and volumes. */
export function fmtCompact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(n);
}

/** 'Aug 26, 2026' / '26 באוג׳ 2026' from an ISO date. */
export function fmtDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

/** Month name for a 1-based month number. */
export function fmtMonth(month: number, locale: string, style: 'short' | 'long' = 'long'): string {
  return new Intl.DateTimeFormat(locale, { month: style }).format(
    new Date(Date.UTC(2026, month - 1, 15)),
  );
}
