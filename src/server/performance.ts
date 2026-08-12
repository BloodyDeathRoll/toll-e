import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios } from '@/src/db/schema';
import { computeTax } from '@/src/engine/tax';
import { getFx } from '@/src/market-data';
import { getPositions, listTransactions, toEngineTx } from './portfolios';

// The combined picture (§3.4): native amounts are authoritative; conversion
// to the display currency happens here, at the presentation layer, never in
// the tax engine. The FX rate used is part of the payload (audit trail).

export interface PerformancePortfolio {
  id: string;
  name: string;
  market: string;
  currency: string;
  /** Native currency figures for the selected year (unrealized is "now"). */
  realized: number;
  unrealized: number;
  /** Cash the broker withheld at source across the year. */
  taxPaid: number;
  /** What the year actually owes once the registered shield is applied. */
  taxOwed: number;
  /** taxPaid − taxOwed, back in next year's filing. */
  taxRefund: number;
  shieldRemaining: number;
  /** Same figures in the display currency. */
  converted: { realized: number; unrealized: number; taxPaid: number; taxOwed: number; taxRefund: number };
}

/** One sell action, in the display currency — a line in the month drill-down. */
export interface PerformanceSale {
  id: string;
  symbol: string;
  date: string;
  shares: number;
  /** Realized gain, negative for a loss. */
  gain: number;
  /** Withheld at source because of this sale. Zero on a loss or a shielded gain. */
  tax: number;
  /** gain − tax: what the sale actually left behind. */
  net: number;
  /** Which portfolio it came from — several can share a month. */
  portfolio: string;
}

export interface PerformanceMonth {
  month: number;
  gains: number;
  losses: number;
  net: number;
  tax: number;
  sales: PerformanceSale[];
}

