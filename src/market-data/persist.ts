import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { fxRates, priceHistory, splits as splitsTable } from '@/src/db/schema';
import { localDateIn } from '@/src/markets/calendar';
import type { ChartSeries, FxRate, Split } from './types';

// Daily closes + FX persist to Postgres (toll-e-plan.md §5) — backdated
// transactions and tax audit trails need them even if Yahoo disappears.
// Fire-and-forget: a persistence hiccup must never fail a data request.

const num = (n: number | undefined) => (n === undefined ? null : String(n));

export function persistDailyCloses(series: ChartSeries): void {
  void persistDailyClosesNow(series).catch(() => {});
}

/**
 * The awaited form — for callers that read the table straight after (the
 * fund chart path serves *from* the persisted closes it just wrote).
 */
export async function persistDailyClosesNow(series: ChartSeries): Promise<void> {
  if (series.interval !== '1d' || series.points.length === 0) return;
  const rows = series.points.map((p) => ({
    symbol: series.symbol,
    // Exchange-local calendar date of the bar.
    date: localDateIn(series.timezone, p.t),
    open: num(p.open),
    high: num(p.high),
    low: num(p.low),
    close: String(p.close),
    adjClose: null,
    volume: p.volume ?? null,
  }));
  await db
    .insert(priceHistory)
    .values(rows)
    // Today's bar mutates until the close — refresh it on re-persist.
    .onConflictDoUpdate({
      target: [priceHistory.symbol, priceHistory.date],
      set: {
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        close: sql`excluded.close`,
        volume: sql`excluded.volume`,
      },
    });
}

export function persistFx(fx: FxRate): void {
  db.insert(fxRates)
    .values({ pair: fx.pair, date: fx.asOf, rate: String(fx.rate) })
    .onConflictDoNothing()
    .catch(() => {});
}

/** A split first seen this soon after its ex-date found closes persisted before it. */
const FRESH_SPLIT_DAYS = 30;

/**
 * Record a symbol's splits. A newly seen recent split also drops the closes
 * persisted before it: they are in pre-split units, the provider now serves
 * that history adjusted, and the two scales must not share a series. The
 * dropped range refills from the next daily chart fetch.
 * shortcut: a split first seen more than 30 days late keeps its pre-split
 * closes; upgrade by stamping price_history rows with when they were written.
 */
export async function persistSplits(symbol: string, list: Split[]): Promise<void> {
  if (list.length === 0) return;
  const added = await db
    .insert(splitsTable)
    .values(list.map((s) => ({ symbol, date: s.date, ratio: String(s.ratio) })))
    .onConflictDoNothing()
    .returning({ date: splitsTable.date });
  const cutoff = new Date(Date.now() - FRESH_SPLIT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const fresh = added.map((r) => r.date).filter((d) => d >= cutoff).sort().at(-1);
  if (fresh) {
    await db
      .delete(priceHistory)
      .where(and(eq(priceHistory.symbol, symbol), lt(priceHistory.date, fresh)));
  }
}
