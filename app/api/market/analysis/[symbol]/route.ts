import { NextRequest, NextResponse } from 'next/server';
import { getAnalysis } from '@/src/market-data';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/market/analysis/[symbol]'>,
) {
  const { symbol } = await ctx.params;
  try {
    return NextResponse.json(await getAnalysis(decodeURIComponent(symbol)));
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
