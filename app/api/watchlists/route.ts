import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { watchlistItems, watchlists } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { marketIds } from '@/src/markets/registry';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';
import { syncHoldingsWatchlist } from '@/src/server/holdings-watchlist';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let lists = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.userId, session.user.id))
    .orderBy(asc(watchlists.sortOrder), asc(watchlists.createdAt));

  // Backfill: positions recorded before the Holdings list existed (or before
  // this feature shipped) never triggered a write-time sync, so build it on
  // first read. Costs one reconcile per account, then never runs again.
  if (!lists.some((l) => l.name === HOLDINGS_LIST)) {
    await syncHoldingsWatchlist(session.user.id);
    lists = await db
      .select()
      .from(watchlists)
      .where(eq(watchlists.userId, session.user.id))
      .orderBy(asc(watchlists.sortOrder), asc(watchlists.createdAt));
  }
  const items = lists.length
    ? await db
        .select()
        .from(watchlistItems)
        .where(inArray(watchlistItems.watchlistId, lists.map((l) => l.id)))
        .orderBy(asc(watchlistItems.sortOrder))
    : [];
  return NextResponse.json({
    watchlists: lists.map((l) => ({
      ...l,
      symbols: items.filter((i) => i.watchlistId === l.id).map((i) => i.symbol),
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  // Registry ids are data, not an enum — validated against the registry below.
  market: z.string().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  if (body.data.market !== undefined && !marketIds.includes(body.data.market)) {
    return NextResponse.json({ error: 'unknown market' }, { status: 400 });
  }
  const existing = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.userId, session.user.id));
  const [created] = await db
    .insert(watchlists)
    .values({
      userId: session.user.id,
      name: body.data.name,
      market: body.data.market,
      sortOrder: existing.length,
      isDefault: existing.length === 0 ? 1 : 0,
    })
    .returning();
  return NextResponse.json({ watchlist: { ...created, symbols: [] } }, { status: 201 });
}
