import { NextRequest, NextResponse } from 'next/server';
import { getScreen } from '@/src/market-data';
import type { ScreenKind } from '@/src/market-data/types';
import { markets } from '@/src/markets/registry';

const kinds: ScreenKind[] = ['sector', 'industry'];

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') as ScreenKind | null;
  const name = req.nextUrl.searchParams.get('name');
  const market = req.nextUrl.searchParams.get('market') ?? 'US';
  if (!kind || !kinds.includes(kind) || !name || !markets[market]) {
    return NextResponse.json({ error: 'invalid query' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getScreen(kind, name, market));
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
