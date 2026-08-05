import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { transactions } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { getOwnedPortfolio, listTransactions, toEngineTx } from '@/src/server/portfolios';
import { computePortfolio } from '@/src/engine/portfolio';

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
  return NextResponse.json({ ok: true });
}
