import { sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { fxRates, priceHistory } from '@/src/db/schema';
import { localDateIn } from '@/src/markets/calendar';
import type { ChartSeries, FxRate } from './types';

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
