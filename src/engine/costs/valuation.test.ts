import { describe, expect, it } from 'vitest';
import {
  mergePeriodValuations,
  nearestClose,
  quarterSampleDates,
  quarterValuation,
  type DailyClose,
} from './valuation';
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

const series = (points: Array<[string, number]>): DailyClose[] => points.map(([date, close]) => ({ date, close }));

describe('nearestClose', () => {
  it('accepts a 3-day-old close and rejects a 30-day-old one', () => {
    // A close from three months back is a guess, not a valuation.
    expect(nearestClose(series([['2026-03-28', 100]]), '2026-03-31')).toBe(100);
    expect(nearestClose(series([['2026-03-01', 100]]), '2026-03-31')).toBeUndefined();
  });

  it('takes the latest close on or before the date, never after', () => {
    const s = series([
      ['2026-03-27', 90],
      ['2026-03-30', 95],
      ['2026-04-02', 99],
    ]);
    expect(nearestClose(s, '2026-03-31')).toBe(95);
    expect(nearestClose(undefined, '2026-03-31')).toBeUndefined();
  });
});

describe('quarterSampleDates', () => {
  it('samples the last calendar day of each of the quarter’s months', () => {
    expect(quarterSampleDates(2026, 1)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(quarterSampleDates(2026, 2)).toEqual(['2026-04-30', '2026-05-31', '2026-06-30']);
    expect(quarterSampleDates(2028, 1)[1]).toBe('2028-02-29'); // leap year
  });
});

describe('quarterValuation', () => {
  const buy = () => [tx('BUY', 'NVDA', '2026-01-10', 100, 10)];

  it('values from fresh closes when they exist — basis market', () => {
    const closes = new Map([
      [
        'NVDA',
        series([
          ['2026-01-30', 12],
          ['2026-02-27', 14],
          ['2026-03-31', 16],
        ]),
      ],
    ]);
    expect(quarterValuation(buy(), 2026, 1, closes)).toEqual({
      year: 2026,
      quarter: 1,
      value: (1_200 + 1_400 + 1_600) / 3,
      basis: 'market',
    });
  });

  it('a quarter with no priced symbols still produces a line — at cost', () => {
    // No closes persisted at all: every sample falls back to lot cost basis,
    // which at least is a fact — and the basis says so.
    const v = quarterValuation(buy(), 2026, 1, new Map());
    expect(v).toEqual({ year: 2026, quarter: 1, value: 1_000, basis: 'cost' });
  });

  it('a mix of priced and unpriced symbols is partial', () => {
    const txs = [...buy(), tx('BUY', 'AMD', '2026-01-10', 10, 50)];
    const closes = new Map([['NVDA', series([['2026-01-30', 12], ['2026-02-27', 12], ['2026-03-30', 12]])]]);
    expect(quarterValuation(txs, 2026, 1, closes)?.basis).toBe('partial');
  });

  it('answers nothing for a quarter with no holdings', () => {
    expect(quarterValuation([], 2026, 1, new Map())).toBeUndefined();
    // Held later in the year ≠ held in Q1.
    expect(quarterValuation([tx('BUY', 'NVDA', '2026-05-01', 10, 10)], 2026, 1, new Map())).toBeUndefined();
  });
});

describe('mergePeriodValuations', () => {
  it('sums same-quarter values and degrades mixed bases to partial', () => {
    expect(
      mergePeriodValuations([
        { year: 2026, quarter: 1, value: 100, basis: 'market' },
        { year: 2026, quarter: 1, value: 50, basis: 'cost' },
        { year: 2026, quarter: 2, value: 70, basis: 'market' },
      ]),
    ).toEqual([
      { year: 2026, quarter: 1, value: 150, basis: 'partial' },
      { year: 2026, quarter: 2, value: 70, basis: 'market' },
    ]);
  });
});
