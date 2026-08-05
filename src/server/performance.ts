import 'server-only';

import { asc, eq } from 'drizzle-orm';
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
  taxDue: number;
  shieldRemaining: number;
  /** Same figures in the display currency. */
  converted: { realized: number; unrealized: number; taxDue: number };
}

export interface PerformanceMonth {
  month: number;
  gains: number;
  losses: number;
  net: number;
  tax: number;
}

export interface PerformancePayload {
  displayCurrency: string;
  fx: { pair: string; rate: number; asOf: string };
  year: number;
  years: number[];
  /** Combined totals in the display currency. */
  totals: { realized: number; unrealized: number; taxDue: number };
  portfolios: PerformancePortfolio[];
  /** Combined month rows in the display currency. */
  months: PerformanceMonth[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPerformance(
  userId: string,
  displayCurrency: string,
  year?: number,
): Promise<PerformancePayload | null> {
  const rows = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(asc(portfolios.sortOrder), asc(portfolios.createdAt));
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

  for (const p of rows) {
    const txs = (await listTransactions(p.id)).map(toEngineTx);
    const tax = computeTax(txs, { ratePct: Number(p.taxRatePct) });
    for (const y of tax.years) yearSet.add(y.year);
  }
  const years = [...yearSet].sort((a, b) => b - a);
  const selectedYear = year && yearSet.has(year) ? year : (years[0] ?? new Date().getFullYear());

  for (const p of rows) {
    const txs = (await listTransactions(p.id)).map(toEngineTx);
    const tax = computeTax(txs, { ratePct: Number(p.taxRatePct) });
    const ledger = tax.years.find((y) => y.year === selectedYear);
    const positions = await getPositions(p);

    const realized = ledger?.net ?? 0;
    const unrealized = positions.totals.totalGain;
    const taxDue = ledger?.due ?? 0;

    perPortfolio.push({
      id: p.id,
      name: p.name,
      market: p.market,
      currency: p.currency,
      realized: round2(realized),
      unrealized: round2(unrealized),
      taxDue: round2(taxDue),
      shieldRemaining: tax.shieldRemaining,
      converted: {
        realized: round2(convert(realized, p.currency)),
        unrealized: round2(convert(unrealized, p.currency)),
        taxDue: round2(convert(taxDue, p.currency)),
      },
    });

    for (const m of ledger?.months ?? []) {
      const acc = monthAcc.get(m.month) ?? { month: m.month, gains: 0, losses: 0, net: 0, tax: 0 };
      acc.gains += convert(m.gains, p.currency);
      acc.losses += convert(m.losses, p.currency);
      acc.net += convert(m.net, p.currency);
      acc.tax += convert(m.tax ?? 0, p.currency);
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
      taxDue: round2(perPortfolio.reduce((s, p) => s + p.converted.taxDue, 0)),
    },
    portfolios: perPortfolio,
    months,
  };
}
