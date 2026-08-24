import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { hasHebrew } from '@/src/markets/tase-search';
import { putHe } from '@/src/server/symbol-i18n';

/**
 * A reader's browser finished translating a company's name or About, and hands
 * the result back so nobody else has to translate it again.
 *
 * The body is text a client typed into a fetch, so it is checked rather than
 * trusted: signed in, in Hebrew, and of a sane length. `putHe` writes with
 * `onConflictDoNothing`, so a contribution can only ever fill a hole — it
 * cannot overwrite the Wikipedia text, or another reader's earlier answer.
 */
const bodySchema = z.object({
  symbol: z.string().min(1).max(20),
  field: z.enum(['name', 'about']),
  text: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const text = body.data.text.trim();
  // Untranslated English is the failure mode worth catching: the Translator
  // API hands back the input unchanged often enough, and storing that would
  // pin English in place for every reader after this one.
  if (!hasHebrew(text)) return NextResponse.json({ error: 'not hebrew' }, { status: 400 });

  await putHe(body.data.symbol.toUpperCase(), body.data.field, { text, origin: 'device' });
  return NextResponse.json({ ok: true });
}
