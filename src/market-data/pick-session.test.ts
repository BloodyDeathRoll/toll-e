import { describe, expect, it } from 'vitest';
import { pickSession } from './yahoo';
import { getMarket } from '@/src/markets/registry';

const us = getMarket('US').calendar;

// Exchange-local offset for US markets in summer (EDT, UTC-4).
const OFFSET = -4 * 60 * 60 * 1000;

/** A bar at `hh:mm` exchange-local on the given UTC day index (Aug 10 2026 = Mon). */
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
    const { points: got, previousClose } = pickSession(points, us);
    expect(got.map((p) => p.close)).toEqual([111, 112, 113]);
    // The previous session's last regular print.
    expect(previousClose).toBe(110);
  });

  it('holds the previous session while the new one has a single print', () => {
    // 09:31 on day 1: one bar in, not yet a graph.
    const points = [bar(0, 9, 30, 100), bar(0, 12, 0, 105), bar(0, 15, 55, 110), bar(1, 9, 30, 111)];
    const { points: got, previousClose } = pickSession(points, us);
    expect(got.map((p) => p.close)).toEqual([100, 105, 110]);
    expect(previousClose).toBeUndefined();
  });

  it('shows the last completed session overnight', () => {
    const points = [bar(0, 9, 30, 100), bar(0, 15, 55, 110)];
    const { points: got } = pickSession(points, us);
    expect(got).toHaveLength(2);
  });

  it('holds the last session through the pre-market — a few 04:00 prints are not a day', () => {
    const points = [bar(0, 9, 30, 100), bar(0, 15, 55, 110), bar(1, 4, 0, 108), bar(1, 4, 5, 109)];
    const { points: got, previousClose } = pickSession(points, us);
    expect(got.map((p) => p.close)).toEqual([100, 110]);
    expect(previousClose).toBeUndefined();
  });

  it('drops extended-hours bars from the session it shows', () => {
    const points = [bar(0, 4, 0, 98), bar(0, 9, 30, 100), bar(0, 15, 55, 110), bar(0, 19, 0, 112)];
    const { points: got } = pickSession(points, us);
    expect(got.map((p) => p.close)).toEqual([100, 110]);
  });

  it('reads the previous close from the regular bell, not an after-hours tick', () => {
    const points = [bar(0, 16, 0, 100), bar(0, 19, 0, 101), bar(1, 9, 30, 102), bar(1, 9, 35, 103)];
    const { points: got, previousClose } = pickSession(points, us);
    expect(got.map((p) => p.close)).toEqual([102, 103]);
    expect(previousClose).toBe(100);
  });

  it('skips a holiday and shows the session before it', () => {
    // 2026-12-25 is Christmas: no session, so Dec 24's half-day shows.
    const t = (day: number, hh: number, mm: number, close: number) => ({
      t: Date.UTC(2026, 11, day, hh, mm) + 5 * 60 * 60 * 1000, // EST, UTC-5
      close,
    });
    const points = [t(24, 9, 30, 100), t(24, 12, 55, 106), t(25, 10, 0, 120)];
    const { points: got } = pickSession(points, us);
    expect(got.map((p) => p.close)).toEqual([100, 106]);
  });

  it('falls back to the only day it has, however thin', () => {
    const { points: got } = pickSession([bar(0, 9, 30, 100)], us);
    expect(got).toHaveLength(1);
  });

  it('returns an empty series unchanged', () => {
    expect(pickSession([], us)).toEqual({ points: [] });
  });
});
