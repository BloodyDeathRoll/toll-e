import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { portfolios } from '@/src/db/schema';
import { computeTax, shieldEnteringYear } from '@/src/engine/tax';
import { getFx, getSummary } from '@/src/market-data';
import { OTHER_SLICE } from '@/src/allocation';
import { getUserCosts } from './costs';
import { makeConvert } from './fx-convert';
import { getPositions, listTransactions, toEngineTx } from './portfolios';

// The combined picture (§3.4): native amounts are authoritative; conversion
// to the display currency happens here, at the presentation layer, never in
// the tax engine. The FX rate used is part of the payload (audit trail).

export interface PerformancePortfolio {
  id: string;
  name: string;
  market: string;
  currency: string;
  /** The portfolio's tax rate — what the withheld figures were computed at. */
  ratePct: number;
  /** Native currency figures for the selected year (unrealized is "now"). */
  realized: number;
  unrealized: number;
  /** Cash the broker withheld at source across the year. */
  taxPaid: number;
  /** What the year actually owes once the registered shield is applied. */
  taxOwed: number;
  /** taxPaid − taxOwed, back in next year's filing. */
  taxRefund: number;
  shieldRemaining: number;
  /**
   * Registered shield as it stood *entering* the selected year — the previous
   * year's carry-out, and nothing else. It is what the year is filed against,
   * so it is the reading a year-scoped screen wants; `shieldRemaining` is the
   * balance after every year on record.
   */
  shieldEntering: number;
  /** Realized losses still in this year's at-source pool, native currency. */
  poolLeft: number;
  /** Same figures in the display currency. */
  converted: { realized: number; unrealized: number; taxPaid: number; taxOwed: number; taxRefund: number };
}

/** One sell action, in the display currency — a line in the month drill-down. */
export interface PerformanceSale {
  id: string;
  symbol: string;
  date: string;
  shares: number;
  /** Realized gain, negative for a loss. */
  gain: number;
  /** Withheld at source because of this sale. Zero on a loss or a shielded gain. */
  tax: number;
  /** gain − tax: what the sale actually left behind. */
  net: number;
  /** Which portfolio it came from — several can share a month. */
  portfolio: string;
}

export interface PerformanceMonth {
  month: number;
  gains: number;
  losses: number;
  net: number;
  tax: number;
  /**
   * The month's trade commissions in the display currency — ALREADY inside
   * `gains`/`losses` (folded into basis and proceeds before matching), so a
   * reader may show them but must never add them to the month's footing.
   */
  costs: number;
  /** Same commissions by native currency, unconverted. */
  costsNative: Record<string, number>;
  /**
   * Account fee actually charged for the month, display currency — in
   * nothing above. Zero while the month is still running: nothing has been
   * collected yet, and at an offset broker later trades can still cover it.
   */
  accountFee: number;
  /**
   * The month's fee was covered by its own commissions — the offset broker's
   * bargain, and the reason `accountFee` is 0 here rather than one of the
   * several reasons a month simply has no fee.
   */
  accountFeeOffset: boolean;
  sales: PerformanceSale[];
}

/** The year's fee picture — the Costs card. Fees are account-level. */
export interface PerformanceCosts {
  /** Native trade-commission totals by currency — never cross-summed. */
  tradeCommissions: Record<string, number>;
  tradeCommissionsConverted: number;
  accountFee: { amount: number; currency: string; converted: number } | null;
  custody: {
    amount: number;
    currency: string;
    converted: number;
    basis: 'market' | 'partial' | 'cost';
    quarters: number;
    quartersAtCost: number;
  } | null;
  /** Commissions + fees, converted to the display currency. */
  totalConverted: number;
}

/** A slice of the holdings, by the provider's sector classification. */
export interface AllocationSlice {
  label: string;
  /** Percent units (80, not 0.8), rounded to whole numbers for display. */
  pct: number;
}

