import { describe, expect, it } from 'vitest';
import {
  computePortfolio,
  OversellError,
  positionView,
  sharesHeldAt,
  validateSell,
  type EngineTx,
} from './index';

let seq = 0;
const tx = (
  type: 'BUY' | 'SELL',
  symbol: string,
  tradeDate: string,
  shares: number,
  pricePerShare: number,
  commission = 0,
): EngineTx => ({ id: `t${++seq}`, type, symbol, tradeDate, shares, pricePerShare, commission, createdAt: seq });

describe('computePortfolio — FIFO lots', () => {
  it('averages cost across multiple buys', () => {
    const { holdings } = computePortfolio([
      tx('BUY', 'NVDA', '2026-01-10', 100, 100),
      tx('BUY', 'NVDA', '2026-02-10', 100, 200),
    ]);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].shares).toBe(200);
    expect(holdings[0].avgCost).toBe(150);
    expect(holdings[0].totalCost).toBe(30_000);
    expect(holdings[0].lots).toHaveLength(2);
  });

  it('sells consume the oldest lot first and split it', () => {
    const { holdings, realized } = computePortfolio([
      tx('BUY', 'NVDA', '2026-01-10', 100, 100),
      tx('BUY', 'NVDA', '2026-02-10', 100, 200),
      tx('SELL', 'NVDA', '2026-03-10', 60, 250),
    ]);
    // 60 sold from the 100-share @100 lot → 40 remain there.
    expect(realized).toHaveLength(1);
    expect(realized[0].costBasis).toBe(60 * 100);
    expect(realized[0].gain).toBe(60 * 250 - 6_000);
    expect(holdings[0].shares).toBe(140);
    expect(holdings[0].lots[0]).toMatchObject({ shares: 40, costPerShare: 100 });
    expect(holdings[0].lots[1]).toMatchObject({ shares: 100, costPerShare: 200 });
  });

  it('a sale spanning lots matches each at its own cost', () => {
    const { realized } = computePortfolio([
      tx('BUY', 'NVDA', '2026-01-10', 100, 100),
      tx('BUY', 'NVDA', '2026-02-10', 100, 200),
      tx('SELL', 'NVDA', '2026-03-10', 150, 300),
    ]);
    expect(realized[0].costBasis).toBe(100 * 100 + 50 * 200);
    expect(realized[0].matchedLots).toHaveLength(2);
    expect(realized[0].matchedLots[1]).toMatchObject({ shares: 50, costPerShare: 200 });
  });

  it('fully-sold positions drop from holdings', () => {
    const { holdings } = computePortfolio([
      tx('BUY', 'NVDA', '2026-01-10', 100, 100),
      tx('SELL', 'NVDA', '2026-02-10', 100, 150),
    ]);
    expect(holdings).toHaveLength(0);
  });

  it('buy commission raises the lot cost; sell commission cuts proceeds', () => {
    const { realized } = computePortfolio([
      tx('BUY', 'NVDA', '2026-01-10', 100, 100, 50), // cost/share 100.5
      tx('SELL', 'NVDA', '2026-02-10', 100, 150, 30),
    ]);
    expect(realized[0].costBasis).toBeCloseTo(10_050);
    expect(realized[0].proceeds).toBeCloseTo(14_970);
    expect(realized[0].gain).toBeCloseTo(4_920);
  });

  it('backdated buys enter the timeline at their trade date', () => {
    // Sale recorded first, then a backdated cheaper buy — FIFO must use it.
    const sale = tx('SELL', 'NVDA', '2026-03-10', 50, 300);
    const backdated = tx('BUY', 'NVDA', '2026-01-05', 50, 80);
    const { realized } = computePortfolio([tx('BUY', 'NVDA', '2026-02-10', 100, 200), sale, backdated]);
    expect(realized[0].costBasis).toBe(50 * 80);
  });

  it('handles fractional shares', () => {
    const { holdings } = computePortfolio([
      tx('BUY', 'VOO', '2026-01-10', 0.5, 400),
      tx('SELL', 'VOO', '2026-02-10', 0.25, 500),
    ]);
    expect(holdings[0].shares).toBeCloseTo(0.25);
  });

  it('throws OversellError when a sale exceeds holdings at its date', () => {
    expect(() =>
      computePortfolio([
        tx('BUY', 'NVDA', '2026-02-10', 100, 200),
        tx('SELL', 'NVDA', '2026-01-10', 10, 100), // before any buy
      ]),
    ).toThrow(OversellError);
  });

  it('keeps symbols independent', () => {
    const { holdings } = computePortfolio([
      tx('BUY', 'NVDA', '2026-01-10', 10, 100),
      tx('BUY', 'AMD', '2026-01-10', 20, 50),
      tx('SELL', 'AMD', '2026-02-10', 20, 60),
    ]);
    expect(holdings.map((h) => h.symbol)).toEqual(['NVDA']);
  });
});

describe('validateSell', () => {
  const base = [
    tx('BUY', 'NVDA', '2026-01-10', 100, 100),
    tx('SELL', 'NVDA', '2026-03-10', 80, 200),
  ];

  it('accepts a sell within holdings at its date', () => {
    const candidate = tx('SELL', 'NVDA', '2026-02-01', 20, 150);
    expect(validateSell(base, candidate)).toEqual({ ok: true, available: 100 });
  });

  it('rejects a backdated sell that starves a later sell', () => {
    const candidate = tx('SELL', 'NVDA', '2026-02-01', 30, 150);
    // 100 - 30 = 70 left, but March sells 80.
    expect(validateSell(base, candidate).ok).toBe(false);
  });

  it('excludeTxId supports editing an existing sell', () => {
    const edited = { ...base[1], shares: 100 };
    expect(validateSell(base, edited, base[1].id).ok).toBe(true);
  });
});

describe('sharesHeldAt / positionView', () => {
  it('reports balance as of a date', () => {
    const txs = [
      tx('BUY', 'NVDA', '2026-01-10', 100, 100),
      tx('SELL', 'NVDA', '2026-03-10', 40, 200),
    ];
    expect(sharesHeldAt(txs, 'NVDA', '2026-02-01')).toBe(100);
    expect(sharesHeldAt(txs, 'NVDA', '2026-03-10')).toBe(60);
  });

  it('computes market value, total and day gains', () => {
    const { holdings } = computePortfolio([tx('BUY', 'NVDA', '2026-01-10', 250, 194.8)]);
    const v = positionView(holdings[0], { price: 210.1, previousClose: 206.71 });
    expect(v.marketValue).toBeCloseTo(52_525);
    expect(v.totalGain).toBeCloseTo(3_825);
    expect(v.totalGainPct).toBeCloseTo(7.85, 1);
    expect(v.dayGain).toBeCloseTo(847.5);
  });
});
