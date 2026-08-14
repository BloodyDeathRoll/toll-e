import { NextRequest, NextResponse } from 'next/server';
import { getMovers } from '@/src/market-data';
import type { MoversKind } from '@/src/market-data/types';
import { markets } from '@/src/markets/registry';

const kinds: MoversKind[] = ['mostActive', 'gainers', 'losers'];

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') as MoversKind | null;
  const market = req.nextUrl.searchParams.get('market') ?? 'US';
  if (!kind || !kinds.includes(kind) || !markets[market]) {
    return NextResponse.json({ error: 'invalid query' }, { status: 400 });
  }
  try {
    return NextResponse.json({ quotes: await getMovers(kind, market) });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
