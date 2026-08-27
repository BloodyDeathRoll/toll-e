import { describe, expect, it } from 'vitest';
import { getSessionState, sessionWindow } from './calendar';
import { calendarForSymbol, isFuturesSymbol } from './registry';

const cme = calendarForSymbol('NQ=F');
const nyse = calendarForSymbol('AAPL');

describe('isFuturesSymbol', () => {
  it('reads the provider’s own convention', () => {
    expect(isFuturesSymbol('NQ=F')).toBe(true);
    expect(isFuturesSymbol('ES=F')).toBe(true);
    expect(isFuturesSymbol('^VIX')).toBe(false);
    expect(isFuturesSymbol('TA35.TA')).toBe(false);
  });
});

describe('calendarForSymbol', () => {
  it('gives a future its own hours, not its market’s', () => {
    expect(cme).not.toBe(nyse);
    // Same clock, different bells — both settle in New York.
    expect(cme.timezone).toBe('America/New_York');
  });

  it('an index keeps the cash market’s calendar', () => {
    expect(calendarForSymbol('^VIX')).toBe(nyse);
  });

  it('inherits the exchange’s full closures', () => {
    expect(cme.holidays).toContain('2026-12-25');
  });
});

describe('the CME contract week', () => {
  // 2026-08-27 is a Thursday; 08-28 Friday, 08-30 Sunday.
  it('is trading in the small hours, when the NYSE is shut', () => {
    const at = new Date('2026-08-27T07:00:00Z'); // 03:00 ET
    expect(getSessionState(cme, at).phase).toBe('open');
    expect(getSessionState(nyse, at).phase).toBe('closed');
  });

  it('reopens Sunday evening', () => {
    expect(getSessionState(cme, new Date('2026-08-30T21:00:00Z')).phase).toBe('closed'); // 17:00 ET
    expect(getSessionState(cme, new Date('2026-08-30T23:00:00Z')).phase).toBe('open'); // 19:00 ET
  });

  it('is shut for the weekend once Friday settles', () => {
    expect(getSessionState(cme, new Date('2026-08-28T20:00:00Z')).phase).toBe('open'); // 16:00 ET Fri
    expect(getSessionState(cme, new Date('2026-08-28T22:00:00Z')).phase).toBe('closed'); // 18:00 ET Fri
  });

  it('draws the whole ET day, which is the axis Yahoo reports', () => {
    // Pinned to the provider's own currentTradingPeriod.regular for this date:
    // 04:00Z → 03:59Z, i.e. 00:00–23:59 ET. The chart starting at "12 AM" is
    // the future's session, not a stray bar.
    const w = sessionWindow(cme, new Date('2026-08-27T13:00:00Z'));
    expect(w).not.toBeNull();
    expect(new Date(w!.start).toISOString()).toBe('2026-08-27T04:00:00.000Z');
    expect(new Date(w!.end).toISOString()).toBe('2026-08-28T03:59:00.000Z');
  });

  it('closes with the exchange on a full holiday', () => {
    expect(getSessionState(cme, new Date('2026-12-25T17:00:00Z')).phase).toBe('closed');
  });
});