export interface PerformancePayload {
  displayCurrency: string;
  fx: { pair: string; rate: number; asOf: string };
  year: number;
  years: number[];
  /**
   * Combined totals in the display currency.
   *
   * The two shields are not one thing: `pool` is what the broker will offset
   * at source before the year is out, `shield` is what the tax authority has
   * registered and settles at filing. See the mechanic at the top of
   * src/engine/tax/index.ts.
   *
   * `shield` is the balance as it stands today; `irsShield` is the balance the
   * *selected* year opened with. Pick by what the surface reports on — a card
   * under a year picker means the latter.
   */
  totals: {
    realized: number;
    unrealized: number;
    taxPaid: number;
    taxOwed: number;
    taxRefund: number;
    pool: number;
    shield: number;
    irsShield: number;
  };
  portfolios: PerformancePortfolio[];
  /** Combined month rows in the display currency. */
  months: PerformanceMonth[];
  /**
   * What the year cost in fees. Unlike everything above, the account and
   * custody fees are account-level — one fee across all portfolios,
   * whatever market the screen is scoped to — and the UI labels them so.
   */
  costs: PerformanceCosts;
  /**
   * Where the money is now, by sector, largest first — the donut on the
   * Performance screen. Unlike everything else here this is about the
   * holdings as they stand, not the selected year, because that is the only
   * sense a breakdown of a portfolio can have. The screen therefore shows the
   * donut only while the current year is selected, rather than pairing a
   * "now" breakdown with a past year's figures.
   */
  allocation: AllocationSlice[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPerformance(
  userId: string,
  displayCurrency: string,
  year?: number,
  market?: string,
): Promise<PerformancePayload | null> {
  const rows = await db
    .select()
    .from(portfolios)
    .where(
      market
        ? and(eq(portfolios.userId, userId), eq(portfolios.market, market))
        : eq(portfolios.userId, userId),
    )
    .orderBy(asc(portfolios.sortOrder), asc(portfolios.createdAt));
  // No portfolio in this market yet — the screen says so rather than falling
  // back to another market's numbers.
  if (rows.length === 0) return null;

  const fx = await getFx('USDILS');
  const convert = makeConvert(fx.rate, displayCurrency);

  const perPortfolio: PerformancePortfolio[] = [];
  const monthAcc = new Map<
    number,
    Omit<PerformanceMonth, 'costs' | 'costsNative' | 'accountFee' | 'accountFeeOffset'>
  >();
  const yearSet = new Set<number>();

  // One read and one tax run per portfolio, held for both passes. The two
  // passes are still necessary — `selectedYear` cannot be picked until every
  // year that exists is known — but the work behind them is not: the engine
  // is pure, so a second run answers exactly what the first one did. Reading
  // the portfolios concurrently rather than one after another is the larger
  // win once there is more than one.
  // The positions read comes along for the ride: it depends on the portfolio
  // and its transactions and on nothing the year picker decides, and its
  // `getQuotes` call is the one genuinely slow thing on this path. Left in the
  // pass below it ran once per portfolio in series, so a two-market user paid
  // two quote round trips end to end for a page that needs one.
  const computed = await Promise.all(
    rows.map(async (p) => {
      const txs = (await listTransactions(p.id)).map(toEngineTx);
      return {
        p,
        txs,
        tax: computeTax(txs, { ratePct: Number(p.taxRatePct) }),
        positions: await getPositions(p, txs),
      };
    }),
  );

  for (const { tax } of computed) {
    for (const y of tax.years) yearSet.add(y.year);
  }
  // A year is offered because something HAPPENED in it, not because something
  // was sold in it. The tax engine only ever lists years with sales (it has
  // nothing else to say about the others), but this payload also carries the
  // Costs card — commissions and the account-level fee ledger — and those are
  // real, collected charges in a year the user only bought in. Without the
  // trade years the picker cannot reach them, and `selectedYear` below
  // silently rewrites an explicit request for such a year back to today's.
  for (const { txs } of computed) {
    for (const tx of txs) yearSet.add(Number(tx.tradeDate.slice(0, 4)));
  }
  // The current year is always offered and is always the default, whether or
  // not anything has been sold in it yet — "nothing realized this year" is an
  // answer, and silently landing on an older year is not.
  const thisYear = new Date().getFullYear();
  yearSet.add(thisYear);
  const years = [...yearSet].sort((a, b) => b - a);
  const selectedYear = year && yearSet.has(year) ? year : thisYear;

  // The fee ledger runs concurrently with the per-portfolio pass below —
  // its price_history read is the one extra query this payload costs.
  const ledgerPromise = getUserCosts(userId, selectedYear, fx.rate);

  // The months shown are the scoped portfolios' — so their commission lines
  // are too, taken straight from the transactions already in hand.
  const monthCommissions = new Map<number, Record<string, number>>();
  for (const { p, txs } of computed) {
    for (const tx of txs) {
      if (!tx.tradeDate.startsWith(String(selectedYear)) || tx.commission <= 0) continue;
      const m = Number(tx.tradeDate.slice(5, 7));
      const acc = monthCommissions.get(m) ?? {};
      acc[p.currency] = round2((acc[p.currency] ?? 0) + tx.commission);
      monthCommissions.set(m, acc);
    }
  }

  /** Symbol → market value in the display currency, for the allocation. */
  const heldValue = new Map<string, number>();

  for (const { p, tax, positions } of computed) {
    const ledger = tax.years.find((y) => y.year === selectedYear);
    for (const pos of positions.positions) {
      heldValue.set(pos.symbol, (heldValue.get(pos.symbol) ?? 0) + convert(pos.marketValue, p.currency));
    }

    const realized = ledger?.net ?? 0;
    const unrealized = positions.totals.totalGain;
    // Both sides of the cash story: what was withheld month by month, and what
    // the year actually owes. They differ exactly by the shield and by any
    // over-withholding from month ordering — that difference is the refund.
    const taxPaid = ledger?.paid ?? 0;
    const taxOwed = ledger?.owed ?? 0;
    const taxRefund = ledger?.refundNextYear ?? 0;

    perPortfolio.push({
      id: p.id,
      name: p.name,
      market: p.market,
      currency: p.currency,
      ratePct: Number(p.taxRatePct),
      realized: round2(realized),
      unrealized: round2(unrealized),
      taxPaid: round2(taxPaid),
      taxOwed: round2(taxOwed),
      taxRefund: round2(taxRefund),
      shieldRemaining: tax.shieldRemaining,
      shieldEntering: shieldEnteringYear(tax, selectedYear),
      // The pool as the year's last active month left it — the same reading
      // previewSell reports as `poolAfter`.
      poolLeft: ledger && ledger.months.length > 0 ? ledger.months[ledger.months.length - 1].poolOut : 0,
      converted: {
        realized: round2(convert(realized, p.currency)),
        unrealized: round2(convert(unrealized, p.currency)),
        taxPaid: round2(convert(taxPaid, p.currency)),
        taxOwed: round2(convert(taxOwed, p.currency)),
        taxRefund: round2(convert(taxRefund, p.currency)),
      },
    });

    for (const m of ledger?.months ?? []) {
      const acc = monthAcc.get(m.month) ?? {
        month: m.month,
        gains: 0,
        losses: 0,
        net: 0,
        tax: 0,
        sales: [],
      };
      acc.gains += convert(m.gains, p.currency);
      acc.losses += convert(m.losses, p.currency);
      acc.net += convert(m.net, p.currency);
      acc.tax += convert(m.paid ?? 0, p.currency);

      // Withholding happens per month, after the intra-year loss pool absorbs
      // what it can — there is no per-sale figure in the engine. Splitting the
      // month's withholding across its gaining sales pro-rata by gain is the
      // only attribution that foots exactly to the cash that left.
      const inMonth = ledger!.sales.filter((s) => Number(s.date.slice(5, 7)) === m.month);
      const gainSum = inMonth.reduce((s, e) => s + Math.max(0, e.gain), 0);
      for (const s of inMonth) {
        const share = s.gain > 0 && gainSum > 0 ? s.gain / gainSum : 0;
        const gain = round2(convert(s.gain, p.currency));
        const tax = round2(convert((m.paid ?? 0) * share, p.currency));
        acc.sales.push({
          id: s.saleTxId,
          symbol: s.symbol,
          date: s.date,
          shares: s.shares,
          gain,
          tax,
          net: round2(gain - tax),
          portfolio: p.name,
        });
      }
      monthAcc.set(m.month, acc);
    }
  }

  const ledger = await ledgerPromise;
  const ledgerAccountFee = new Map(ledger.months.map((m) => [m.month, m.accountFee]));
  const feeOffsetMonths = new Set(ledger.months.filter((m) => m.accountFeeOffset).map((m) => m.month));
  const feeCurrency = ledger.accountFee?.currency ?? 'ILS';

  const months: PerformanceMonth[] = [...monthAcc.values()].map((m) => {
    const costsNative = monthCommissions.get(m.month) ?? {};
    return {
      month: m.month,
      gains: round2(m.gains),
      losses: round2(m.losses),
      net: round2(m.net),
      tax: round2(m.tax),
      costs: round2(
        Object.entries(costsNative).reduce((s, [ccy, amount]) => s + convert(amount, ccy), 0),
      ),
      costsNative,
      accountFee: round2(convert(ledgerAccountFee.get(m.month) ?? 0, feeCurrency)),
      accountFeeOffset: feeOffsetMonths.has(m.month),
      // Newest first, matching the month order the screen lists them in.
      sales: [...m.sales].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)),
    };
  });
  // A month that was CHARGED a fee earns a row even without sales — a
  // backdated account opening would otherwise be invisible everywhere but
  // the year total. Commission-only months do not: a buy commission has no
  // P&L effect (it is capitalized into basis and realizes on the sale), so
  // a row for it would just read as an unexplained zero. A month whose
  // commissions fully covered the fee is exactly such a month — nothing was
  // charged, no row.
  const present = new Set(months.map((m) => m.month));
  for (let m = 1; m <= 12; m++) {
    if (present.has(m)) continue;
    const fee = ledgerAccountFee.get(m) ?? 0;
    if (fee <= 0) continue;
    const costsNative = monthCommissions.get(m) ?? {};
    months.push({
      month: m,
      gains: 0,
      losses: 0,
      net: 0,
      tax: 0,
      costs: round2(Object.entries(costsNative).reduce((s, [ccy, amount]) => s + convert(amount, ccy), 0)),
      costsNative,
      accountFee: round2(convert(fee, feeCurrency)),
      accountFeeOffset: false,
      sales: [],
    });
  }
  months.sort((a, b) => a.month - b.month);

