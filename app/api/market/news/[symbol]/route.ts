import { NextRequest, NextResponse } from 'next/server';
import { getNews } from '@/src/market-data';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/market/news/[symbol]'>,
) {
  const { symbol } = await ctx.params;
  try {
    return NextResponse.json({ news: await getNews(decodeURIComponent(symbol)) });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