export interface PerformancePayload {
  displayCurrency: string;
  fx: { pair: string; rate: number; asOf: string };
  year: number;
  years: number[];
  /** Combined totals in the display currency. */
  totals: { realized: number; unrealized: number; taxPaid: number; taxOwed: number; taxRefund: number };
  portfolios: PerformancePortfolio[];
  /** Combined month rows in the display currency. */
  months: PerformanceMonth[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPerformance(
  userId: string,
  displayCurrency: string,
  year?: number,
  market?: string,
): Promise<PerformancePayload | null> {
  const rows = await db
    .select()
    .from(portfolios)
    .where(
      market
        ? and(eq(portfolios.userId, userId), eq(portfolios.market, market))
        : eq(portfolios.userId, userId),
    )
    .orderBy(asc(portfolios.sortOrder), asc(portfolios.createdAt));
  // No portfolio in this market yet — the screen says so rather than falling
  // back to another market's numbers.
  if (rows.length === 0) return null;

  const fx = await getFx('USDILS');
  const convert = (amount: number, from: string): number => {
    if (from === displayCurrency) return amount;
    if (from === 'USD' && displayCurrency === 'ILS') return amount * fx.rate;
    if (from === 'ILS' && displayCurrency === 'USD') return amount / fx.rate;
    return amount; // unknown pair — pass through rather than invent a rate
  };

  const perPortfolio: PerformancePortfolio[] = [];
  const monthAcc = new Map<number, PerformanceMonth>();
  const yearSet = new Set<number>();

  // One read and one tax run per portfolio, held for both passes. The two
  // passes are still necessary — `selectedYear` cannot be picked until every
  // year that exists is known — but the work behind them is not: the engine
  // is pure, so a second run answers exactly what the first one did. Reading
  // the portfolios concurrently rather than one after another is the larger
  // win once there is more than one.
  const computed = await Promise.all(
    rows.map(async (p) => {
      const txs = (await listTransactions(p.id)).map(toEngineTx);
      return { p, txs, tax: computeTax(txs, { ratePct: Number(p.taxRatePct) }) };
    }),
  );

  for (const { tax } of computed) {
    for (const y of tax.years) yearSet.add(y.year);
  }
  const years = [...yearSet].sort((a, b) => b - a);
  const selectedYear = year && yearSet.has(year) ? year : (years[0] ?? new Date().getFullYear());

  for (const { p, txs, tax } of computed) {
    const ledger = tax.years.find((y) => y.year === selectedYear);
    const positions = await getPositions(p, txs);

    const realized = ledger?.net ?? 0;
    const unrealized = positions.totals.totalGain;
    // Both sides of the cash story: what was withheld month by month, and what
    // the year actually owes. They differ exactly by the shield and by any
    // over-withholding from month ordering — that difference is the refund.
    const taxPaid = ledger?.paid ?? 0;
    const taxOwed = ledger?.owed ?? 0;
    const taxRefund = ledger?.refundNextYear ?? 0;

    perPortfolio.push({
      id: p.id,
      name: p.name,
      market: p.market,
      currency: p.currency,
      realized: round2(realized),
      unrealized: round2(unrealized),
      taxPaid: round2(taxPaid),
      taxOwed: round2(taxOwed),
      taxRefund: round2(taxRefund),
      shieldRemaining: tax.shieldRemaining,
      converted: {
        realized: round2(convert(realized, p.currency)),
        unrealized: round2(convert(unrealized, p.currency)),
        taxPaid: round2(convert(taxPaid, p.currency)),
        taxOwed: round2(convert(taxOwed, p.currency)),
        taxRefund: round2(convert(taxRefund, p.currency)),
      },
    });

    for (const m of ledger?.months ?? []) {
      const acc = monthAcc.get(m.month) ?? {
        month: m.month,
        gains: 0,
        losses: 0,
        net: 0,
        tax: 0,
        sales: [],
      };
      acc.gains += convert(m.gains, p.currency);
      acc.losses += convert(m.losses, p.currency);
      acc.net += convert(m.net, p.currency);
      acc.tax += convert(m.paid ?? 0, p.currency);

      // Withholding happens per month, after the intra-year loss pool absorbs
      // what it can — there is no per-sale figure in the engine. Splitting the
      // month's withholding across its gaining sales pro-rata by gain is the
      // only attribution that foots exactly to the cash that left.
      const inMonth = ledger!.sales.filter((s) => Number(s.date.slice(5, 7)) === m.month);
      const gainSum = inMonth.reduce((s, e) => s + Math.max(0, e.gain), 0);
      for (const s of inMonth) {
        const share = s.gain > 0 && gainSum > 0 ? s.gain / gainSum : 0;
        const gain = round2(convert(s.gain, p.currency));
        const tax = round2(convert((m.paid ?? 0) * share, p.currency));
        acc.sales.push({
          id: s.saleTxId,
          symbol: s.symbol,
          date: s.date,
          shares: s.shares,
          gain,
          tax,
          net: round2(gain - tax),
          portfolio: p.name,
        });
      }
      monthAcc.set(m.month, acc);
    }
  }

  const months = [...monthAcc.values()]
    .map((m) => ({
      month: m.month,
      gains: round2(m.gains),
      losses: round2(m.losses),
      net: round2(m.net),
      tax: round2(m.tax),
      // Newest first, matching the month order the screen lists them in.
      sales: [...m.sales].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)),
    }))
    .sort((a, b) => a.month - b.month);

  return {
    displayCurrency,
    fx: { pair: fx.pair, rate: fx.rate, asOf: fx.asOf },
    year: selectedYear,
    years,
    totals: {
      realized: round2(perPortfolio.reduce((s, p) => s + p.converted.realized, 0)),
      unrealized: round2(perPortfolio.reduce((s, p) => s + p.converted.unrealized, 0)),
      taxPaid: round2(perPortfolio.reduce((s, p) => s + p.converted.taxPaid, 0)),
      taxOwed: round2(perPortfolio.reduce((s, p) => s + p.converted.taxOwed, 0)),
      taxRefund: round2(perPortfolio.reduce((s, p) => s + p.converted.taxRefund, 0)),
    },
    portfolios: perPortfolio,
    months,
  };
}
