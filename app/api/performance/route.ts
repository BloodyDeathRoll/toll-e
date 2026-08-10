import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getPerformance } from '@/src/server/performance';
import { markets } from '@/src/markets/registry';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const yearParam = req.nextUrl.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : undefined;
  const marketParam = req.nextUrl.searchParams.get('market');
  const market = marketParam && markets[marketParam] ? marketParam : undefined;

  const currencyParam = req.nextUrl.searchParams.get('currency');
  const sessionCurrency = (session.user as { displayCurrency?: string }).displayCurrency;
  // Scoped to one market, the figures are already native — showing them in
  // that market's currency keeps the page free of pointless conversion.
  const currency =
    currencyParam === 'USD' || currencyParam === 'ILS'
      ? currencyParam
      : market
        ? markets[market].currency
        : (sessionCurrency ?? 'USD');

  const payload = await getPerformance(session.user.id, currency, year, market);
  if (!payload) return NextResponse.json({ empty: true });
  return NextResponse.json(payload);
}
