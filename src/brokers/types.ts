// The fee primitives Israeli trading costs decompose into
// (docs/israeli-commissions-spec.md §1). Brokers are data, not code: every
// institution is a configuration of these shapes, and the engine models the
// primitives, not the institutions. This module is pure TS — no React, no
// Next, no DB — so a future "compare Israeli brokers" tool imports it
// unchanged.
//
// All `pct` fields are fractions, not percent points: 0.0008 means 0.08%.

/** Percentage of trade value, floored (and rarely capped) in `currency`. */
export interface PctFee {
  type: 'pct';
  pct: number;
  min?: number;
  max?: number;
  currency: string;
}

/** Cents-per-share pricing — the US-trade shape at investment houses. */
export interface PerShareFee {
  type: 'per_share';
  perShare: number;
  min?: number;
  currency: string;
}

/** Options pricing. Catalogue data only in v1 — no code path reads it. */
export interface PerContractFee {
  type: 'per_contract';
  fee: number;
  min?: number;
  currency: string;
}

export interface Tier {
  id: string;
  /** Inclusive upper bound on portfolio value; omitted on the top tier. */
  upTo?: number;
  pct: number;
  min?: number;
}

export interface TieredPctFee {
  type: 'tiered_pct';
  /**
   * Tiers are read against portfolio value in THIS currency — banks tier on
   * ₪ even for a $ trade, while the fee itself is charged in `currency`.
   */
  tierCurrency: string;
  tiers: Tier[];
  currency: string;
}

export type TradeFee = PctFee | PerShareFee | TieredPctFee;

export interface AccountFee {
  monthly: number;
  currency: string;
  /**
   * "מתקזז": the fee is charged only to the extent the month's trade
   * commissions fall short of it — max(0, monthly − commissions).
   */
  offsetAgainstCommissions: boolean;
}

/** Bank custody (דמי משמרת): annual % of portfolio value, billed quarterly. */
export interface CustodyFee {
  annual: TieredPctFee;
  billing: 'quarterly';
  minPerPeriod?: number;
  maxPerPeriod?: number;
}

export interface FeeSchedule {
  /** ISO date. Omitted on a broker's first (or only) schedule. */
  effectiveFrom?: string;
  taseTrade?: TradeFee;
  /** Houses price US trades per share; banks as a tiered percentage. */
  usTrade?: TradeFee;
  /** Bank correspondent-broker pass-through, on the same US trade. */
  usTradePassthrough?: PerShareFee;
  maofOption?: PerContractFee;
  usOption?: PerContractFee;
  accountFee?: AccountFee;
  custodyFee?: CustodyFee;
  /** FX conversion fee — display only, never enters the tax engine. */
  fxFeePct?: number;
}

export interface BrokerDef {
  id: string; // 'meitav-trade', 'leumi' — strings, never enums
  name: string;
  nameHe: string;
  kind: 'investment_house' | 'bank';
  /** Oldest → newest; resolved by effective date, last-wins. */
  schedules: FeeSchedule[];
}

/**
 * Sparse field-level overrides a user layers over a resolved schedule —
 * every rate is negotiable, especially at banks. Merging is per leaf field:
 * overriding `taseTrade.min` leaves `pct` untouched, and an override never
 * changes a fee's `type` or invents a fee the schedule lacks.
 */
export interface TradeFeeOverride {
  pct?: number;
  perShare?: number;
  min?: number;
  max?: number;
  tiers?: Tier[];
}

export interface FeeOverrides {
  taseTrade?: TradeFeeOverride;
  usTrade?: TradeFeeOverride;
  usTradePassthrough?: { perShare?: number; min?: number };
  accountFee?: { monthly?: number; offsetAgainstCommissions?: boolean };
  custodyFee?: {
    annual?: { tiers?: Tier[] };
    minPerPeriod?: number;
    maxPerPeriod?: number;
  };
  fxFeePct?: number;
}
