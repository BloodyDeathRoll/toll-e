import { describe, expect, it } from 'vitest';
import { computePortfolio, type EngineTx } from './index';
import { applySplits, splitFactor, type Split } from './splits';

const tx = (over: Partial<EngineTx>): EngineTx => ({
  id: 'a',
  symbol: 'SNDK',
  type: 'BUY',
  tradeDate: '2026-01-10',
  shares: 10,
  pricePerShare: 800,
  commission: 5,
  ...over,
});

const splits = new Map<string, Split[]>([['SNDK', [{ date: '2026-11-20', ratio: 8 }]]]);

describe('splitFactor', () => {
  it('applies only splits after the trade date; the ex-date itself is post-split', () => {
    const s = splits.get('SNDK');
    expect(splitFactor(s, '2026-11-19')).toBe(8);
    expect(splitFactor(s, '2026-11-20')).toBe(1);
    expect(splitFactor(undefined, '2026-01-01')).toBe(1);
  });

  it('compounds successive splits', () => {
    const s = [
      { date: '2021-07-20', ratio: 4 },
      { date: '2024-06-10', ratio: 10 },
    ];
    expect(splitFactor(s, '2020-01-01')).toBe(40);
    expect(splitFactor(s, '2022-01-01')).toBe(10);
  });
});

describe('applySplits', () => {
  it('restates pre-split trades and leaves other symbols and later trades alone', () => {
    const out = applySplits(
      [tx({}), tx({ id: 'b', tradeDate: '2026-11-20' }), tx({ id: 'c', symbol: 'AAPL' })],
      splits,
    );
    expect(out[0]).toMatchObject({ shares: 80, pricePerShare: 100, commission: 5 });
    expect(out[1]).toMatchObject({ shares: 10, pricePerShare: 800 });
    expect(out[2]).toMatchObject({ shares: 10, pricePerShare: 800 });
  });

  it('lets a post-split sale consume a pre-split lot with the cost basis intact', () => {
    const txs = [
      tx({}),
      tx({ id: 's', type: 'SELL', tradeDate: '2026-11-23', shares: 40, pricePerShare: 90, commission: 0 }),
    ];
    const { holdings, realized } = computePortfolio(applySplits(txs, splits));
    expect(holdings[0].shares).toBe(40);
    expect(holdings[0].totalCost).toBeCloseTo(4002.5);
    expect(realized[0].costBasis).toBeCloseTo(4002.5);
    expect(realized[0].gain).toBeCloseTo(40 * 90 - 4002.5);
  });
});
