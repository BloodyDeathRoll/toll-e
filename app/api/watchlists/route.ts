import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { watchlistItems, watchlists } from '@/src/db/schema';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const lists = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.userId, session.user.id))
    .orderBy(asc(watchlists.sortOrder), asc(watchlists.createdAt));
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

const createSchema = z.object({ name: z.string().min(1).max(60) });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const existing = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.userId, session.user.id));
  const [created] = await db
    .insert(watchlists)
    .values({
      userId: session.user.id,
      name: body.data.name,
      sortOrder: existing.length,
      isDefault: existing.length === 0 ? 1 : 0,
    })
    .returning();
  return NextResponse.json({ watchlist: { ...created, symbols: [] } }, { status: 201 });
}
