import { NextRequest, NextResponse } from 'next/server';
import { getIndexQuotes } from '@/src/market-data';
import { markets } from '@/src/markets/registry';

export async function GET(req: NextRequest) {
  const market = req.nextUrl.searchParams.get('market') ?? '';
  if (!markets[market]) {
    return NextResponse.json({ error: 'unknown market' }, { status: 400 });
  }
  try {
    return NextResponse.json({ quotes: await getIndexQuotes(market) });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
