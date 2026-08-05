import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChart } from '@/src/market-data';

const rangeSchema = z.enum(['1d', '5d', '1mo', '6mo', 'ytd', '1y', '5y', 'max']);

export async function GET(
  req: NextRequest,
  ctx: RouteContext<'/api/market/chart/[symbol]'>,
) {
  const { symbol } = await ctx.params;
  const range = rangeSchema.safeParse(req.nextUrl.searchParams.get('range') ?? '1mo');
  if (!range.success) {
    return NextResponse.json({ error: 'invalid range' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getChart(decodeURIComponent(symbol), range.data));
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
