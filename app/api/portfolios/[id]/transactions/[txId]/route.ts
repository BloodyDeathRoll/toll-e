import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { transactions } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { getOwnedPortfolio, listTransactions, toEngineTx } from '@/src/server/portfolios';
import { syncHoldingsWatchlist } from '@/src/server/holdings-watchlist';
import { computePortfolio } from '@/src/engine/portfolio';

const patchSchema = z.object({
  type: z.enum(['BUY', 'SELL']).optional(),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  shares: z.number().positive().optional(),
  pricePerShare: z.number().nonnegative().optional(),
  commission: z.number().nonnegative().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<'/api/portfolios/[id]/transactions/[txId]'>,
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, txId } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const rows = await listTransactions(id);
  const current = rows.find((r) => r.id === txId);
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Replay the whole timeline with the edit applied — an edit can starve
  // later sells (or itself become an oversell) just like a delete can.
  const edited = rows.map(toEngineTx).map((t) =>
    t.id === txId
      ? {
          ...t,
          type: body.data.type ?? t.type,
          tradeDate: body.data.tradeDate ?? t.tradeDate,
          shares: body.data.shares ?? t.shares,
          pricePerShare: body.data.pricePerShare ?? t.pricePerShare,
          commission: body.data.commission ?? t.commission,
        }
      : t,
  );
  try {
    computePortfolio(edited);
  } catch {
    return NextResponse.json({ error: 'would_oversell' }, { status: 422 });
  }

  const { shares, pricePerShare, commission, note, ...rest } = body.data;
  const [updated] = await db
    .update(transactions)
    .set({
      ...rest,
      ...(shares !== undefined ? { shares: String(shares) } : {}),
      ...(pricePerShare !== undefined ? { pricePerShare: String(pricePerShare) } : {}),
      ...(commission !== undefined ? { commission: String(commission) } : {}),
      ...(note !== undefined ? { note } : {}),
    })
    .where(and(eq(transactions.id, txId), eq(transactions.portfolioId, id)))
    .returning();
  await syncHoldingsWatchlist(session.user.id);
  return NextResponse.json({ transaction: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/portfolios/[id]/transactions/[txId]'>,
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, txId } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Deleting a BUY must not strand later sells — replay the rest first.
  const remaining = (await listTransactions(id)).map(toEngineTx).filter((t) => t.id !== txId);
  try {
    computePortfolio(remaining);
  } catch {
    return NextResponse.json({ error: 'would_oversell_later_sales' }, { status: 422 });
  }

  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.portfolioId, id)))
    .returning();
  if (deleted.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await syncHoldingsWatchlist(session.user.id);
  return NextResponse.json({ ok: true });
}
