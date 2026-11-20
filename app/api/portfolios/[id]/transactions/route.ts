import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/db';
import { transactions } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import {
  getOwnedPortfolio,
  listEngineTxs,
  listTransactions,
  splitAdjusted,
} from '@/src/server/portfolios';
import { syncHoldingsWatchlist } from '@/src/server/holdings-watchlist';
import { validateSell } from '@/src/engine/portfolio';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/portfolios/[id]/transactions'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ transactions: await listTransactions(id) });
}

const txSchema = z.object({
  symbol: z.string().min(1).max(20),
  type: z.enum(['BUY', 'SELL']),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shares: z.number().positive(),
  pricePerShare: z.number().nonnegative(),
  commission: z.number().nonnegative().default(0),
  // 'manual' or 'profile:<brokerId>@<effectiveFrom>' — audit only (spec §5).
  commissionSource: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: RouteContext<'/api/portfolios/[id]/transactions'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = txSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const t = body.data;
  const symbol = t.symbol.toUpperCase();

  // Sell ≤ held-at-date, including not starving later sells (plan §8).
  if (t.type === 'SELL') {
    const existing = await listEngineTxs(id);
    const [candidate] = await splitAdjusted([
      {
        id: 'candidate',
        symbol,
        type: 'SELL',
        tradeDate: t.tradeDate,
        shares: t.shares,
        pricePerShare: t.pricePerShare,
        commission: t.commission,
        createdAt: Number.MAX_SAFE_INTEGER,
      },
    ]);
    const check = validateSell(existing, candidate);
    if (!check.ok) {
      return NextResponse.json(
        // Back in the units of the trade date — the ones the user typed in.
        { error: 'oversell', available: (check.available * t.shares) / candidate.shares },
        { status: 422 },
      );
    }
  }

  const [created] = await db
    .insert(transactions)
    .values({
      portfolioId: id,
      symbol,
      type: t.type,
      tradeDate: t.tradeDate,
      shares: String(t.shares),
      pricePerShare: String(t.pricePerShare),
      commission: String(t.commission),
      commissionSource: t.commissionSource,
      currency: portfolio.currency,
      note: t.note,
    })
    .returning();
  await syncHoldingsWatchlist(session.user.id);
  return NextResponse.json({ transaction: created }, { status: 201 });
}
