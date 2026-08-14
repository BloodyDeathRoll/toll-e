import { describe, expect, it } from 'vitest';
import { computeTax, previewSell } from './index';
import { computePortfolio, type EngineTx } from '../portfolio';

let seq = 0;
const tx = (
  type: 'BUY' | 'SELL',
  symbol: string,
  tradeDate: string,
  shares: number,
  pricePerShare: number,
  commission = 0,
): EngineTx => ({ id: `t${++seq}`, type, symbol, tradeDate, shares, pricePerShare, commission, createdAt: seq });

const RATE = { ratePct: 25 };

describe('computeTax — withholding at source, within the year', () => {
  it('withholds on a simple profitable sale, nothing left to settle', () => {
    const { years, shieldRemaining } = computeTax(
      [tx('BUY', 'NVDA', '2026-01-10', 100, 100), tx('SELL', 'NVDA', '2026-03-10', 100, 150)],
      RATE,
    );
    expect(years).toHaveLength(1);
    expect(years[0]).toMatchObject({
      year: 2026,
      net: 5_000,
      taxable: 5_000,
      paid: 1_250,
      owed: 1_250,
      refundNextYear: 0,
      registered: 0,
    });
    expect(shieldRemaining).toBe(0);
  });

  it('loss first: the pool absorbs the later gain, so less is withheld', () => {
    const { years } = computeTax(
      [
        tx('BUY', 'B', '2026-01-05', 100, 100),
        tx('SELL', 'B', '2026-02-10', 100, 70), // Feb −3,000 → pool
        tx('BUY', 'A', '2026-01-05', 100, 100),
        tx('SELL', 'A', '2026-04-10', 100, 180), // Apr +8,000, 3,000 absorbed
      ],
      RATE,
    );
    expect(years[0]).toMatchObject({
      realizedGains: 8_000,
      realizedLosses: 3_000,
      net: 5_000,
      paid: 1_250, // (8,000 − 3,000) × 25%
      owed: 1_250,
      refundNextYear: 0,
    });
    expect(years[0].months.map((m) => [m.month, m.poolUsed, m.paid])).toEqual([
      [2, 0, null],
      [4, 3_000, 1_250],
    ]);
  });

  it('gain first: the February withholding stands, and November comes back as a refund', () => {
    const { years } = computeTax(
      [
        tx('BUY', 'A', '2026-01-05', 100, 100),
        tx('SELL', 'A', '2026-02-10', 100, 180), // Feb +8,000 → 2,000 withheld
        tx('BUY', 'B', '2026-01-05', 100, 100),
        tx('SELL', 'B', '2026-11-10', 100, 70), // Nov −3,000, too late to offset
      ],
      RATE,
    );
    expect(years[0]).toMatchObject({
      net: 5_000,
      paid: 2_000, // order-dependent: the whole 8,000 was withheld in February
      owed: 1_250, // the year truly owes 25% of the net
      refundNextYear: 750,
      registered: 0, // the year still nets to a gain, so nothing is registered
    });
  });

  it('a year that nets to zero on ordering alone refunds everything withheld', () => {
    const { years, shieldRemaining } = computeTax(
      [
        tx('BUY', 'A', '2026-01-05', 1_000, 100),
        tx('SELL', 'A', '2026-02-10', 1_000, 200), // +100,000 → 25,000 withheld
        tx('BUY', 'B', '2026-01-05', 1_000, 200),
        tx('SELL', 'B', '2026-11-10', 1_000, 100), // −100,000
      ],
      RATE,
    );
    expect(years[0]).toMatchObject({
      net: 0,
      paid: 25_000,
      owed: 0,
      refundNextYear: 25_000,
      registered: 0,
    });
    expect(shieldRemaining).toBe(0);
  });

  it('the pool never crosses a year boundary', () => {
    const { years } = computeTax(
      [
        tx('BUY', 'A', '2025-01-05', 100, 100),
        tx('SELL', 'A', '2025-11-10', 100, 70), // 2025 −3,000
        tx('BUY', 'B', '2025-01-05', 100, 100),
        tx('SELL', 'B', '2026-02-10', 100, 180), // 2026 +8,000 — withheld in full
      ],
      RATE,
    );
    expect(years.find((y) => y.year === 2026)!.months[0]).toMatchObject({
      poolIn: 0,
      poolUsed: 0,
      paid: 2_000,
    });
  });
});

