import { NextRequest, NextResponse } from 'next/server';
import { getQuotes } from '@/src/market-data';

/**
 * An open-ended list on an unauthenticated proxy is an amplification vector,
 * so there is still a ceiling — but it refuses the request rather than
 * quietly serving the first slice of it. The old cap dropped everything past
 * the 25th symbol on the floor, and the watchlist rendered the silence as a
 * green 0.00%. Below this, `getQuotes` batches the ask; no real screen is
 * anywhere near it.
 */
const MAX_SYMBOLS = 200;

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols required' }, { status: 400 });
  }
  if (new Set(symbols).size > MAX_SYMBOLS) {
    return NextResponse.json({ error: `too many symbols (max ${MAX_SYMBOLS})` }, { status: 400 });
  }
  try {
    return NextResponse.json({ quotes: await getQuotes(symbols) });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
