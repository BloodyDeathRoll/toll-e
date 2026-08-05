import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getOwnedPortfolio } from '@/src/server/portfolios';
import { getTaxForPortfolio } from '@/src/server/tax';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/portfolios/[id]/tax'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(await getTaxForPortfolio(portfolio));
}