  // A commission belongs to the trade that paid it, so it belongs to that
  // trade's portfolio — unlike the account and custody fees, which are per
  // account and stay as `getUserCosts` (deliberately unscoped) reports them.
  // Taking the year total from the ledger instead put another market's
  // commissions on a market-scoped screen, above month rows that do not
  // contain them: the card and the months it sits over stopped footing.
  const tradeCommissions: Record<string, number> = {};
  for (const acc of monthCommissions.values()) {
    for (const [ccy, amount] of Object.entries(acc)) {
      tradeCommissions[ccy] = round2((tradeCommissions[ccy] ?? 0) + amount);
    }
  }

  const tradeCommissionsConverted = round2(
    Object.entries(tradeCommissions).reduce((s, [ccy, amount]) => s + convert(amount, ccy), 0),
  );
  const accountFeeConverted = ledger.accountFee
    ? round2(convert(ledger.accountFee.amount, ledger.accountFee.currency))
    : 0;
  const custodyConverted = ledger.custody
    ? round2(convert(ledger.custody.amount, ledger.custody.currency))
    : 0;
  const costs: PerformanceCosts = {
    tradeCommissions,
    tradeCommissionsConverted,
    accountFee: ledger.accountFee ? { ...ledger.accountFee, converted: accountFeeConverted } : null,
    custody: ledger.custody ? { ...ledger.custody, converted: custodyConverted } : null,
    totalConverted: round2(tradeCommissionsConverted + accountFeeConverted + custodyConverted),
  };

