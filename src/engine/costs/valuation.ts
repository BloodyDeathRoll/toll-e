import { computeSortedPortfolio, sortTxs, type EngineTx } from '../portfolio';

// Reconstructing what a portfolio was worth at past dates, for the bank
// custody fee — banks bill quarterly on portfolio value, which toll-e does
// not store but can derive: holdings at any date from the transactions,
// prices from whatever daily closes happen to be persisted. Pure: closes
// arrive as an input map, never from a provider — a cost figure must not be
// able to make a page slow or fail (misses are normal; price_history is
// populated opportunistically).

export interface DailyClose {
  date: string; // ISO
  close: number;
}

export interface PeriodValuation {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** Mean of the month-end samples, in the transactions' native currency. */
  value: number;
  /**
   * How the samples were priced: every symbol from a market close, none of
   * them, or a mix. The label on the custody row derives from this — an
   * estimate must say what it stands on.
   */
  basis: 'market' | 'partial' | 'cost';
}

/**
 * A close counts only while it is fresh: the last close on or before the
 * sample date, and no older than this. A close from three months back is a
 * guess, not a valuation — those symbols fall back to lot cost basis.
 */
export const MAX_CLOSE_AGE_DAYS = 7;

/** Last calendar day of each of the quarter's three months. */
export function quarterSampleDates(year: number, quarter: 1 | 2 | 3 | 4): string[] {
  return [0, 1, 2].map((i) => {
    const month = (quarter - 1) * 3 + i + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });
}

/** The latest close on or before the date, if the gap is ≤ 7 days. */
export function nearestClose(series: DailyClose[] | undefined, isoDate: string): number | undefined {
  let best: DailyClose | undefined;
  for (const c of series ?? []) {
    if (c.date <= isoDate && (!best || c.date > best.date)) best = c;
  }
  if (!best) return undefined;
  const gapDays = (Date.parse(isoDate) - Date.parse(best.date)) / 86_400_000;
  return gapDays <= MAX_CLOSE_AGE_DAYS ? best.close : undefined;
}

/**
 * One quarter's valuation: the mean of the three month-end samples. A daily
 * mean would need ~90 lookups per symbol per quarter and is no more
 * defensible given source data that is itself opportunistic. Undefined when
 * nothing was held at any sample — there is nothing to bill.
 */
export function quarterValuation(
  txs: EngineTx[],
  year: number,
  quarter: 1 | 2 | 3 | 4,
  closes: Map<string, DailyClose[]>,
): PeriodValuation | undefined {
  let pricedLots = 0;
  let costedLots = 0;
  const sampleValues: number[] = [];

  // Order the timeline once, then take each sample as a prefix of it. The
  // sample dates ascend, so a single advancing cursor covers all three —
  // where filtering and re-sorting per sample replayed the whole history
  // three times over for a figure only `holdings` is read from.
  const sorted = sortTxs(txs);
  let upto = 0;

  for (const date of quarterSampleDates(year, quarter)) {
    while (upto < sorted.length && sorted[upto].tradeDate <= date) upto++;
    const { holdings } = computeSortedPortfolio(sorted.slice(0, upto));
    let value = 0;
    for (const h of holdings) {
      const close = nearestClose(closes.get(h.symbol), date);
      if (close !== undefined) {
        value += h.shares * close;
        pricedLots++;
      } else {
        // Fallback datum: what the shares cost, which at least is a fact.
        value += h.totalCost;
        costedLots++;
      }
    }
    sampleValues.push(value);
  }

  if (pricedLots + costedLots === 0) return undefined;
  return {
    year,
    quarter,
    value: sampleValues.reduce((s, v) => s + v, 0) / sampleValues.length,
    basis: costedLots === 0 ? 'market' : pricedLots === 0 ? 'cost' : 'partial',
  };
}

/**
 * Merge per-portfolio valuations of the same quarter into the account-level
 * one custody is billed on. Values must already share a currency — the
 * caller converts before merging, because no engine converts currencies.
 */
export function mergePeriodValuations(periods: PeriodValuation[]): PeriodValuation[] {
  const byQuarter = new Map<string, PeriodValuation>();
  for (const p of periods) {
    const key = `${p.year}Q${p.quarter}`;
    const acc = byQuarter.get(key);
    if (!acc) {
      byQuarter.set(key, { ...p });
    } else {
      acc.value += p.value;
      if (acc.basis !== p.basis) acc.basis = 'partial';
    }
  }
  return [...byQuarter.values()].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}
