import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios, transactions, watchlistItems, watchlists } from '@/src/db/schema';
import { splitFactor } from '@/src/engine/portfolio/splits';
import { getSplits } from '@/src/market-data';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';

export { HOLDINGS_LIST } from '@/src/watchlists/constants';

/**
 * Re-derive the "Holdings" watchlist from what the user actually owns.
 *
 * Called after every transaction write: a buy puts the symbol in the list, and
 * a sale that closes the position takes it out. Written as a full reconcile
 * rather than incremental add/remove so backdated edits, deletes, and partial
 * sells all land on the same answer.
 *
 * The question this path asks is only ever "is the balance still above zero?",
 * per (portfolio, symbol) — so it reads four narrow columns and sums them,
 * rather than pulling every column of the user's entire transaction history
 * and running the full FIFO replay (lot splits, realized events, matched-lot
 * arrays) to reach the same yes/no. The sum is taken here, not in SQL, because
 * each trade counts in today's share units: a stock split between a buy and a
 * sell changes what the raw share counts add up to.
 *
 * Two details are load-bearing. The cut-off is the engine's own
 * `shares > EPS` (1e-9) rather than a bare `> 0` that would keep a
 * floating-point crumb alive as a held position. And
 * dropping `computePortfolio` from this path also drops the `OversellError`
 * it used to inherit — a belt-and-braces check that cannot fire here anyway,
 * because the write routes validate before they reach this function.
 */
const EPS = 1e-9;

export async function syncHoldingsWatchlist(userId: string): Promise<void> {
  const owned = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.userId, userId));
  if (owned.length === 0) return;

  // Held symbols across every portfolio the user owns: the split-adjusted
  // balance per (portfolio, symbol), kept where it is still positive.
  const rows = await db
    .select({
      portfolioId: transactions.portfolioId,
      symbol: transactions.symbol,
      type: transactions.type,
      tradeDate: transactions.tradeDate,
      shares: transactions.shares,
    })
    .from(transactions)
    .where(inArray(transactions.portfolioId, owned.map((p) => p.id)));
  const splits = await getSplits(rows.map((r) => r.symbol));
  const net = new Map<string, { symbol: string; shares: number }>();
  for (const r of rows) {
    const key = `${r.portfolioId}\n${r.symbol}`;
    const entry = net.get(key) ?? { symbol: r.symbol, shares: 0 };
    const shares = Number(r.shares) * splitFactor(splits.get(r.symbol), r.tradeDate);
    entry.shares += r.type === 'BUY' ? shares : -shares;
    net.set(key, entry);
  }
  const held = new Set([...net.values()].filter((e) => e.shares > EPS).map((e) => e.symbol));

  const [existing] = await db
    .select()
    .from(watchlists)
    .where(and(eq(watchlists.userId, userId), eq(watchlists.name, HOLDINGS_LIST)))
    .orderBy(asc(watchlists.createdAt))
    .limit(1);

  if (held.size === 0) {
    // Keep the (empty) list once it exists so it doesn't flicker away between
    // selling out and buying again; only skip creating one for a user who has
    // never held anything.
    if (existing) await db.delete(watchlistItems).where(eq(watchlistItems.watchlistId, existing.id));
    return;
  }

  const list =
    existing ??
    (
      await db
        .insert(watchlists)
        .values({
          userId,
          name: HOLDINGS_LIST,
          // Sorts ahead of user lists, which start at 0 and count up.
          sortOrder: -1,
          isDefault: 0,
        })
        .returning()
    )[0];

  const current = await db
    .select({ symbol: watchlistItems.symbol })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, list.id));
  const have = new Set(current.map((i) => i.symbol));

  const toAdd = [...held].filter((s) => !have.has(s));
  const toRemove = [...have].filter((s) => !held.has(s));

  if (toAdd.length) {
    await db
      .insert(watchlistItems)
      .values(toAdd.map((symbol, i) => ({ watchlistId: list.id, symbol, sortOrder: have.size + i })))
      .onConflictDoNothing();
  }
  if (toRemove.length) {
    await db
      .delete(watchlistItems)
      .where(
        and(eq(watchlistItems.watchlistId, list.id), inArray(watchlistItems.symbol, toRemove)),
      );
  }
}
