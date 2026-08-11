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
/** The same instant as a clock reading — every case pins `now` explicitly. */
const at = (dayIndex: number, hh: number, mm: number) =>
  Date.UTC(2026, 7, 10 + dayIndex, hh, mm) - OFFSET;

describe('pickSession', () => {
  it('keeps the newest day once it has traded', () => {
    const points = [
      bar(0, 9, 30, 100),
      bar(0, 15, 55, 110),
      bar(1, 9, 30, 111),
      bar(1, 9, 35, 112),
      bar(1, 9, 40, 113),
    ];
    const { points: got, previousClose } = pickSession(points, us, at(1, 9, 45));
    expect(got.map((p) => p.close)).toEqual([111, 112, 113]);
    // The previous session's last regular print.
    expect(previousClose).toBe(110);
  });

  it('takes the new session from its very first print', () => {
    // 09:31 on day 1: one bar in, and that is the day — the axis is already
    // the new session, so holding yesterday would draw the wrong day.
    const points = [bar(0, 9, 30, 100), bar(0, 12, 0, 105), bar(0, 15, 55, 110), bar(1, 9, 30, 111)];
    const { points: got, previousClose } = pickSession(points, us, at(1, 9, 31));
    expect(got.map((p) => p.close)).toEqual([111]);
    expect(previousClose).toBe(110);
  });

  it('opens the new session before any bar has printed, when the tape has', () => {
    // 09:31, and the 5m feed still holds only yesterday. The last trade is
    // stamped inside today's session, so today it is — empty.
    const points = [bar(0, 9, 30, 100), bar(0, 12, 0, 105), bar(0, 15, 55, 110)];
    const { points: got, previousClose } = pickSession(points, us, at(1, 9, 31), at(1, 9, 31));
    expect(got).toEqual([]);
    expect(previousClose).toBe(110);
  });

  it('holds the finished session when the tape says the exchange is shut', () => {
    // Calendar says trading, but the last print is yesterday's close: an
    // unlisted holiday. Yesterday stays on screen.
    const points = [bar(0, 9, 30, 100), bar(0, 12, 0, 105), bar(0, 15, 55, 110)];
    const { points: got } = pickSession(points, us, at(1, 11, 0), at(0, 16, 0));
    expect(got.map((p) => p.close)).toEqual([100, 105, 110]);
  });

  it('shows the last completed session overnight', () => {
    const points = [bar(0, 9, 30, 100), bar(0, 15, 55, 110)];
    const { points: got } = pickSession(points, us, at(0, 22, 0));
    expect(got).toHaveLength(2);
  });

  it('holds the last session through the pre-market — a few 04:00 prints are not a day', () => {
    const points = [bar(0, 9, 30, 100), bar(0, 15, 55, 110), bar(1, 4, 0, 108), bar(1, 4, 5, 109)];
    const { points: got, previousClose } = pickSession(points, us, at(1, 8, 0));
    expect(got.map((p) => p.close)).toEqual([100, 110]);
    expect(previousClose).toBeUndefined();
  });

  it('drops extended-hours bars from the session it shows', () => {
    const points = [bar(0, 4, 0, 98), bar(0, 9, 30, 100), bar(0, 15, 55, 110), bar(0, 19, 0, 112)];
    const { points: got } = pickSession(points, us, at(0, 20, 30));
    expect(got.map((p) => p.close)).toEqual([100, 110]);
  });

  it('reads the previous close from the regular bell, not an after-hours tick', () => {
    const points = [bar(0, 16, 0, 100), bar(0, 19, 0, 101), bar(1, 9, 30, 102), bar(1, 9, 35, 103)];
    const { points: got, previousClose } = pickSession(points, us, at(1, 9, 40));
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
    const { points: got } = pickSession(points, us, t(25, 11, 0, 0).t);
    expect(got.map((p) => p.close)).toEqual([100, 106]);
  });

  it('falls back to the only day it has, however thin', () => {
    const { points: got } = pickSession([bar(0, 9, 30, 100)], us, at(0, 20, 30));
    expect(got).toHaveLength(1);
  });

  it('returns an empty series unchanged', () => {
    expect(pickSession([], us, at(0, 20, 30))).toEqual({ points: [] });
  });
});
