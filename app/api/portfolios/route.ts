import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { portfolios } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { ensurePortfolio } from '@/src/server/portfolios';
import { markets } from '@/src/markets/registry';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rows = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, session.user.id))
    .orderBy(asc(portfolios.sortOrder), asc(portfolios.createdAt));
  return NextResponse.json({ portfolios: rows });
}

const createSchema = z.object({
  market: z.string().refine((m) => Boolean(markets[m]), 'unknown market'),
  name: z.string().min(1).max(80).optional(),
  /** true ⇒ return the market's existing portfolio instead of creating another. */
  ensure: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  if (body.data.ensure) {
    return NextResponse.json({ portfolio: await ensurePortfolio(session.user.id, body.data.market) });
  }
  const [created] = await db
    .insert(portfolios)
    .values({
      userId: session.user.id,
      name: body.data.name ?? 'My portfolio',
      market: body.data.market,
      currency: markets[body.data.market].currency,
    })
    .returning();
  return NextResponse.json({ portfolio: created }, { status: 201 });
}
