import { accountFeeFor, custodyFeeFor } from '@/src/brokers/fees';
import type { FeeSchedule } from '@/src/brokers/types';
import type { PeriodValuation } from './valuation';

// The cost ledger: what a year of trading cost in fees, next to what it cost
// in tax. Pure and FX-free — the no-FX rule binds engines, so anything that
// needs a conversion (the fee offset, custody valuations) arrives already
// converted from src/server/costs.ts, with the rate travelling in the
// payload for audit. Totals are grouped by currency and never summed across
// them; conversion for display is the presentation layer's job.

export interface CostsTx {
  tradeDate: string; // ISO
  commission: number;
  currency: string;
}

export interface CostsInput {
  year: number;
  /** ISO date bounding accrual: months and quarters after it do not exist yet. */
  today: string;
  /** Every trade across the account — commissions total per month/currency. */
  txs: CostsTx[];
  /** The user's resolved fee schedule; null = no broker set, periodic fees 0. */
  schedule: FeeSchedule | null;
  /** Promo waiver: months ending on or before this date owe no account fee. */
  accountFeeWaivedUntil?: string | null;
  /**
   * When the account was opened. The fee clock starts here — a bank charges
   * for the account's existence, trades or not, so backdating this
   * populates the earlier months with fees.
   */
  accountOpenedAt?: string | null;
  /** Fallback fee-clock start for profiles that never set an opening date. */
  firstTradeDate?: string;
  /**
   * Month (1-12) → that month's commissions expressed in the account fee's
   * currency. Commissions in any currency count toward the offset (a
   * US-only month still earns the waiver), so the server converts before
   * the engine sees them.
   */
  commissionsInFeeCurrency?: Partial<Record<number, number>>;
  /**
   * Account-level quarter valuations for custody, already in the custody
   * fee's tier currency. Only quarters that have actually ended belong here.
   */
  valuations?: PeriodValuation[];
}

export interface MonthCosts {
  month: number; // 1-12
  /** That month's trade commissions, by currency. */
  tradeCommissions: Record<string, number>;
  /** Account fee actually charged that month (post offset/waiver), fee currency. */
  accountFee: number;
}

export interface CostsLedger {
  year: number;
  /** Year totals by currency — never summed across currencies. */
  tradeCommissions: Record<string, number>;
  /** Months with any commission or fee, ascending. */
  months: MonthCosts[];
  accountFee: { amount: number; currency: string } | null;
  /**
   * Estimated — never "paid": it is an estimate of a charge, not a record of
   * one. `basis` says what the valuation behind it stands on, and
   * `quartersAtCost` of `quarters` feeds the honesty label.
   */
  custody: {
    amount: number;
    currency: string;
    basis: PeriodValuation['basis'];
    quarters: number;
    quartersAtCost: number;
  } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (iso: string) => Number(iso.slice(5, 7));
const yearOf = (iso: string) => Number(iso.slice(0, 4));

export function computeCosts(input: CostsInput): CostsLedger {
  const { year, today, schedule } = input;

  // Trade commissions: sum the year's stored figures per month and currency.
  const byMonth = new Map<number, Record<string, number>>();
  const yearTotals: Record<string, number> = {};
  for (const tx of input.txs) {
    if (yearOf(tx.tradeDate) !== year || tx.commission <= 0) continue;
    const m = monthOf(tx.tradeDate);
    const acc = byMonth.get(m) ?? {};
    acc[tx.currency] = round2((acc[tx.currency] ?? 0) + tx.commission);
    byMonth.set(m, acc);
    yearTotals[tx.currency] = round2((yearTotals[tx.currency] ?? 0) + tx.commission);
  }

  // Account fee: one per account per month, from the first trade ever,
  // minus waived months, minus the commission offset — and only for months
  // that have fully ENDED. A running month is not billed yet, and at an
  // offset broker its trades can still cover the fee; showing it mid-month
  // would report a charge nobody has collected and no one may ever collect.
  const feeDef = schedule?.accountFee;
  const monthEnd = (m: number) => {
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  };
  const accountFeeByMonth = new Map<number, number>();
  const feeClockStart = input.accountOpenedAt ?? input.firstTradeDate;
  if (feeDef && schedule && feeClockStart) {
    for (let m = 1; m <= 12; m++) {
      if (monthEnd(m) >= today) break; // the month is not over yet
      if (monthEnd(m) < feeClockStart) continue; // before the account existed
      if (input.accountFeeWaivedUntil && monthEnd(m) <= input.accountFeeWaivedUntil) continue;
      // The offset is what makes "actually collected" true or false: a month
      // whose commissions reached the fee charges 0 and never shows.
      const fee = accountFeeFor(schedule, input.commissionsInFeeCurrency?.[m] ?? 0);
      if (fee > 0) accountFeeByMonth.set(m, round2(fee));
    }
  }
  const accountTotal = [...accountFeeByMonth.values()].reduce((s, v) => s + v, 0);

  // Custody: apply the schedule to each supplied quarter valuation.
  let custody: CostsLedger['custody'] = null;
  if (schedule?.custodyFee && input.valuations?.length) {
    const inYear = input.valuations.filter((v) => v.year === year);
    if (inYear.length) {
      const amount = inYear.reduce((s, v) => s + custodyFeeFor(schedule, v.value), 0);
      const atCost = inYear.filter((v) => v.basis === 'cost').length;
      const allMarket = inYear.every((v) => v.basis === 'market');
      custody = {
        amount: round2(amount),
        currency: schedule.custodyFee.annual.currency,
        basis: allMarket ? 'market' : atCost === inYear.length ? 'cost' : 'partial',
        quarters: inYear.length,
        quartersAtCost: atCost,
      };
    }
  }

  const months: MonthCosts[] = [];
  for (let m = 1; m <= 12; m++) {
    const trade = byMonth.get(m);
    const fee = accountFeeByMonth.get(m) ?? 0;
    if (!trade && fee === 0) continue;
    months.push({ month: m, tradeCommissions: trade ?? {}, accountFee: fee });
  }

  return {
    year,
    tradeCommissions: yearTotals,
    months,
    accountFee: feeDef && accountTotal > 0 ? { amount: round2(accountTotal), currency: feeDef.currency } : null,
    custody,
  };
}
