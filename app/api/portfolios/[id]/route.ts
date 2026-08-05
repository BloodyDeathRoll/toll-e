import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { portfolios } from '@/src/db/schema';
import { getSession } from '@/lib/session';
import { getOwnedPortfolio } from '@/src/server/portfolios';

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  taxRatePct: z.number().min(0).max(99).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/portfolios/[id]'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const { taxRatePct, ...rest } = body.data;
  const [updated] = await db
    .update(portfolios)
    .set({ ...rest, ...(taxRatePct !== undefined ? { taxRatePct: String(taxRatePct) } : {}) })
    .where(eq(portfolios.id, id))
    .returning();
  return NextResponse.json({ portfolio: updated });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/portfolios/[id]'>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const portfolio = await getOwnedPortfolio(session.user.id, id);
  if (!portfolio) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await db.delete(portfolios).where(eq(portfolios.id, id));
  return NextResponse.json({ ok: true });
}