  return {
    allocation: await allocate(heldValue),
    displayCurrency,
    fx: { pair: fx.pair, rate: fx.rate, asOf: fx.asOf },
    year: selectedYear,
    years,
    totals: {
      realized: round2(perPortfolio.reduce((s, p) => s + p.converted.realized, 0)),
      unrealized: round2(perPortfolio.reduce((s, p) => s + p.converted.unrealized, 0)),
      taxPaid: round2(perPortfolio.reduce((s, p) => s + p.converted.taxPaid, 0)),
      taxOwed: round2(perPortfolio.reduce((s, p) => s + p.converted.taxOwed, 0)),
      taxRefund: round2(perPortfolio.reduce((s, p) => s + p.converted.taxRefund, 0)),
      pool: round2(
        perPortfolio.reduce((s, p) => s + convert(p.poolLeft, p.currency), 0),
      ),
      shield: round2(
        perPortfolio.reduce((s, p) => s + convert(p.shieldRemaining, p.currency), 0),
      ),
      irsShield: round2(
        perPortfolio.reduce((s, p) => s + convert(p.shieldEntering, p.currency), 0),
      ),
    },
    portfolios: perPortfolio,
    months,
    costs,
  };
}

/**
 * Group the holdings by sector and turn them into donut slices.
 *
 * The classification is one cached `getSummary` per symbol (24h), fetched
 * concurrently and individually forgiving: a symbol the provider cannot
 * classify falls into "Other" rather than taking the chart down with it.
 *
 * Five named slices at most, because five is where the categorical ramp ends
 * and well past where a donut stops being readable. The rest is "Other",
 * which therefore means both "small" and "unclassified" — a distinction
 * nobody reading a pie chart is asking for.
 */
const MAX_SLICES = 4;

async function allocate(heldValue: Map<string, number>): Promise<AllocationSlice[]> {
  const total = [...heldValue.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return [];

  const classified = await Promise.all(
    [...heldValue].map(async ([symbol, value]) => {
      const sector = await getSummary(symbol)
        .then((s) => s.sector ?? s.industry)
        .catch(() => undefined);
      return { sector, value };
    }),
  );

  const bySector = new Map<string, number>();
  let other = 0;
  for (const { sector, value } of classified) {
    if (sector) bySector.set(sector, (bySector.get(sector) ?? 0) + value);
    else other += value;
  }

  const ranked = [...bySector].sort((a, b) => b[1] - a[1]);
  for (const [, value] of ranked.slice(MAX_SLICES)) other += value;

  const slices = ranked.slice(0, MAX_SLICES).map(([label, value]) => ({
    label,
    pct: Math.round((value / total) * 100),
  }));
  if (other > 0) slices.push({ label: OTHER_SLICE, pct: Math.round((other / total) * 100) });
  return slices;
}
