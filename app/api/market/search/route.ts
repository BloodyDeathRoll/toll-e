import { NextRequest, NextResponse } from 'next/server';
import { search } from '@/src/market-data';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const market = req.nextUrl.searchParams.get('market') ?? undefined;
  if (q.length < 1) {
    return NextResponse.json({ error: 'q required' }, { status: 400 });
  }
  try {
    return NextResponse.json({ results: await search(q, market) });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
