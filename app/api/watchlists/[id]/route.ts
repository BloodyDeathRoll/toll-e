import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { watchlistItems, watchlists } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';

async function owned(userId: string, id: string) {
  const [w] = await db
    .select()
    .from(watchlists)
    .where(and(eq(watchlists.id, id), eq(watchlists.userId, userId)));
  return w ?? null;
}

/**
 * Holdings is derived from transactions, and the edit screen offers reorder
 * and nothing else. The rule is enforced here too, not only in the UI: the
 * row order may be permuted, but the membership and the name are the
 * reconcile's to set — a rename in particular would orphan the list, since
 * that is the name `syncHoldingsWatchlist` looks it up by.
 */
function managedPatchAllowed(
  current: string[],
  patch: { name?: string; symbols?: string[] },
): boolean {
  if (patch.name !== undefined && patch.name !== HOLDINGS_LIST) return false;
  if (patch.symbols === undefined) return true;
  const before = [...current].sort();
  const after = [...patch.symbols].map((s) => s.toUpperCase()).sort();
  return before.length === after.length && before.every((s, i) => s === after[i]);
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
  const list = await owned(session.user.id, id);
  if (!list) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  if (list.name === HOLDINGS_LIST) {
    const current = await db
      .select({ symbol: watchlistItems.symbol })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, id));
    if (!managedPatchAllowed(current.map((i) => i.symbol), body.data)) {
      return NextResponse.json({ error: 'managed list: reorder only' }, { status: 409 });
    }
  }

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
  const list = await owned(session.user.id, id);
  if (!list) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (list.name === HOLDINGS_LIST) {
    return NextResponse.json({ error: 'managed list: reorder only' }, { status: 409 });
  }
  await db.delete(watchlists).where(eq(watchlists.id, id));
  return NextResponse.json({ ok: true });
}
