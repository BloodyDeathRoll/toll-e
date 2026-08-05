// Money always travels as (amount, currency) — never a bare number.

export interface Money {
  amount: number;
  currency: string; // ISO 4217
}

export const money = (amount: number, currency: string): Money => ({ amount, currency });

export function formatMoney(m: Money, locale: string, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    ...opts,
  }).format(m.amount);
}

/** Signed percent like '+1.23%' — sign redundancy for color-blind users. */
export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    signDisplay: 'exceptZero',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