describe('computeTax — the registered shield, across years', () => {
  it('registers 25% of a loss year and refunds it out of the next year’s withholding', () => {
    const { years, shieldRemaining } = computeTax(
      [
        tx('BUY', 'A', '2025-01-05', 100, 100),
        tx('SELL', 'A', '2025-06-10', 100, 76), // 2025: −2,400
        tx('BUY', 'B', '2025-07-05', 100, 100),
        tx('SELL', 'B', '2026-03-10', 100, 217.3), // 2026: +11,730
        tx('BUY', 'C', '2026-01-05', 100, 100),
        tx('SELL', 'C', '2026-05-10', 100, 124), // 2026: +2,400
      ],
      RATE,
    );
    const y2025 = years.find((y) => y.year === 2025)!;
    const y2026 = years.find((y) => y.year === 2026)!;
    expect(y2025).toMatchObject({ net: -2_400, paid: 0, owed: 0, registered: 600, shieldOut: 600 });
    expect(y2026).toMatchObject({
      net: 14_130,
      paid: 3_532.5, // withheld in full at source — the shield does not reach here
      owedBeforeShield: 3_532.5,
      shieldIn: 600,
      shieldUsed: 600,
      owed: 2_932.5,
      refundNextYear: 600,
      shieldOut: 0,
    });
    expect(shieldRemaining).toBe(0);
  });

  it('walks Shahar’s example: 40k loss year → 10k shield → 10k withheld → 10k back', () => {
    const { years, shieldRemaining } = computeTax(
      [
        tx('BUY', 'Z', '2025-03-01', 1_000, 100),
        tx('SELL', 'Z', '2025-12-01', 1_000, 60), // 2025: −40,000 → registers 10,000
        tx('BUY', 'J', '2025-06-01', 100, 200),
        tx('SELL', 'J', '2026-01-15', 100, 100), // Jan: −10,000 → pool
        tx('BUY', 'F', '2025-06-01', 1_000, 100),
        tx('SELL', 'F', '2026-02-20', 1_000, 150), // Feb: +50,000, 10,000 absorbed
      ],
      RATE,
    );
    expect(years.find((y) => y.year === 2025)!).toMatchObject({ registered: 10_000, shieldOut: 10_000 });
    expect(years.find((y) => y.year === 2026)!).toMatchObject({
      net: 40_000,
      paid: 10_000, // 12,500 due on February, less the 2,500 the January pool covered
      shieldIn: 10_000,
      shieldUsed: 10_000,
      owed: 0,
      refundNextYear: 10_000,
    });
    expect(shieldRemaining).toBe(0);
  });

  it('reproduces the design ledger month for month', () => {
    const { years } = computeTax(
      [
        // 2025 loss year → registers 600
        tx('BUY', 'X', '2025-02-01', 100, 100),
        tx('SELL', 'X', '2025-08-01', 100, 76),
        // 2026: Feb +3,200 · Apr −1,600 · May +6,900 · Jul +8,140 · Aug −2,510
        tx('BUY', 'F', '2026-01-02', 100, 100),
        tx('SELL', 'F', '2026-02-10', 100, 132),
        tx('BUY', 'AP', '2026-01-02', 100, 100),
        tx('SELL', 'AP', '2026-04-10', 100, 84),
        tx('BUY', 'M', '2026-01-02', 100, 100),
        tx('SELL', 'M', '2026-05-10', 100, 169),
        tx('BUY', 'J', '2026-01-02', 100, 100),
        tx('SELL', 'J', '2026-07-18', 100, 181.4),
        tx('BUY', 'AU', '2026-01-02', 100, 100),
        tx('SELL', 'AU', '2026-08-01', 100, 74.9),
      ],
      RATE,
    );
    const y = years.find((x) => x.year === 2026)!;
    expect(y.realizedGains).toBeCloseTo(18_240);
    expect(y.realizedLosses).toBeCloseTo(4_110);
    expect(y.net).toBeCloseTo(14_130);
    expect(y.taxable).toBeCloseTo(14_130);
    expect(y.paid).toBeCloseTo(4_160);
    expect(y.shieldUsed).toBeCloseTo(600);
    expect(y.owed).toBeCloseTo(2_932.5);
    expect(y.refundNextYear).toBeCloseTo(1_227.5);
    // [month, net, pool absorbed, withheld]
    expect(y.months.map((m) => [m.month, m.net, m.poolUsed, m.paid])).toEqual([
      [2, 3_200, 0, 800],
      [4, -1_600, 0, null],
      [5, 6_900, 1_600, 1_325],
      [7, 8_140, 0, 2_035],
      [8, -2_510, 0, null],
    ]);
  });

  it('shield persists across empty years and is consumed partially', () => {
    const { years, shieldRemaining, shieldLossRemaining, shieldLayers } = computeTax(
      [
        tx('BUY', 'A', '2023-01-05', 100, 100),
        tx('SELL', 'A', '2023-06-10', 100, 40), // −6,000 → registers 1,500
        tx('BUY', 'B', '2023-07-01', 100, 100),
        tx('SELL', 'B', '2025-03-10', 100, 120), // 2025: +2,000
        tx('BUY', 'C', '2025-04-01', 100, 100),
        tx('SELL', 'C', '2026-03-10', 100, 130), // 2026: +3,000
      ],
      RATE,
    );
    expect(years.find((y) => y.year === 2025)!).toMatchObject({
      paid: 500,
      shieldIn: 1_500,
      shieldUsed: 500,
      owed: 0,
      refundNextYear: 500,
      shieldOut: 1_000,
    });
    expect(years.find((y) => y.year === 2026)!).toMatchObject({
      paid: 750,
      shieldIn: 1_000,
      shieldUsed: 750,
      owed: 0,
      refundNextYear: 750,
      shieldOut: 250,
    });
    expect(shieldRemaining).toBe(250);
    expect(shieldLossRemaining).toBe(1_000); // the loss still standing behind it
    expect(shieldLayers).toEqual([
      { year: 2023, loss: 6_000, ratePct: 25, value: 1_500, remaining: 250 },
    ]);
  });

  it('consumes the oldest layer first', () => {
    const { years } = computeTax(
      [
        tx('BUY', 'A', '2023-01-05', 100, 100),
        tx('SELL', 'A', '2023-06-10', 100, 60), // 2023: −4,000 → 1,000
        tx('BUY', 'B', '2023-01-05', 100, 100),
        tx('SELL', 'B', '2024-06-10', 100, 20), // 2024: −8,000 → 2,000
        tx('BUY', 'C', '2024-07-01', 100, 100),
        tx('SELL', 'C', '2025-03-10', 100, 160), // 2025: +6,000 → owes 1,500
      ],
      RATE,
    );
    const y2025 = years.find((y) => y.year === 2025)!;
    expect(y2025).toMatchObject({ shieldIn: 3_000, shieldUsed: 1_500, shieldOut: 1_500 });
    // 2023's 1,000 went first, then 500 off 2024's layer.
    expect(computeTax([], RATE).shieldLayers).toEqual([]);
  });

  it('rate changes recompute retroactively; 0% zeroes everything', () => {
    const txs = [tx('BUY', 'A', '2026-01-05', 100, 100), tx('SELL', 'A', '2026-03-10', 100, 150)];
    expect(computeTax(txs, { ratePct: 25 }).years[0]).toMatchObject({ paid: 1_250, owed: 1_250 });
    expect(computeTax(txs, { ratePct: 30 }).years[0]).toMatchObject({ paid: 1_500, owed: 1_500 });
    expect(computeTax(txs, { ratePct: 0 }).years[0]).toMatchObject({ paid: 0, owed: 0 });
  });

  it('a registered layer keeps the rate it was registered at', () => {
    const loss = [tx('BUY', 'A', '2025-01-05', 100, 100), tx('SELL', 'A', '2025-06-10', 100, 60)];
    const at25 = computeTax(loss, { ratePct: 25 });
    expect(at25.shieldLayers[0]).toMatchObject({ loss: 4_000, ratePct: 25, value: 1_000 });
    expect(at25.shieldRemaining).toBe(1_000);
    expect(at25.shieldLossRemaining).toBe(4_000);
  });

  it('backdated edits change the ledger deterministically', () => {
    const base = [
      tx('BUY', 'A', '2026-02-01', 100, 200),
      tx('SELL', 'A', '2026-06-10', 50, 250),
    ];
    const before = computeTax(base, RATE).years[0].owed;
    // A backdated cheaper buy becomes the FIFO lot → bigger gain, more tax.
    const after = computeTax([...base, tx('BUY', 'A', '2026-01-05', 50, 100)], RATE).years[0].owed;
    expect(before).toBeCloseTo((50 * 50 * 25) / 100);
    expect(after).toBeCloseTo((50 * 150 * 25) / 100);
  });

  it('commissions reduce the taxable gain on both legs', () => {
    const { years } = computeTax(
      [tx('BUY', 'A', '2026-01-05', 100, 100, 50), tx('SELL', 'A', '2026-03-10', 100, 150, 30)],
      RATE,
    );
    // gain = 15,000 − 30 − (10,000 + 50) = 4,920
    expect(years[0].net).toBeCloseTo(4_920);
    expect(years[0].owed).toBeCloseTo(1_230);
    expect(years[0].paid).toBeCloseTo(1_230);
  });
});

