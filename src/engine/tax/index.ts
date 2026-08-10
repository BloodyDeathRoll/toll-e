// The tax engine — pure, deterministic, no framework or DB imports.
// f(transactions, ruleSet) → {realizedEvents, monthly/yearly ledgers, shield}.
// Tax is derived, never stored: any edit, backdate, or rate change simply
// recomputes (AGENTS.md invariant). Native currency only — no FX in here.
//
// The Israeli mechanic this models (toll-e-plan.md §3.1) is a cash-flow one,
// and the two halves must not be conflated:
//
//   Within a year, the broker settles at source. Losses build a running pool;
//   a gain month draws the pool down first and only the remainder is withheld,
//   at that month's end. Order matters — a gain in February is withheld even
//   if a loss follows in November, because the pool only carries forward.
//
//   Across years, nothing is applied at source. The year is computed standalone
//   and paid in full. A year that nets to a loss registers 25% of that loss
//   with the government as a shield; a later year's shield offsets what that
//   year truly owes, and the difference between what was withheld and what was
//   owed comes back as a refund in the following year's filing.
//
// So a prior-year shield never reduces `paid` — it produces `refundNextYear`.

import { computePortfolio, type EngineTx, type RealizedEvent } from '../portfolio';

/**
 * V1 rules: a flat nominal rate (Israel default 25%; 0 hides tax UI).
 * §3.3 refinements (CPI/FX indexation, surtax, offset breadth) extend this
 * shape later without touching callers.
 */
export interface TaxRuleSet {
  ratePct: number;
}

/**
 * One registered loss year. The rate is locked at registration: a ₪40,000 loss
 * registered at 25% stays worth exactly ₪10,000 even if the rate later moves.
 * Keeping layers (rather than one running total) is what lets the UI show the
 * shield's money value *and* the underlying loss behind it once rates differ.
 */
export interface ShieldLayer {
  /** Tax year whose net loss registered this layer. */
  year: number;
  /** Underlying realized loss, positive magnitude. */
  loss: number;
  /** Rate in force when the layer was registered. */
  ratePct: number;
  /** Money value at registration = loss × ratePct. */
  value: number;
  /** Unconsumed part of `value`. */
  remaining: number;
}

export interface MonthLedger {
  /** 1–12 */
  month: number;
  gains: number;
  losses: number; // positive magnitude
  net: number;
  /** Intra-year loss pool entering the month. */
  poolIn: number;
  /** Pool absorbed by this month's gains. */
  poolUsed: number;
  /** Pool carried to the next month. Never crosses a year boundary. */
  poolOut: number;
  /**
   * Tax actually withheld at source at this month's end, or null when nothing
   * was withheld — a loss month, or a gain month the pool fully absorbed
   * ("shielded"). Prior-year shield never reduces this.
   */
  paid: number | null;
}

export interface YearLedger {
  year: number;
  realizedGains: number;
  realizedLosses: number; // positive magnitude
  net: number;
  /** Gain base for the year: max(0, net). */
  taxable: number;
  ratePct: number;
  /** Sum of the monthly at-source withholdings — the cash actually gone. */
  paid: number;
  /** taxable × rate, before any prior-year shield. */
  owedBeforeShield: number;
  /** Registered shield available entering the year (money). */
  shieldIn: number;
  /** Shield consumed against `owedBeforeShield`, oldest layer first (money). */
  shieldUsed: number;
  /** Shield carried out (money) — indefinite carryforward. */
  shieldOut: number;
  /** Realized losses standing behind `shieldOut` — the secondary display figure. */
  shieldLossOut: number;
  /** Shield this year's own loss registers = |net| × rate when net < 0. */
  registered: number;
  /** The year's true liability: owedBeforeShield − shieldUsed. */
  owed: number;
  /** paid − owed, refunded by the government in the following year's filing. */
  refundNextYear: number;
  months: MonthLedger[];
  /** This year's sales, chronological — powers the per-sale drill-down. */
  sales: RealizedEvent[];
}

