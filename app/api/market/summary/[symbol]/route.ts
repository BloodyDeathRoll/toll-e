import { NextRequest, NextResponse } from 'next/server';
import { getChart, getSummary } from '@/src/market-data';
import { averageTrueRange } from '@/src/market-data/atr';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/market/summary/[symbol]'>,
) {
  const { symbol } = await ctx.params;
  try {
    const decoded = decodeURIComponent(symbol);
    // ATR rides the daily chart, not the provider's summary — computed here
    // so the cached Summary stays exactly what the provider said. A month of
    // daily bars covers the 14 ranges; a chart failure just means no ATR,
    // never a failed summary.
    const [summary, atr14] = await Promise.all([
      getSummary(decoded),
      getChart(decoded, '1mo')
        .then((series) => averageTrueRange(series.points))
        .catch(() => undefined),
    ]);
    return NextResponse.json({ ...summary, stats: { ...summary.stats, atr14 } });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
