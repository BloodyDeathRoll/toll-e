import type { FeeSchedule, Tier, TieredPctFee, TradeFee } from './types';

// Pure fee arithmetic over a resolved FeeSchedule. No React, no Next, no DB
// — the form imports it like it imports getMarket, and the future broker
// comparison tool imports it unchanged.

export interface TradeInput {
  /** Registry market id — 'US', 'IL'. */
  market: string;
  shares: number;
  pricePerShare: number;
  /** Portfolio value already expressed in the fee's `tierCurrency`. Banks only. */
  tierValue?: number;
  /** User-pinned tier; falls back to auto when stale. */
  tierId?: string;
}

export interface FeeQuote {
  amount: number;
  currency: string;
  /** True when the floor, not the rate, set the price — spec §6 case 1. */
  minApplied: boolean;
  /** Correspondent component, already included in `amount`. */
  passthrough?: number;
  tier?: { id: string; pinned: boolean };
}

/**
 * Which tier a portfolio value lands in. A pinned id wins while it exists;
 * an unknown pin degrades to auto rather than throwing — unlike getBroker,
 * because a pin goes stale the moment a schedule is superseded, and a stale
 * pin must not 500 a page that only wanted a suggestion.
 */
export function resolveTier(f: TieredPctFee, value: number, pinnedId?: string): { tier: Tier; pinned: boolean } {
  if (pinnedId) {
    const pinned = f.tiers.find((t) => t.id === pinnedId);
    if (pinned) return { tier: pinned, pinned: true };
  }
  // Tiers run oldest-smallest → top; `upTo` is inclusive, the top tier has none.
  const auto = f.tiers.find((t) => t.upTo !== undefined && value <= t.upTo) ?? f.tiers[f.tiers.length - 1];
  return { tier: auto, pinned: false };
}

function quoteFee(fee: TradeFee, t: TradeInput): { amount: number; minApplied: boolean; tier?: FeeQuote['tier'] } {
  const value = t.shares * t.pricePerShare;
  switch (fee.type) {
    case 'pct': {
      let amount = fee.pct * value;
      if (fee.max !== undefined) amount = Math.min(amount, fee.max);
      const minApplied = fee.min !== undefined && amount < fee.min;
      return { amount: minApplied ? fee.min! : amount, minApplied };
    }
    case 'per_share': {
      const amount = fee.perShare * t.shares;
      const minApplied = fee.min !== undefined && amount < fee.min;
      return { amount: minApplied ? fee.min! : amount, minApplied };
    }
    case 'tiered_pct': {
      const { tier, pinned } = resolveTier(fee, t.tierValue ?? 0, t.tierId);
      const amount = tier.pct * value;
      const minApplied = tier.min !== undefined && amount < tier.min;
      return { amount: minApplied ? tier.min! : amount, minApplied, tier: { id: tier.id, pinned } };
    }
  }
}

/**
 * The commission this schedule charges for a trade, or null when the broker
 * does not trade the market at all (Interactive Israel has no TASE desk —
 * null, not zero: "free" and "impossible" must not look alike).
 */
export function tradeCommission(s: FeeSchedule, t: TradeInput): FeeQuote | null {
  const fee = t.market === 'IL' ? s.taseTrade : t.market === 'US' ? s.usTrade : undefined;
  if (!fee) return null;

  const base = quoteFee(fee, t);
  const quote: FeeQuote = { amount: base.amount, currency: fee.currency, minApplied: base.minApplied };
  if (base.tier) quote.tier = base.tier;

  // Bank correspondent pass-through rides the same US trade as a second
  // per-share component; its own floor binds independently of the main fee's.
  if (t.market === 'US' && s.usTradePassthrough) {
    const p = s.usTradePassthrough;
    const passthrough = Math.max(p.perShare * t.shares, p.min ?? 0);
    quote.passthrough = passthrough;
    quote.amount += passthrough;
  }
  return quote;
}

/**
 * The month's account fee (דמי טיפול) given the trade commissions already
 * paid that month, expressed in the fee's own currency — the caller converts
 * (spec §2: "מתקזז" = charged only to the extent commissions fall short).
 */
export function accountFeeFor(s: FeeSchedule, commissionsSameCurrency: number): number {
  const fee = s.accountFee;
  if (!fee) return 0;
  return fee.offsetAgainstCommissions ? Math.max(0, fee.monthly - commissionsSameCurrency) : fee.monthly;
}

/**
 * One quarter's custody fee (דמי משמרת) on an average portfolio value in the
 * fee's tierCurrency. Annual rate ÷ 4, clamped to the per-period min/max.
 */
export function custodyFeeFor(s: FeeSchedule, avgValue: number): number {
  const c = s.custodyFee;
  if (!c) return 0;
  const { tier } = resolveTier(c.annual, avgValue);
  let amount = (tier.pct * avgValue) / 4;
  if (c.minPerPeriod !== undefined) amount = Math.max(amount, c.minPerPeriod);
  if (c.maxPerPeriod !== undefined) amount = Math.min(amount, c.maxPerPeriod);
  return amount;
}
