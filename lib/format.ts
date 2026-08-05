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

/** '$126,034.89' / '₪412,806.40'. */
export function fmtMoney(amount: number, currency: string, locale: string, dp = 2): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(amount);
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
