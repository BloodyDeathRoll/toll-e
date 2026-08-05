import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { getTaxForPortfolio } from '@/src/server/tax';
import { markets } from '@/src/markets/registry';

/** Lens-shaped tax data: the signed-in user's ledgers for a market. */
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
  return NextResponse.json(await getTaxForPortfolio(portfolio));
}
