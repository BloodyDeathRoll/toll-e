import { describe, expect, it } from 'vitest';
import { demo } from './data';

// The demo frames are hand-authored design data, not engine output, so nothing
// stops them drifting away from the rules the engine enforces. They render on
// the signed-out Tax page next to real copy about withholding and refunds, so
// they have to tell a story that could actually happen. This pins them to it.

describe.each(Object.entries(demo))('demo tax frames — %s', (_market, data) => {
  const tax = data.tax;
  const rate = tax.ratePct / 100;

  it('month rows foot to the yearly gains and losses', () => {
    const gains = tax.months.reduce((s, m) => s + (m.gains ?? 0), 0);
    const losses = tax.months.reduce((s, m) => s + -(m.losses ?? 0), 0);
    expect(gains).toBeCloseTo(tax.realizedGains);
    expect(losses).toBeCloseTo(tax.realizedLosses);
  });

  it('taxable is the year net, before any shield', () => {
    expect(tax.taxable).toBeCloseTo(tax.realizedGains - tax.realizedLosses);
  });

  it('each month withholds what the running loss pool leaves', () => {
    let pool = 0;
    for (const m of tax.months) {
      const net = (m.gains ?? 0) + (m.losses ?? 0);
      expect(m.net).toBeCloseTo(net);
      if (net > 0) {
        const poolUsed = Math.min(pool, net);
        pool -= poolUsed;
        const withheld = (net - poolUsed) * rate;
        expect({ month: m.month, poolUsed: m.poolUsed, tax: m.tax }).toEqual({
          month: m.month,
          poolUsed,
          tax: withheld > 0 ? withheld : null,
        });
      } else {
        pool += -net;
        expect({ month: m.month, poolUsed: m.poolUsed, tax: m.tax }).toEqual({
          month: m.month,
          poolUsed: 0,
          tax: null,
        });
      }
    }
  });

  it('the shield explains the gap between what was withheld and what is owed', () => {
    const withheld = tax.months.reduce((s, m) => s + (m.tax ?? 0), 0);
    const owedBeforeShield = tax.taxable * rate;
    const shield = tax.carriedLoss * rate;
    expect(tax.due).toBeCloseTo(owedBeforeShield - shield);
    // Whatever was over-withheld comes back at filing; never negative.
    expect(withheld - tax.due).toBeGreaterThanOrEqual(0);
  });

  it('the cash shortfall is measured against what was withheld', () => {
    const withheld = tax.months.reduce((s, m) => s + (m.tax ?? 0), 0);
    expect(tax.short).toBeCloseTo(withheld - tax.heldInCash);
  });

  it('per-sale tax agrees with its month', () => {
    for (const s of tax.sales) {
      const month = Number(s.date.slice(5, 7));
      const row = tax.months.find((m) => m.month === month);
      if (!row || s.amount <= 0) {
        expect(s.tax).toBeNull();
        continue;
      }
      // Single-sale months only: a shared month can't attribute the pool.
      const sameMonthGains = tax.sales.filter(
        (x) => Number(x.date.slice(5, 7)) === month && x.amount > 0,
      );
      if (sameMonthGains.length === 1 && row.gains === s.amount) {
        expect(s.tax).toBeCloseTo(row.tax ?? 0);
      }
    }
  });
});
