import { NextRequest, NextResponse } from 'next/server';
import { getSummary } from '@/src/market-data';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/market/summary/[symbol]'>,
) {
  const { symbol } = await ctx.params;
  try {
    return NextResponse.json(await getSummary(decodeURIComponent(symbol)));
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
