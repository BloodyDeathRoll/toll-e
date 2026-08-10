import { describe, expect, it } from 'vitest';
import {
  getMarketState,
  getSessionState,
  intradayBounds,
  scheduleFor,
  toExchangeLocal,
} from './calendar';
import { getMarket } from './registry';

const us = getMarket('US').calendar;
const il = getMarket('IL').calendar;

// Helpers: build UTC instants for known wall-clock times.
// 2026-08-04 is a Tuesday. Israel is UTC+3 (IDT), New York UTC-4 (EDT) in August.
const utc = (iso: string) => new Date(iso);

describe('toExchangeLocal', () => {
  it('projects into exchange timezone', () => {
    const t = toExchangeLocal(us, utc('2026-08-04T14:30:00Z')); // 10:30 EDT
    expect(t.isoDate).toBe('2026-08-04');
    expect(t.weekday).toBe(2);
    expect(t.minuteOfDay).toBe(10 * 60 + 30);
  });

  it('handles midnight without hour-24 artifacts', () => {
    const t = toExchangeLocal(us, utc('2026-08-04T04:00:00Z')); // 00:00 EDT
    expect(t.minuteOfDay).toBe(0);
  });
});

describe('US market state', () => {
  it('open mid-session Tuesday', () => {
    const s = getMarketState(us, utc('2026-08-04T14:30:00Z')); // 10:30 EDT
    expect(s.open).toBe(true);
    expect(s.minutesToChange).toBe(5 * 60 + 30); // closes 16:00
  });

  it('closed after the bell, counts down to next open', () => {
    const s = getMarketState(us, utc('2026-08-04T21:00:00Z')); // 17:00 EDT Tue
    expect(s.open).toBe(false);
    // 17:00 → 09:30 next day = 16.5h
    expect(s.minutesToChange).toBe(16.5 * 60);
  });

  it('closed on Saturday, next open Monday', () => {
    const s = getMarketState(us, utc('2026-08-08T14:30:00Z')); // Sat 10:30 EDT
    expect(s.open).toBe(false);
    expect(s.minutesToChange).toBe((24 + 23) * 60); // Mon 09:30 is 47h away
  });

  it('respects holidays', () => {
    const withHoliday = { ...us, holidays: ['2026-08-04'] };
    const s = getMarketState(withHoliday, utc('2026-08-04T14:30:00Z'));
    expect(s.open).toBe(false);
  });
});

describe('TASE schedule switch (Sun–Thu → Mon–Fri, Jan 2026)', () => {
  it('2025 schedule trades Sunday', () => {
    expect(scheduleFor(il, '2025-06-01').hours[0]).toBeDefined();
    expect(scheduleFor(il, '2025-06-01').hours[5]).toBeUndefined();
  });

  it('2026 schedule trades Friday, not Sunday', () => {
    expect(scheduleFor(il, '2026-06-01').hours[0]).toBeUndefined();
    expect(scheduleFor(il, '2026-06-01').hours[5]).toBeDefined();
  });

  it('TASE open Tuesday midday Israel time', () => {
    const s = getMarketState(il, utc('2026-08-04T09:00:00Z')); // 12:00 IDT
    expect(s.open).toBe(true);
  });

  it('TASE closed Sunday under the 2026 week', () => {
    const s = getMarketState(il, utc('2026-08-09T09:00:00Z')); // Sun 12:00 IDT
    expect(s.open).toBe(false);
  });
});

describe('session phases (pre / open / post / closed)', () => {
  it('US pre-market before the bell', () => {
    const s = getSessionState(us, utc('2026-08-04T11:00:00Z')); // 07:00 EDT Tue
    expect(s.phase).toBe('pre');
    expect(s.minutesToChange).toBe(2.5 * 60); // regular open 09:30
  });

  it('US live during regular hours', () => {
    const s = getSessionState(us, utc('2026-08-04T14:30:00Z')); // 10:30 EDT
    expect(s.phase).toBe('open');
    expect(s.minutesToChange).toBe(5.5 * 60);
  });

  it('US after-hours until 20:00 ET', () => {
    const s = getSessionState(us, utc('2026-08-04T21:00:00Z')); // 17:00 EDT
    expect(s.phase).toBe('post');
    expect(s.minutesToChange).toBe(3 * 60);
  });

  it('US fully closed overnight, counts to next regular open', () => {
    const s = getSessionState(us, utc('2026-08-05T02:00:00Z')); // 22:00 EDT Tue
    expect(s.phase).toBe('closed');
    expect(s.minutesToChange).toBe(11.5 * 60); // 22:00 → 09:30 Wed
  });

  it('holiday suppresses all phases', () => {
    const withHoliday = { ...us, holidays: ['2026-08-04'] };
    const s = getSessionState(withHoliday, utc('2026-08-04T14:30:00Z'));
    expect(s.phase).toBe('closed');
  });

  it('TASE pre-open auction phase', () => {
    const s = getSessionState(il, utc('2026-08-04T06:30:00Z')); // 09:30 IDT Tue
    expect(s.phase).toBe('pre');
    expect(s.minutesToChange).toBe(29); // continuous trading 09:59
  });

  it('TASE has no post phase after close', () => {
    const s = getSessionState(il, utc('2026-08-04T15:00:00Z')); // 18:00 IDT
    expect(s.phase).toBe('closed');
  });
});

describe('intradayBounds', () => {
  // 2026-08-04 (Tue) EDT: pre 04:00, open 09:30, close 16:00, post 20:00.
  const open = utc('2026-08-04T13:30:00Z').getTime();
  const close = utc('2026-08-04T20:00:00Z').getTime();

  const at = (iso: string) => utc(iso).getTime();

  it('reserves the rest of the regular session mid-day for a regular-hours series', () => {
    const b = intradayBounds(us, open, at('2026-08-04T15:00:00Z'), at('2026-08-04T15:00:00Z')); // 11:00 EDT
    expect(b.from).toBe(open);
    expect(b.to).toBe(close);
  });

  it('reserves the extended window when the series reaches into pre-market', () => {
    const pre = utc('2026-08-04T08:00:00Z').getTime(); // 04:00 EDT
    const b = intradayBounds(us, pre, at('2026-08-04T15:00:00Z'), at('2026-08-04T15:00:00Z'));
    expect(b.from).toBe(pre);
    expect(b.to).toBe(utc('2026-08-05T00:00:00Z').getTime()); // 20:00 EDT
  });

  it('fills the axis once the closing bell has rung', () => {
    const b = intradayBounds(us, open, close, close);
    expect(b).toEqual({ from: open, to: close });
  });

  it('fills the axis after hours, without reserving room to 20:00', () => {
    const post = at('2026-08-04T22:00:00Z'); // 18:00 EDT
    const b = intradayBounds(us, open, post, post);
    expect(b).toEqual({ from: open, to: post });
  });

  it('fills the axis when the last bar is stamped just before the bell', () => {
    const early = at('2026-08-04T19:55:00Z'); // 15:55 EDT, five minutes short
    // Still trading at 15:55 — the rest of the session is reserved…
    expect(intradayBounds(us, open, early, early).to).toBe(close);
    // …but half an hour later the day is done and the line spans the axis.
    expect(intradayBounds(us, open, early, at('2026-08-04T20:30:00Z'))).toEqual({
      from: open,
      to: early,
    });
  });

  it('falls back to the data extent when the exchange is shut that day', () => {
    const sat = utc('2026-08-08T14:00:00Z').getTime();
    const b = intradayBounds(us, sat - 3_600_000, sat, sat);
    expect(b).toEqual({ from: sat - 3_600_000, to: sat });
  });
});
