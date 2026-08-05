import { NextRequest, NextResponse } from 'next/server';
import { getFx } from '@/src/market-data';

export async function GET(req: NextRequest) {
  const pair = (req.nextUrl.searchParams.get('pair') ?? 'USDILS').toUpperCase();
  if (!/^[A-Z]{6}$/.test(pair)) {
    return NextResponse.json({ error: 'invalid pair' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getFx(pair));
  } catch {
    return NextResponse.json({ error: 'provider unavailable' }, { status: 502 });
  }
}