describe('previewSell', () => {
  const held = [
    tx('BUY', 'NVDA', '2026-01-10', 250, 194.8),
    tx('BUY', 'L', '2025-01-05', 100, 100),
    tx('SELL', 'L', '2025-06-01', 100, 84.7), // 2025: −1,530 → registers 382.50
  ];

  it('reports what is withheld now — a prior-year shield does not reduce it', () => {
    const p = previewSell(held, tx('SELL', 'NVDA', '2026-08-04', 100, 210.1), RATE);
    expect(p.gain).toBeCloseTo(1_530);
    expect(p.poolUsed).toBe(0);
    expect(p.taxDelta).toBeCloseTo(382.5); // paid at source despite the standing shield
    expect(p.shieldAfter).toBe(0); // the shield is spent settling the year, refunded later
  });

  it('scales with the gain', () => {
    const p = previewSell(held, tx('SELL', 'NVDA', '2026-08-04', 200, 210.1), RATE);
    expect(p.gain).toBeCloseTo(3_060);
    expect(p.taxDelta).toBeCloseTo(765);
  });

  it('an earlier loss this year is absorbed before anything is withheld', () => {
    const withPool = [
      ...held,
      tx('BUY', 'P', '2026-01-05', 100, 100),
      tx('SELL', 'P', '2026-02-01', 100, 90), // 2026: −1,000 → pool
    ];
    const p = previewSell(withPool, tx('SELL', 'NVDA', '2026-08-04', 100, 210.1), RATE);
    expect(p.gain).toBeCloseTo(1_530);
    expect(p.poolUsed).toBeCloseTo(1_000);
    expect(p.taxDelta).toBeCloseTo(132.5); // (1,530 − 1,000) × 25%
    expect(p.poolAfter).toBe(0);
  });

  it('a losing sale withholds nothing and grows the registered shield', () => {
    const p = previewSell(held, tx('SELL', 'NVDA', '2026-08-04', 100, 180), RATE);
    expect(p.gain).toBeCloseTo(-1_480);
    expect(p.taxDelta).toBe(0);
    expect(p.shieldAfter).toBeCloseTo(382.5 + 370);
  });
});

