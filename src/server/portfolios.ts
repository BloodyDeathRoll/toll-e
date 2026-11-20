import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios, transactions } from '@/src/db/schema';
import { computePortfolio, positionView, type EngineTx, type PositionView } from '@/src/engine/portfolio';
import { applySplits } from '@/src/engine/portfolio/splits';
import { getQuotes, getSplits } from '@/src/market-data';
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

/** Restate transactions in today's share units (see engine/portfolio/splits). */
export async function splitAdjusted(txs: EngineTx[]): Promise<EngineTx[]> {
  return applySplits(txs, await getSplits(txs.map((t) => t.symbol)));
}

/** A portfolio's transactions as every computation must see them: split-adjusted. */
export async function listEngineTxs(portfolioId: string): Promise<EngineTx[]> {
  return splitAdjusted((await listTransactions(portfolioId)).map(toEngineTx));
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
  /**
   * `unpriced` marks a holding shown at its own cost basis because no quote
   * came back for it. Without the flag that row is indistinguishable from a
   * real quote on a flat day — same price, zero day change — so the screen
   * would present stale cost as today's market value.
   */
  positions: Array<PositionView & { name?: string; dayChangePct?: number; unpriced?: boolean }>;
  totals: {
    marketValue: number;
    totalCost: number;
    totalGain: number;
    totalGainPct: number;
    dayGain: number;
    dayGainPct: number;
    /** All-time realized P&L (FIFO), and it against the cost it was made on. */
    realizedGain: number;
    realizedGainPct: number;
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
  txs ??= await listEngineTxs(portfolio.id);
  const { holdings, realized } = computePortfolio(txs);

  const symbols = holdings.map((h) => h.symbol);
  // A quote miss is already survivable per symbol (below: price falls back to
  // the lot cost). The whole call failing is the same condition, only wider —
  // Yahoo down AND nothing usable in price_history — and it must degrade the
  // same way rather than take every positions screen down with it. The FX
  // chain in market-data/fallback.ts carries a last resort for exactly this
  // reason; quotes had none.
  const quotes = symbols.length ? await getQuotes(symbols).catch(() => []) : [];
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const positions = holdings
    .map((h) => {
      const q = bySymbol.get(h.symbol);
      // A quote that carries no usable price is a quote miss, not a price of
      // zero — the provider hands one back for halted and delisted symbols.
      // The facade filters those out, and this is the second half of the same
      // sentence: everything priced off `q` has to agree that the row is
      // unpriced, or the badge and the numbers say different things.
      const priced = q && Number.isFinite(q.price) && q.price > 0 ? q : undefined;
      const view = positionView(h, {
        price: priced?.price ?? h.avgCost,
        previousClose: priced?.previousClose,
      });
      return {
        ...view,
        name: q?.name,
        dayChangePct: priced?.changePct,
        unpriced: priced ? undefined : true,
      };
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
  // Realized is the whole sale history, not the open positions' — so it comes
  // from the FIFO events, and its percent is measured against the cost those
  // sales consumed, never against what is still held.
  const realizedGain = realized.reduce((s, e) => s + e.gain, 0);
  const realizedCost = realized.reduce((s, e) => s + e.costBasis, 0);
  return {
    portfolioId: portfolio.id,
    currency: portfolio.currency,
    positions,
    totals: {
      ...totals,
      totalGainPct: totals.totalCost > 0 ? (totals.totalGain / totals.totalCost) * 100 : 0,
      dayGainPct: prevValue > 0 ? (totals.dayGain / prevValue) * 100 : 0,
      realizedGain,
      realizedGainPct: realizedCost > 0 ? (realizedGain / realizedCost) * 100 : 0,
    },
  };
}
