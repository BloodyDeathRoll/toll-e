import { NextRequest, NextResponse } from 'next/server';
import { getFinancials } from '@/src/market-data';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/market/financials/[symbol]'>,
) {
  const { symbol } = await ctx.params;
  try {
    return NextResponse.json(await getFinancials(decodeURIComponent(symbol)));
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
