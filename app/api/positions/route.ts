import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { getPositions } from '@/src/server/portfolios';
import { markets } from '@/src/markets/registry';

/**
 * Lens-shaped convenience over /api/portfolios/[id]/positions: the signed-in
 * user's positions for a market. `portfolio: null` ⇒ nothing yet (UI shows
 * demo/empty state); 401 ⇒ signed out.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const market = req.nextUrl.searchParams.get('market') ?? '';
  if (!markets[market]) return NextResponse.json({ error: 'unknown market' }, { status: 400 });

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.userId, session.user.id), eq(portfolios.market, market)))
    .orderBy(asc(portfolios.sortOrder))
    .limit(1);
  if (!portfolio) return NextResponse.json({ portfolio: null });
  return NextResponse.json({
    portfolio: { id: portfolio.id, name: portfolio.name, taxRatePct: Number(portfolio.taxRatePct) },
    ...(await getPositions(portfolio)),
  });
}
