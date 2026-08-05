import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { watchlistItems, watchlists } from '@/src/db/schema';
import { getSession } from '@/lib/session';

async function owned(userId: string, id: string) {
  const [w] = await db
    .select()
    .from(watchlists)
    .where(and(eq(watchlists.id, id), eq(watchlists.userId, userId)));
  return w ?? null;
}

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  sortOrder: z.number().int().optional(),
  /** Full symbol list in new order — drag-reorder = sortOrder rewrite. */
  symbols: z.array(z.string().min(1).max(20)).max(200).optional(),
});

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/watchlists/[id]'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await owned(session.user.id, id))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const { symbols, ...fields } = body.data;
  if (Object.keys(fields).length > 0) {
    await db.update(watchlists).set(fields).where(eq(watchlists.id, id));
  }
  if (symbols) {
    await db.delete(watchlistItems).where(eq(watchlistItems.watchlistId, id));
    if (symbols.length > 0) {
      await db.insert(watchlistItems).values(
        symbols.map((symbol, i) => ({
          watchlistId: id,
          symbol: symbol.toUpperCase(),
          sortOrder: i,
        })),
      );
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/watchlists/[id]'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await owned(session.user.id, id))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  await db.delete(watchlists).where(eq(watchlists.id, id));
  return NextResponse.json({ ok: true });
}
