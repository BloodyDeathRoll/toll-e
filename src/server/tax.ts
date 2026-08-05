import 'server-only';

import { computeTax, type TaxComputation, type YearLedger } from '@/src/engine/tax';
import { listTransactions, toEngineTx, type PortfolioRow } from './portfolios';

// Wire shape for tax data: full ledgers plus a trimmed per-sale drill-down
// (matched lots included — the "show your work" view).

export interface TaxSalePayload {
  saleTxId: string;
  symbol: string;
  date: string;
  shares: number;
  proceeds: number;
  costBasis: number;
  gain: number;
  matchedLots: Array<{ date: string; shares: number; costPerShare: number }>;
}

export type TaxYearPayload = Omit<YearLedger, 'sales'> & { sales: TaxSalePayload[] };

export interface TaxPayload {
  portfolio: { id: string; name: string; taxRatePct: number; currency: string };
  years: TaxYearPayload[];
  shieldRemaining: number;
}

export function serializeTax(portfolio: PortfolioRow, tax: TaxComputation): TaxPayload {
  return {
    portfolio: {
      id: portfolio.id,
      name: portfolio.name,
      taxRatePct: Number(portfolio.taxRatePct),
      currency: portfolio.currency,
    },
    years: tax.years.map((y) => ({
      ...y,
      sales: y.sales
        .map((s) => ({
          saleTxId: s.saleTxId,
          symbol: s.symbol,
          date: s.date,
          shares: s.shares,
          proceeds: s.proceeds,
          costBasis: s.costBasis,
          gain: s.gain,
          matchedLots: s.matchedLots.map(({ date, shares, costPerShare }) => ({
            date,
            shares,
            costPerShare,
          })),
        }))
        .reverse(), // newest first for "recent sales"
    })),
    shieldRemaining: tax.shieldRemaining,
  };
}

export async function getTaxForPortfolio(portfolio: PortfolioRow): Promise<TaxPayload> {
  const txs = (await listTransactions(portfolio.id)).map(toEngineTx);
  return serializeTax(portfolio, computeTax(txs, { ratePct: Number(portfolio.taxRatePct) }));
}
