import 'server-only';

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios as portfoliosTable, priceHistory } from '@/src/db/schema';
import { computeCosts, type CostsLedger, type CostsTx } from '@/src/engine/costs';
import {
  mergePeriodValuations,
  quarterValuation,
  MAX_CLOSE_AGE_DAYS,
  type DailyClose,
  type PeriodValuation,
} from '@/src/engine/costs/valuation';
import type { EngineTx } from '@/src/engine/portfolio';
import { getBrokerProfile, resolveSchedule } from './broker-profile';
import { makeConvert } from './fx-convert';
import { listTransactions, toEngineTx } from './portfolios';

// The DB-facing face of the cost ledger: one price_history read, the FX
// conversions the engines refuse to do, and the assembly of computeCosts's
// input. Never calls the market-data provider inline — a cost figure must
// not be able to make a page slow or fail; price_history misses just land
// as basis 'cost'.

export interface CostsPortfolio {
  id: string;
  currency: string;
  txs: EngineTx[];
}

/**
 * The year's cost ledger for the whole account. Deliberately unscoped: the
 * account and custody fees are per account, not per portfolio — a user with
 * a US and an IL portfolio at Meitav owes ₪15/month once — so this reads
 * every portfolio itself rather than taking the market-scoped set the
 * Performance read holds.
 */
export async function getUserCosts(userId: string, year: number, usdIlsRate: number): Promise<CostsLedger> {
  const [profile, rows] = await Promise.all([
    getBrokerProfile(userId),
    db.select().from(portfoliosTable).where(eq(portfoliosTable.userId, userId)),
  ]);
  const portfolios: CostsPortfolio[] = await Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      currency: p.currency,
      txs: (await listTransactions(p.id)).map(toEngineTx),
    })),
  );
  const today = new Date().toISOString().slice(0, 10);
  // A broker's schedules are effective-dated and resolved last-wins, for the
  // same reason the market calendars are: a backdated view must be priced with
  // the tariff in force then, not the one in force now. Resolve at the year
  // being reported; only the current year resolves at the clock. (`today` still
  // governs which quarters have ended — that is a different question.)
  const schedule = resolveSchedule(profile, year < Number(today.slice(0, 4)) ? `${year}-12-31` : today);

  // Trade commissions carry their trade's currency — the portfolio's.
  const costsTxs: CostsTx[] = portfolios.flatMap((p) =>
    p.txs.map((t) => ({ tradeDate: t.tradeDate, commission: t.commission, currency: p.currency })),
  );
  const firstTradeDate = costsTxs.reduce<string | undefined>(
    (min, t) => (min === undefined || t.tradeDate < min ? t.tradeDate : min),
    undefined,
  );

  // The offset counts commissions in every currency, so convert each month's
  // into the fee's currency — presentation-layer FX with the same rate the
  // Performance payload carries.
  let commissionsInFeeCurrency: Partial<Record<number, number>> | undefined;
  if (schedule?.accountFee) {
    const toFee = makeConvert(usdIlsRate, schedule.accountFee.currency);
    commissionsInFeeCurrency = {};
    for (const t of costsTxs) {
      if (Number(t.tradeDate.slice(0, 4)) !== year || t.commission <= 0) continue;
      const m = Number(t.tradeDate.slice(5, 7));
      commissionsInFeeCurrency[m] = (commissionsInFeeCurrency[m] ?? 0) + toFee(t.commission, t.currency);
    }
  }

  // Custody: value each portfolio's completed quarters from persisted closes
  // (one query), convert to the tier currency, merge account-level.
  let valuations: PeriodValuation[] | undefined;
  if (schedule?.custodyFee) {
    const symbols = [...new Set(portfolios.flatMap((p) => p.txs.map((t) => t.symbol)))];
    const closes = new Map<string, DailyClose[]>();
    if (symbols.length) {
      const from = new Date(Date.UTC(year, 0, 1 - MAX_CLOSE_AGE_DAYS)).toISOString().slice(0, 10);
      const rows = await db
        .select({ symbol: priceHistory.symbol, date: priceHistory.date, close: priceHistory.close })
        .from(priceHistory)
        .where(and(inArray(priceHistory.symbol, symbols), gte(priceHistory.date, from), lte(priceHistory.date, `${year}-12-31`)));
      for (const r of rows) {
        const series = closes.get(r.symbol) ?? [];
        series.push({ date: r.date, close: Number(r.close) });
        closes.set(r.symbol, series);
      }
    }

    const toTier = makeConvert(usdIlsRate, schedule.custodyFee.annual.tierCurrency);
    const perPortfolio: PeriodValuation[] = [];
    for (const p of portfolios) {
      for (const q of [1, 2, 3, 4] as const) {
        const quarterEnd = `${year}-${String(q * 3).padStart(2, '0')}-${q === 1 ? '31' : q === 2 ? '30' : q === 3 ? '30' : '31'}`;
        if (quarterEnd >= today) continue; // only quarters that have fully ended are billed
        const v = quarterValuation(p.txs, year, q, closes);
        if (v) perPortfolio.push({ ...v, value: toTier(v.value, p.currency) });
      }
    }
    valuations = mergePeriodValuations(perPortfolio);
  }

  return computeCosts({
    year,
    today,
    txs: costsTxs,
    schedule,
    accountFeeWaivedUntil: profile?.accountFeeWaivedUntil,
    accountOpenedAt: profile?.accountOpenedAt,
    firstTradeDate,
    commissionsInFeeCurrency,
    valuations,
  });
}
