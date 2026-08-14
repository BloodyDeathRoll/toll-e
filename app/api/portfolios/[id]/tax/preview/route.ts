import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getOwnedPortfolio, listTransactions, toEngineTx } from '@/src/server/portfolios';
import { validateSell } from '@/src/engine/portfolio';
import { previewSell } from '@/src/engine/tax';

const schema = z.object({
  symbol: z.string().min(1).max(20),
  shares: z.number().positive(),
  pricePerShare: z.number().nonnegative(),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commission: z.number().nonnegative().default(0),
});

/** Real FIFO sell-time tax preview (§3.4) — never persisted. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/portfolios/[id]/tax/preview'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const txs = (await listTransactions(id)).map(toEngineTx);
  const candidate = {
    id: 'preview',
    symbol: body.data.symbol.toUpperCase(),
    type: 'SELL' as const,
    tradeDate: body.data.tradeDate,
    shares: body.data.shares,
    pricePerShare: body.data.pricePerShare,
    commission: body.data.commission,
    createdAt: Number.MAX_SAFE_INTEGER,
  };
  const check = validateSell(txs, candidate);
  if (!check.ok) {
    return NextResponse.json({ error: 'oversell', available: check.available }, { status: 422 });
  }
  return NextResponse.json(previewSell(txs, candidate, { ratePct: Number(portfolio.taxRatePct) }));
}
