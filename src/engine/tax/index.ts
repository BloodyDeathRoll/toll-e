// The tax engine — pure, deterministic, no framework or DB imports.
// f(transactions, ruleSet) → {realizedEvents, monthly/yearly ledgers, shield}.
// Tax is derived, never stored: any edit, backdate, or rate change simply
// recomputes (AGENTS.md invariant). Native currency only — no FX in here.

import { computePortfolio, type EngineTx, type RealizedEvent } from '../portfolio';

/**
 * V1 rules: a flat nominal rate (Israel default 25%; 0 hides tax UI).
 * §3.3 refinements (CPI/FX indexation, surtax, offset breadth) extend this
 * shape later without touching callers.
 */
export interface TaxRuleSet {
  ratePct: number;
}

export interface MonthLedger {
  /** 1–12 */
  month: number;
  gains: number;
  losses: number; // positive magnitude
  net: number;
  /**
   * Informational monthly accrual (net > 0 ? net × rate : null ⇒ "shielded").
   * The yearly ledger is authoritative — shield application is yearly.
   */
  tax: number | null;
}

export interface YearLedger {
  year: number;
  realizedGains: number;
  realizedLosses: number; // positive magnitude
  net: number;
  /** Carryforward shield available entering the year. */
  shieldIn: number;
  /** Shield consumed against this year's net gain. */
  shieldUsed: number;
  /** Shield carried out to the next year (indefinite carryforward). */
  shieldOut: number;
  taxable: number;
  ratePct: number;
  due: number;
  months: MonthLedger[];
  /** This year's sales, chronological — powers the per-sale drill-down. */
  sales: RealizedEvent[];
}

export interface TaxComputation {
  /** Ascending by year; only years with sales appear. */
  years: YearLedger[];
  /** Shield balance after the last year — visible at all times per §3.1. */
  shieldRemaining: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTax(txs: EngineTx[], rules: TaxRuleSet): TaxComputation {
  const { realized } = computePortfolio(txs);

  const byYear = new Map<number, RealizedEvent[]>();
  for (const ev of realized) {
    const year = Number(ev.date.slice(0, 4));
    const list = byYear.get(year) ?? [];
    if (!byYear.has(year)) byYear.set(year, list);
    list.push(ev);
  }

  const years: YearLedger[] = [];
  let shield = 0;
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const sales = byYear.get(year)!;
    const gains = sales.reduce((s, e) => s + Math.max(0, e.gain), 0);
    const losses = sales.reduce((s, e) => s + Math.max(0, -e.gain), 0);
    const net = gains - losses;

    const months: MonthLedger[] = [];
    for (let m = 1; m <= 12; m++) {
      const inMonth = sales.filter((e) => Number(e.date.slice(5, 7)) === m);
      if (inMonth.length === 0) continue;
      const mGains = inMonth.reduce((s, e) => s + Math.max(0, e.gain), 0);
      const mLosses = inMonth.reduce((s, e) => s + Math.max(0, -e.gain), 0);
      const mNet = mGains - mLosses;
      months.push({
        month: m,
        gains: round2(mGains),
        losses: round2(mLosses),
        net: round2(mNet),
        tax: mNet > 0 ? round2((mNet * rules.ratePct) / 100) : null,
      });
    }

    const shieldIn = shield;
    let shieldUsed = 0;
    let taxable = 0;
    if (net > 0) {
      shieldUsed = Math.min(shieldIn, net);
      taxable = net - shieldUsed;
      shield = shieldIn - shieldUsed;
    } else {
      shield = shieldIn - net; // net ≤ 0 grows the shield
    }

    years.push({
      year,
      realizedGains: round2(gains),
      realizedLosses: round2(losses),
      net: round2(net),
      shieldIn: round2(shieldIn),
      shieldUsed: round2(shieldUsed),
      shieldOut: round2(shield),
      taxable: round2(taxable),
      ratePct: rules.ratePct,
      due: round2((taxable * rules.ratePct) / 100),
      months,
      sales,
    });
  }

  return { years, shieldRemaining: round2(shield) };
}

export interface SellPreview {
  proceeds: number;
  costBasis: number;
  gain: number;
  /** Extra shield consumed because of this sale. */
  shieldUsed: number;
  /** Additional tax due this year caused by this sale. */
  taxDelta: number;
  shieldAfter: number;
  ratePct: number;
}

/**
 * Tax impact of a candidate sale: the year's due with vs. without it.
 * The delta view is what the sell confirmation shows (§3.4).
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

  return {
    proceeds: round2(ev.proceeds),
    costBasis: round2(ev.costBasis),
    gain: round2(ev.gain),
    shieldUsed: round2(yWith.shieldUsed - (yWithout?.shieldUsed ?? 0)),
    taxDelta: round2(yWith.due - (yWithout?.due ?? 0)),
    shieldAfter: withSale.shieldRemaining,
    ratePct: rules.ratePct,
  };
}
