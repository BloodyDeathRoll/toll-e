import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getPerformance } from '@/src/server/performance';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const yearParam = req.nextUrl.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : undefined;
  const currencyParam = req.nextUrl.searchParams.get('currency');
  const sessionCurrency = (session.user as { displayCurrency?: string }).displayCurrency;
  const currency =
    currencyParam === 'USD' || currencyParam === 'ILS'
      ? currencyParam
      : (sessionCurrency ?? 'USD');

  const payload = await getPerformance(session.user.id, currency, year);
  if (!payload) return NextResponse.json({ empty: true });
  return NextResponse.json(payload);
}
