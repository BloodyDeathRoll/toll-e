import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios, transactions, watchlistItems, watchlists } from '@/src/db/schema';
import { computePortfolio } from '@/src/engine/portfolio';
import { toEngineTx } from './portfolios';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';

export { HOLDINGS_LIST } from '@/src/watchlists/constants';

/**
 * Re-derive the "Holdings" watchlist from what the user actually owns.
 *
 * Called after every transaction write: a buy puts the symbol in the list, and
 * a sale that closes the position takes it out. Written as a full reconcile
 * rather than incremental add/remove so backdated edits, deletes, and partial
 * sells all land on the same answer.
 */
export async function syncHoldingsWatchlist(userId: string): Promise<void> {
  const owned = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.userId, userId));
  if (owned.length === 0) return;

  // Held symbols across every portfolio the user owns.
  const rows = await db
    .select()
    .from(transactions)
    .where(inArray(transactions.portfolioId, owned.map((p) => p.id)));
  const held = new Set<string>();
  for (const p of owned) {
    const { holdings } = computePortfolio(
      rows.filter((r) => r.portfolioId === p.id).map(toEngineTx),
    );
    for (const h of holdings) if (h.shares > 0) held.add(h.symbol);
  }

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
