import { NextRequest, NextResponse } from 'next/server';
import { getCloseOn } from '@/src/market-data';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? '';
  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'symbol and date required' }, { status: 400 });
  }
  try {
    return NextResponse.json({ symbol, date, close: await getCloseOn(symbol, date) });
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
