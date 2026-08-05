import { describe, expect, it } from 'vitest';
import { getMarketState, scheduleFor, toExchangeLocal } from './calendar';
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