export interface TaxComputation {
  /** Ascending by year; only years with sales appear. */
  years: YearLedger[];
  /** Shield money left after the last year — visible at all times per §3.1. */
  shieldRemaining: number;
  /**
   * Realized losses still standing behind `shieldRemaining` — the secondary
   * display figure. Equals shieldRemaining ÷ rate while the rate is constant.
   */
  shieldLossRemaining: number;
  /** Unconsumed layers, oldest first — the shield history view (§3.2). */
  shieldLayers: ShieldLayer[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Loss behind a layer's unconsumed money, at the rate it was registered at. */
const layerLoss = (l: ShieldLayer) => (l.ratePct > 0 ? (l.remaining * 100) / l.ratePct : 0);

export function computeTax(txs: EngineTx[], rules: TaxRuleSet): TaxComputation {
  const { realized } = computePortfolio(txs);
  const rate = rules.ratePct / 100;

  const byYear = new Map<number, RealizedEvent[]>();
  for (const ev of realized) {
    const year = Number(ev.date.slice(0, 4));
    const list = byYear.get(year) ?? [];
    if (!byYear.has(year)) byYear.set(year, list);
    list.push(ev);
  }

  const years: YearLedger[] = [];
  const layers: ShieldLayer[] = [];

  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const sales = byYear.get(year)!;
    const gains = sales.reduce((s, e) => s + Math.max(0, e.gain), 0);
    const losses = sales.reduce((s, e) => s + Math.max(0, -e.gain), 0);
    const net = gains - losses;

    // --- At source, month by month. The pool is intra-year only. ---
    const months: MonthLedger[] = [];
    let pool = 0;
    let paid = 0;
    for (let m = 1; m <= 12; m++) {
      const inMonth = sales.filter((e) => Number(e.date.slice(5, 7)) === m);
      if (inMonth.length === 0) continue;
      const mGains = inMonth.reduce((s, e) => s + Math.max(0, e.gain), 0);
      const mLosses = inMonth.reduce((s, e) => s + Math.max(0, -e.gain), 0);
      const mNet = mGains - mLosses;

      const poolIn = pool;
      let poolUsed = 0;
      let withheld = 0;
      if (mNet > 0) {
        poolUsed = Math.min(pool, mNet);
        pool -= poolUsed;
        withheld = (mNet - poolUsed) * rate;
      } else {
        pool += -mNet;
      }
      // Accumulate the rounded figure, so the year's `paid` is exactly what a
      // month-by-month table foots to rather than a cent off it.
      withheld = round2(withheld);
      paid += withheld;

      months.push({
        month: m,
        gains: round2(mGains),
        losses: round2(mLosses),
        net: round2(mNet),
        poolIn: round2(poolIn),
        poolUsed: round2(poolUsed),
        poolOut: round2(pool),
        paid: withheld > 0 ? withheld : null,
      });
    }

    // --- At filing: the year standalone, then prior-year shield against it. ---
    const taxable = Math.max(0, net);
    const owedBeforeShield = taxable * rate;

    const shieldIn = layers.reduce((s, l) => s + l.remaining, 0);
    let need = owedBeforeShield;
    let shieldUsed = 0;
    for (const layer of layers) {
      if (need <= 0) break;
      const take = Math.min(layer.remaining, need);
      layer.remaining -= take;
      need -= take;
      shieldUsed += take;
    }
    const owed = owedBeforeShield - shieldUsed;

    // A loss year registers its shield; it can never shield its own gains,
    // since a year that nets to a loss owes nothing to begin with.
    let registered = 0;
    if (net < 0) {
      registered = -net * rate;
      if (registered > 0) {
        layers.push({
          year,
          loss: round2(-net),
          ratePct: rules.ratePct,
          value: round2(registered),
          remaining: registered,
        });
      }
    }

    years.push({
      year,
      realizedGains: round2(gains),
      realizedLosses: round2(losses),
      net: round2(net),
      taxable: round2(taxable),
      ratePct: rules.ratePct,
      paid: round2(paid),
      owedBeforeShield: round2(owedBeforeShield),
      shieldIn: round2(shieldIn),
      shieldUsed: round2(shieldUsed),
      shieldOut: round2(layers.reduce((s, l) => s + l.remaining, 0)),
      shieldLossOut: round2(layers.reduce((s, l) => s + layerLoss(l), 0)),
      registered: round2(registered),
      owed: round2(owed),
      refundNextYear: round2(paid - owed),
      months,
      sales,
    });
  }

  const live = layers.filter((l) => l.remaining > 0.005);
  return {
    years,
    shieldRemaining: round2(live.reduce((s, l) => s + l.remaining, 0)),
    shieldLossRemaining: round2(live.reduce((s, l) => s + layerLoss(l), 0)),
    shieldLayers: live.map((l) => ({ ...l, remaining: round2(l.remaining) })),
  };
}

export interface SellPreview {
  proceeds: number;
  costBasis: number;
  gain: number;
  /** Intra-year loss pool this sale consumes. */
  poolUsed: number;
  /** Tax withheld at source because of this sale — the cash leaving now. */
  taxDelta: number;
  /** Intra-year pool left after the sale. */
  poolAfter: number;
  /** Registered shield left — untouched by an at-source sale, shown for context. */
  shieldAfter: number;
  ratePct: number;
}

/**
 * Tax impact of a candidate sale: the year's withholding with vs. without it.
 * The delta view is what the sell confirmation shows (§3.4). It reports what
 * is actually withheld now — a prior-year shield does not reduce it, it comes
 * back later as `refundNextYear` on the year ledger.
 */
export function previewSell(
  txs: EngineTx[],
  candidate: EngineTx,
  rules: TaxRuleSet,
): SellPreview {
  const without = computeTax(txs, rules);
  const withSale = computeTax([...txs, candidate], rules);
  const year = Number(candidate.tradeDate.slice(0, 4));
  const yWithout = without.years.find((y) => y.year === year);
  const yWith = withSale.years.find((y) => y.year === year)!;
  const ev = yWith.sales.find((s) => s.saleTxId === candidate.id)!;

  const poolUsed = (y: YearLedger | undefined) =>
    (y?.months ?? []).reduce((s, m) => s + m.poolUsed, 0);
  const poolAfter = (y: YearLedger | undefined) =>
    y && y.months.length > 0 ? y.months[y.months.length - 1].poolOut : 0;

  return {
    proceeds: round2(ev.proceeds),
    costBasis: round2(ev.costBasis),
    gain: round2(ev.gain),
    poolUsed: round2(poolUsed(yWith) - poolUsed(yWithout)),
    taxDelta: round2(yWith.paid - (yWithout?.paid ?? 0)),
    poolAfter: round2(poolAfter(yWith)),
    shieldAfter: withSale.shieldRemaining,
    ratePct: rules.ratePct,
  };
}
