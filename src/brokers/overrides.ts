import type { FeeOverrides, FeeSchedule, TradeFee, TradeFeeOverride } from './types';

// Sparse user overrides layered over a resolved schedule — the same layered
// precedence hoursFor uses in src/markets/calendar.ts (holiday → schedule →
// per-date override). Pure so the merge is unit-testable and reusable by the
// comparison tool.

/** Spread only the keys the override actually sets — undefined must not clobber. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function mergeTradeFee(fee: TradeFee, o: TradeFeeOverride): TradeFee {
  // An override never changes a fee's `type`; only the keys that type
  // actually reads are merged, so a stray `perShare` cannot corrupt a pct fee.
  switch (fee.type) {
    case 'pct':
      return { ...fee, ...defined({ pct: o.pct, min: o.min, max: o.max }) };
    case 'per_share':
      return { ...fee, ...defined({ perShare: o.perShare, min: o.min }) };
    case 'tiered_pct':
      return { ...fee, ...defined({ tiers: o.tiers }) };
  }
}

/**
 * The schedule with a user's overrides merged on top. Merging is sparse and
 * per leaf field: overriding `taseTrade.min` leaves `pct` untouched, and an
 * override on a fee the schedule lacks does not invent one — a broker with
 * no TASE desk stays a broker with no TASE desk.
 */
export function applyOverrides(s: FeeSchedule, o: FeeOverrides | null | undefined): FeeSchedule {
  if (!o) return s;
  const merged: FeeSchedule = { ...s };
  if (s.taseTrade && o.taseTrade) merged.taseTrade = mergeTradeFee(s.taseTrade, o.taseTrade);
  if (s.usTrade && o.usTrade) merged.usTrade = mergeTradeFee(s.usTrade, o.usTrade);
  if (s.usTradePassthrough && o.usTradePassthrough) {
    merged.usTradePassthrough = { ...s.usTradePassthrough, ...defined(o.usTradePassthrough) };
  }
  if (s.accountFee && o.accountFee) merged.accountFee = { ...s.accountFee, ...defined(o.accountFee) };
  if (s.custodyFee && o.custodyFee) {
    merged.custodyFee = {
      ...s.custodyFee,
      ...defined({ minPerPeriod: o.custodyFee.minPerPeriod, maxPerPeriod: o.custodyFee.maxPerPeriod }),
      annual:
        o.custodyFee.annual?.tiers !== undefined
          ? { ...s.custodyFee.annual, tiers: o.custodyFee.annual.tiers }
          : s.custodyFee.annual,
    };
  }
  if (s.fxFeePct !== undefined && o.fxFeePct !== undefined) merged.fxFeePct = o.fxFeePct;
  return merged;
}
