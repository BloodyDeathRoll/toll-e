import 'server-only';
import { and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '@/src/db';
import { symbolI18n } from '@/src/db/schema';

/**
 * The shared Hebrew text store (`symbol_i18n`).
 *
 * A symbol's Hebrew name and About are fetched — or translated — exactly once,
 * by whoever gets there first, and every reader after that is served from here.
 * Wikipedia and the reader's own browser both write through `putHe`; nothing
 * else does.
 */

export type HeField = 'name' | 'about';
export type HeOrigin = 'wiki' | 'device';

export interface HeEntry {
  text: string;
  origin: HeOrigin;
  sourceUrl?: string;
}

export interface HeText {
  name?: HeEntry;
  about?: HeEntry;
}

const row = (r: typeof symbolI18n.$inferSelect): HeEntry => ({
  text: r.text,
  origin: r.origin as HeOrigin,
  sourceUrl: r.sourceUrl ?? undefined,
});

/** Whatever Hebrew we already hold for a symbol. Empty is the normal answer. */
export async function getHe(symbol: string): Promise<HeText> {
  const rows = await db
    .select()
    .from(symbolI18n)
    .where(and(eq(symbolI18n.symbol, symbol), eq(symbolI18n.lang, 'he')));
  const out: HeText = {};
  for (const r of rows) {
    if (r.field === 'name') out.name = row(r);
    else if (r.field === 'about') out.about = row(r);
  }
  return out;
}

/**
 * First good answer wins. `onConflictDoNothing` rather than an upsert: two
 * readers can land on the same uncovered symbol at once, and a later writer —
 * in particular a browser translation arriving after a Wikipedia hit — must
 * not overwrite what is already there.
 */
export async function putHe(
  symbol: string,
  field: HeField,
  entry: HeEntry,
): Promise<void> {
  await db
    .insert(symbolI18n)
    .values({
      symbol,
      lang: 'he',
      field,
      text: entry.text,
      origin: entry.origin,
      sourceUrl: entry.sourceUrl ?? null,
    })
    .onConflictDoNothing();
}

/**
 * Symbols whose stored Hebrew name matches a Hebrew query — "אנבידיה" → NVDA.
 *
 * The provider rejects Hebrew queries outright and knows no Hebrew names, so
 * for US listings this store is the only path from a Hebrew word to a ticker.
 * It only holds what someone has already looked at, which is the right set:
 * the names your readers search for are the names your readers have opened.
 */
export async function searchHeNames(
  query: string,
  limit = 10,
): Promise<Array<{ symbol: string; name: string }>> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db
    .select({ symbol: symbolI18n.symbol, name: symbolI18n.text })
    .from(symbolI18n)
    .where(
      and(
        eq(symbolI18n.lang, 'he'),
        eq(symbolI18n.field, 'name'),
        ilike(symbolI18n.text, `%${q.replace(/[%_]/g, '')}%`),
      ),
    )
    .limit(limit);
  // A name that starts with the query is a better hit than one that merely
  // contains it: typing "טס" should reach טסלה before אינטסקט.
  const lower = q.toLowerCase();
  return rows.sort((a, b) => {
    const rank = (n: string) => (n.toLowerCase().startsWith(lower) ? 0 : 1);
    return rank(a.name) - rank(b.name) || a.name.length - b.name.length;
  });
}

/** Stored Hebrew names for a batch of symbols, for labelling rows. */
export async function getHeNames(symbols: string[]): Promise<Map<string, string>> {
  if (symbols.length === 0) return new Map();
  const rows = await db
    .select({ symbol: symbolI18n.symbol, name: symbolI18n.text })
    .from(symbolI18n)
    .where(
      and(
        eq(symbolI18n.lang, 'he'),
        eq(symbolI18n.field, 'name'),
        inArray(symbolI18n.symbol, symbols),
      ),
    );
  return new Map(rows.map((r) => [r.symbol, r.name]));
}