describe('computeTax — a commission edited retroactively on a fully-consumed lot', () => {
  // Spec §6: the recompute invariant. The same year computed twice, the only
  // difference a buy commission added after the lot was fully sold — every
  // downstream artifact must move: the matched-lot cost, the month pool, the
  // withholding, and the registered shield.
  const year = (buyCommission: number) => [
    tx('BUY', 'L', '2026-01-05', 100, 100, buyCommission),
    tx('SELL', 'L', '2026-02-10', 100, 80), // Feb loss → pool
    tx('BUY', 'A', '2026-01-05', 100, 100),
    tx('SELL', 'A', '2026-03-10', 100, 150), // Mar +5,000 gain
    tx('BUY', 'M', '2026-06-01', 100, 100),
    tx('SELL', 'M', '2026-11-10', 100, 80), // Nov −2,000, after the gain
  ];

  it('before the edit: the year nets to a gain', () => {
    const { years, shieldRemaining } = computeTax(year(0), RATE);
    expect(years[0]).toMatchObject({
      realizedGains: 5_000,
      realizedLosses: 4_000,
      net: 1_000,
      paid: 750, // Mar: (5,000 − 2,000 pool) × 25%
      owed: 250,
      refundNextYear: 500,
      registered: 0,
    });
    expect(years[0].months.map((m) => [m.month, m.poolUsed, m.paid])).toEqual([
      [2, 0, null],
      [3, 2_000, 750],
      [11, 0, null],
    ]);
    expect(shieldRemaining).toBe(0);
  });

  it('after the edit: pool, withholding, and shield all recompute', () => {
    // ₪2,000 of commission lands in the consumed lot's basis: the February
    // loss deepens to 4,000, March's pool absorbs more, the withholding
    // drops, and the year flips to a registered shield.
    const { years, shieldRemaining } = computeTax(year(2_000), RATE);
    expect(years[0]).toMatchObject({
      realizedLosses: 6_000,
      net: -1_000,
      paid: 250, // Mar: (5,000 − 4,000 pool) × 25%
      owed: 0,
      refundNextYear: 250,
      registered: 250, // −1,000 × 25%, carried as next year's shield
    });
    expect(years[0].months.map((m) => [m.month, m.poolUsed, m.paid])).toEqual([
      [2, 0, null],
      [3, 4_000, 250],
      [11, 0, null],
    ]);
    expect(shieldRemaining).toBe(250);
  });

  it('the matched lot itself carries the edited commission', () => {
    const { realized } = computePortfolio(year(2_000));
    const feb = realized.find((r) => r.symbol === 'L')!;
    expect(feb.matchedLots[0].costPerShare).toBe(120); // 100 + 2,000/100
    expect(feb.costBasis).toBe(12_000);
    expect(feb.gain).toBe(8_000 - 12_000);
  });
});
