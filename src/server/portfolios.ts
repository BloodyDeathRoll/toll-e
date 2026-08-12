import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios, transactions } from '@/src/db/schema';
import { computePortfolio, positionView, type EngineTx, type PositionView } from '@/src/engine/portfolio';
import { getQuotes } from '@/src/market-data';
import { getMarket } from '@/src/markets/registry';

export type PortfolioRow = typeof portfolios.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;

export async function getOwnedPortfolio(userId: string, portfolioId: string) {
  const [p] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
  return p ?? null;
}

/** The user's portfolio for a market, creating the default one on first use. */
export async function ensurePortfolio(userId: string, marketId: string): Promise<PortfolioRow> {
  const market = getMarket(marketId); // throws on unknown id
  const [existing] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.userId, userId), eq(portfolios.market, marketId)))
    .orderBy(asc(portfolios.sortOrder))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(portfolios)
    .values({
      userId,
      name: 'My portfolio',
      market: marketId,
      currency: market.currency,
    })
    .returning();
  return created;
}

export function toEngineTx(row: TransactionRow): EngineTx {
  return {
    id: row.id,
    symbol: row.symbol,
    type: row.type,
    tradeDate: row.tradeDate,
    shares: Number(row.shares),
    pricePerShare: Number(row.pricePerShare),
    commission: Number(row.commission),
    createdAt: row.createdAt.getTime(),
  };
}

export async function listTransactions(portfolioId: string): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt));
}

export interface PositionsPayload {
  portfolioId: string;
  currency: string;
  positions: Array<PositionView & { name?: string; dayChangePct?: number }>;
  totals: {
    marketValue: number;
    totalCost: number;
    totalGain: number;
    totalGainPct: number;
    dayGain: number;
    dayGainPct: number;
  };
}

/**
 * Computed holdings + performance for a portfolio (plan §8 positions).
 *
 * `txs` lets a caller that has already read this portfolio's transactions
 * hand them over instead of paying for the same SELECT again — see
 * `getPerformance`, which needs them for the tax engine regardless.
 */
export async function getPositions(
  portfolio: PortfolioRow,
  txs?: EngineTx[],
): Promise<PositionsPayload> {
  txs ??= (await listTransactions(portfolio.id)).map(toEngineTx);
  const { holdings } = computePortfolio(txs);

  const symbols = holdings.map((h) => h.symbol);
  const quotes = symbols.length ? await getQuotes(symbols) : [];
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const positions = holdings
    .map((h) => {
      const q = bySymbol.get(h.symbol);
      const view = positionView(h, {
        price: q?.price ?? h.avgCost,
        previousClose: q?.previousClose,
      });
      return { ...view, name: q?.name, dayChangePct: q?.changePct };
    })
    .sort((a, b) => b.marketValue - a.marketValue);

  const totals = positions.reduce(
    (t, p) => ({
      marketValue: t.marketValue + p.marketValue,
      totalCost: t.totalCost + p.totalCost,
      totalGain: t.totalGain + p.totalGain,
      dayGain: t.dayGain + p.dayGain,
    }),
    { marketValue: 0, totalCost: 0, totalGain: 0, dayGain: 0 },
  );
  const prevValue = totals.marketValue - totals.dayGain;
  return {
    portfolioId: portfolio.id,
    currency: portfolio.currency,
    positions,
    totals: {
      ...totals,
      totalGainPct: totals.totalCost > 0 ? (totals.totalGain / totals.totalCost) * 100 : 0,
      dayGainPct: prevValue > 0 ? (totals.dayGain / prevValue) * 100 : 0,
    },
  };
}
