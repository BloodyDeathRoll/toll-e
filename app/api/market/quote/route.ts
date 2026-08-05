import { NextRequest, NextResponse } from 'next/server';
import { getQuotes } from '@/src/market-data';

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25); // batch politeness cap
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols required' }, { status: 400 });
  }
  try {
    return NextResponse.json({ quotes: await getQuotes(symbols) });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
