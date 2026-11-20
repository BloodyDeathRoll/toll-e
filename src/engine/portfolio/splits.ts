// Stock splits, applied as a pure pre-pass over the transaction timeline.
// Transactions stay stored as executed; everything derived (lots, positions,
// tax) is computed in today's share units, the scale quotes arrive in.

import type { EngineTx } from './index';

export interface Split {
  /** ISO ex-date (exchange-local): trades before it are in pre-split units. */
  date: string;
  /** New shares per old share: 8 for an 8:1 split, 0.1 for a 1:10 reverse. */
  ratio: number;
}

export type SplitsBySymbol = ReadonlyMap<string, readonly Split[]>;

/** Shares today per share traded on `tradeDate`. */
export function splitFactor(splits: readonly Split[] | undefined, tradeDate: string): number {
  let factor = 1;
  for (const s of splits ?? []) if (s.date > tradeDate && s.ratio > 0) factor *= s.ratio;
  return factor;
}

/**
 * Restate each transaction in today's share units. Trade value is preserved
 * (shares × price), so cost basis, proceeds and tax are unchanged.
 * shortcut: fractional shares from a reverse split are kept, not cashed out;
 * upgrade when cash-in-lieu needs to appear as a taxable sale.
 */
export function applySplits(txs: EngineTx[], splits: SplitsBySymbol): EngineTx[] {
  return txs.map((tx) => {
    const f = splitFactor(splits.get(tx.symbol), tx.tradeDate);
    return f === 1 ? tx : { ...tx, shares: tx.shares * f, pricePerShare: tx.pricePerShare / f };
  });
}
