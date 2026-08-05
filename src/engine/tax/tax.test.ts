import { describe, expect, it } from 'vitest';
import { computeTax, previewSell } from './index';
import type { EngineTx } from '../portfolio';

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

describe('computeTax — yearly ledger', () => {
  it('taxes a simple profitable sale at the rate', () => {
    const { years, shieldRemaining } = computeTax(
      [tx('BUY', 'NVDA', '2026-01-10', 100, 100), tx('SELL', 'NVDA', '2026-03-10', 100, 150)],
      RATE,
    );
    expect(years).toHaveLength(1);
    expect(years[0]).toMatchObject({ year: 2026, net: 5_000, taxable: 5_000, due: 1_250 });
    expect(shieldRemaining).toBe(0);
  });

  it('losses offset gains within the year', () => {
    const { years } = computeTax(
      [
        tx('BUY', 'A', '2026-01-05', 100, 100),
        tx('SELL', 'A', '2026-02-10', 100, 180), // +8,000
        tx('BUY', 'B', '2026-01-05', 100, 100),
        tx('SELL', 'B', '2026-04-10', 100, 70), // −3,000
      ],
      RATE,
    );
    expect(years[0]).toMatchObject({
      realizedGains: 8_000,
      realizedLosses: 3_000,
      net: 5_000,
      due: 1_250,
    });
  });

  it('a loss year creates a shield consumed by the next gain year', () => {
    const { years, shieldRemaining } = computeTax(
      [
        tx('BUY', 'A', '2025-01-05', 100, 100),
        tx('SELL', 'A', '2025-06-10', 100, 76), // 2025: −2,400
        tx('BUY', 'B', '2025-07-05', 100, 100),
        tx('SELL', 'B', '2026-03-10', 100, 217.3), // 2026: +11,730... rest below
        tx('BUY', 'C', '2026-01-05', 100, 100),
        tx('SELL', 'C', '2026-05-10', 100, 124), // +2,400
      ],
      RATE,
    );
    const y2025 = years.find((y) => y.year === 2025)!;
    const y2026 = years.find((y) => y.year === 2026)!;
    expect(y2025).toMatchObject({ net: -2_400, taxable: 0, due: 0, shieldOut: 2_400 });
    expect(y2026.shieldIn).toBe(2_400);
    expect(y2026.shieldUsed).toBe(2_400);
    expect(y2026.taxable).toBeCloseTo(y2026.net - 2_400);
    expect(shieldRemaining).toBe(0);
  });

  it('reproduces the design ledger: 18,240 − 4,110 − 2,400 carried → 2,932.50 due', () => {
    const { years } = computeTax(
      [
        // 2025 loss year → shield 2,400
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
    expect(y.shieldUsed).toBeCloseTo(2_400);
    expect(y.taxable).toBeCloseTo(11_730);
    expect(y.due).toBeCloseTo(2_932.5);
    // Monthly rows match the design table.
    expect(y.months.map((m) => [m.month, m.net, m.tax])).toEqual([
      [2, 3_200, 800],
      [4, -1_600, null],
      [5, 6_900, 1_725],
      [7, 8_140, 2_035],
      [8, -2_510, null],
    ]);
  });

  it('shield persists across empty years and multiple gain years', () => {
    const { years, shieldRemaining } = computeTax(
      [
        tx('BUY', 'A', '2023-01-05', 100, 100),
        tx('SELL', 'A', '2023-06-10', 100, 40), // −6,000 shield
        tx('BUY', 'B', '2023-07-01', 100, 100),
        tx('SELL', 'B', '2025-03-10', 100, 120), // 2025: +2,000, fully shielded
        tx('BUY', 'C', '2025-04-01', 100, 100),
        tx('SELL', 'C', '2026-03-10', 100, 130), // 2026: +3,000, shielded by remaining 4,000
      ],
      RATE,
    );
    const y2025 = years.find((y) => y.year === 2025)!;
    const y2026 = years.find((y) => y.year === 2026)!;
    expect(y2025).toMatchObject({ due: 0, shieldIn: 6_000, shieldOut: 4_000 });
    expect(y2026).toMatchObject({ due: 0, shieldIn: 4_000, shieldOut: 1_000 });
    expect(shieldRemaining).toBe(1_000);
  });

  it('rate changes recompute retroactively; 0% zeroes everything', () => {
    const txs = [tx('BUY', 'A', '2026-01-05', 100, 100), tx('SELL', 'A', '2026-03-10', 100, 150)];
    expect(computeTax(txs, { ratePct: 25 }).years[0].due).toBe(1_250);
    expect(computeTax(txs, { ratePct: 30 }).years[0].due).toBe(1_500);
    expect(computeTax(txs, { ratePct: 0 }).years[0].due).toBe(0);
  });

  it('backdated edits change the ledger deterministically', () => {
    const base = [
      tx('BUY', 'A', '2026-02-01', 100, 200),
      tx('SELL', 'A', '2026-06-10', 50, 250),
    ];
    const before = computeTax(base, RATE).years[0].due;
    // A backdated cheaper buy becomes the FIFO lot → bigger gain, more tax.
    const after = computeTax([...base, tx('BUY', 'A', '2026-01-05', 50, 100)], RATE).years[0].due;
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
    expect(years[0].due).toBeCloseTo(1_230);
  });
});

describe('previewSell', () => {
  const held = [
    tx('BUY', 'NVDA', '2026-01-10', 250, 194.8),
    // Prior loss this year → active shield of 1,530 equivalent
    tx('BUY', 'L', '2025-01-05', 100, 100),
    tx('SELL', 'L', '2025-06-01', 100, 84.7), // 2025: −1,530 shield
  ];

  it('shield absorbs the gain: zero tax due, shield drops', () => {
    const p = previewSell(held, tx('SELL', 'NVDA', '2026-08-04', 100, 210.1), RATE);
    expect(p.gain).toBeCloseTo(1_530);
    expect(p.shieldUsed).toBeCloseTo(1_530);
    expect(p.taxDelta).toBe(0);
    expect(p.shieldAfter).toBe(0);
  });

  it('beyond the shield, the delta is taxed at the rate', () => {
    const p = previewSell(held, tx('SELL', 'NVDA', '2026-08-04', 200, 210.1), RATE);
    expect(p.gain).toBeCloseTo(3_060);
    expect(p.shieldUsed).toBeCloseTo(1_530);
    expect(p.taxDelta).toBeCloseTo(((3_060 - 1_530) * 25) / 100);
  });

  it('a losing sale grows the shield and owes nothing', () => {
    const p = previewSell(held, tx('SELL', 'NVDA', '2026-08-04', 100, 180), RATE);
    expect(p.gain).toBeCloseTo(-1_480);
    expect(p.taxDelta).toBe(0);
    expect(p.shieldAfter).toBeCloseTo(1_530 + 1_480);
  });
});
