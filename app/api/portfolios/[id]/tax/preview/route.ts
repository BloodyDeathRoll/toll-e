import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getOwnedPortfolio, listEngineTxs, splitAdjusted } from '@/src/server/portfolios';
import { validateSell } from '@/src/engine/portfolio';
import { previewSell } from '@/src/engine/tax';

const schema = z.object({
  symbol: z.string().min(1).max(20),
  shares: z.number().positive(),
  pricePerShare: z.number().nonnegative(),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commission: z.number().nonnegative().default(0),
  /**
   * The sale being edited. It is the one this preview replaces, so it leaves
   * the ledger before anything is checked or priced — otherwise editing a
   * sale is measured against a timeline that still contains it, which reads
   * as an oversell (its own shares are already gone) and takes the card away
   * exactly when someone is changing the numbers on it.
   */
  excludeTxId: z.string().optional(),
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

  const all = await listEngineTxs(id);
  const replacing = all.find((t) => t.id === body.data.excludeTxId);
  const txs = all.filter((t) => t.id !== body.data.excludeTxId);
  const [candidate] = await splitAdjusted([{
    id: 'preview',
    symbol: body.data.symbol.toUpperCase(),
    type: 'SELL' as const,
    tradeDate: body.data.tradeDate,
    shares: body.data.shares,
    pricePerShare: body.data.pricePerShare,
    commission: body.data.commission,
    // A new sale is the newest thing there is; an edited one keeps the place
    // in the ordering it already had, so the lots it matches are the lots the
    // save will actually match on a day with more than one sell.
    createdAt: replacing?.createdAt ?? Number.MAX_SAFE_INTEGER,
  }]);
  const check = validateSell(txs, candidate);
  if (!check.ok) {
    return NextResponse.json({ error: 'oversell', available: (check.available * body.data.shares) / candidate.shares }, { status: 422 });
  }
  return NextResponse.json(previewSell(txs, candidate, { ratePct: Number(portfolio.taxRatePct) }));
}
