import { describe, expect, it } from 'vitest';
import { averageTrueRange } from './atr';
import type { ChartPoint } from './types';

const bar = (close: number, high: number, low: number, t = 0): ChartPoint => ({ t, close, high, low });

describe('averageTrueRange', () => {
  it('averages plain high−low ranges when nothing gaps', () => {
    // 15 bars, every day closing where it opened inside a 2-point range.
    const points = [...Array(15)].map((_, i) => bar(100, 101, 99, i));
    expect(averageTrueRange(points)).toBe(2);
  });

  it('an overnight gap counts as range via the prev-close arms', () => {
    const flat = [...Array(14)].map((_, i) => bar(100, 101, 99, i));
    // Gap up: prev close 100, today trades 110–112 → TR = 112 − 100 = 12.
    const points = [...flat, bar(111, 112, 110, 14)];
    // 13 flat ranges of 2 plus the gap bar.
    expect(averageTrueRange(points)).toBeCloseTo((13 * 2 + 12) / 14);
  });

  it('answers nothing without 14 complete ranges', () => {
    expect(averageTrueRange([...Array(14)].map((_, i) => bar(100, 101, 99, i)))).toBeUndefined(); // 13 ranges
    // Close-only bars (degraded data) do not fake a range.
    const closeOnly = [...Array(20)].map((_, i) => ({ t: i, close: 100 }));
    expect(averageTrueRange(closeOnly)).toBeUndefined();
  });

  it('uses only the newest 14 ranges', () => {
    const wildPast = [...Array(10)].map((_, i) => bar(100, 150, 50, i));
    const calmRecent = [...Array(15)].map((_, i) => bar(100, 101, 99, 10 + i));
    expect(averageTrueRange([...wildPast, ...calmRecent])).toBe(2);
  });
});
