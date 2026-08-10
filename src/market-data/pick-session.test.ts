import { describe, expect, it } from 'vitest';
import { pickSession } from './yahoo';

// Exchange-local offset for US markets in summer (EDT, UTC-4).
const OFFSET = -4 * 60 * 60 * 1000;

/** A bar at `hh:mm` exchange-local on the given UTC day index. */
const bar = (dayIndex: number, hh: number, mm: number, close: number) => ({
  t: Date.UTC(2026, 7, 10 + dayIndex, hh, mm) - OFFSET,
  close,
});

describe('pickSession', () => {
  it('keeps the newest day once it has traded', () => {
    const points = [
      bar(0, 9, 30, 100),
      bar(0, 15, 55, 110),
      bar(1, 9, 30, 111),
      bar(1, 9, 35, 112),
      bar(1, 9, 40, 113),
    ];
    const { points: got, previousClose } = pickSession(points, OFFSET);
    expect(got.map((p) => p.close)).toEqual([111, 112, 113]);
    // The last print before the session on show.
    expect(previousClose).toBe(110);
  });

  it('holds the previous session while the new one has a single print', () => {
    // 09:31 on day 1: one bar in, not yet a graph.
    const points = [bar(0, 9, 30, 100), bar(0, 12, 0, 105), bar(0, 15, 55, 110), bar(1, 9, 30, 111)];
    const { points: got, previousClose } = pickSession(points, OFFSET);
    expect(got.map((p) => p.close)).toEqual([100, 105, 110]);
    expect(previousClose).toBeUndefined();
  });

  it('shows the last completed session overnight', () => {
    const points = [bar(0, 9, 30, 100), bar(0, 15, 55, 110)];
    const { points: got } = pickSession(points, OFFSET);
    expect(got).toHaveLength(2);
  });

  it('counts pre-market bars as part of the new day', () => {
    const points = [bar(0, 15, 55, 110), bar(1, 4, 0, 108), bar(1, 4, 5, 109)];
    const { points: got, previousClose } = pickSession(points, OFFSET);
    expect(got.map((p) => p.close)).toEqual([108, 109]);
    expect(previousClose).toBe(110);
  });

  it('falls back to the only day it has, however thin', () => {
    const { points: got } = pickSession([bar(0, 9, 30, 100)], OFFSET);
    expect(got).toHaveLength(1);
  });

  it('groups by exchange-local day, not UTC day', () => {
    // 20:00 EDT is next-day 00:00 UTC — it must stay on its own session.
    const points = [bar(0, 16, 0, 100), bar(0, 20, 0, 101), bar(1, 9, 30, 102), bar(1, 9, 35, 103)];
    const { points: got, previousClose } = pickSession(points, OFFSET);
    expect(got.map((p) => p.close)).toEqual([102, 103]);
    expect(previousClose).toBe(101);
  });

  it('returns an empty series unchanged', () => {
    expect(pickSession([], OFFSET)).toEqual({ points: [] });
  });
});
