import { describe, expect, it } from 'vitest';
import { taseCalendarDays } from './hebrew-calendar';
import { getMarket } from './registry';
import { getSessionState, hoursFor, toExchangeLocal } from './calendar';

const il = getMarket('IL').calendar;
const days = taseCalendarDays(2026, 2027);

describe('taseCalendarDays', () => {
  it('lands the festivals on their known Gregorian dates', () => {
    // Cross-checked against the Hebrew dates they are fixed to.
    for (const iso of [
      '2026-03-03', // Purim, 14 Adar 5786
      '2026-04-02', // Pesach I, 15 Nisan
      '2026-04-08', // Pesach VII, 21 Nisan
      '2026-05-22', // Shavuot, 6 Sivan
      '2026-07-23', // Tisha B'Av, 9 Av
      '2026-09-12', // Rosh Hashanah I, 1 Tishri 5787
      '2026-09-21', // Yom Kippur, 10 Tishri
      '2026-09-26', // Sukkot I, 15 Tishri
      '2026-10-03', // Shemini Atzeret, 22 Tishri
    ]) {
      expect(days.holidays).toContain(iso);
    }
  });

  it('finds Purim in Adar II in a leap year', () => {
    // 5787 is a leap year: Purim is 14 Adar II, in March 2027 — not February.
    expect(days.holidays).toContain('2027-03-23');
    expect(days.holidays.filter((d) => d.startsWith('2027-02'))).toEqual([]);
  });

  it('closes Yom HaZikaron and Yom HaAtzmaut together', () => {
    // 5 Iyar 5786 is a Wednesday, so neither is postponed.
    expect(days.holidays).toContain('2026-04-21');
    expect(days.holidays).toContain('2026-04-22');
  });

  it('shortens the eves rather than closing them', () => {
    for (const iso of [
      '2026-04-01', // Erev Pesach
      '2026-05-21', // Erev Shavuot
      '2026-09-20', // Erev Yom Kippur
      '2026-10-02', // Hoshana Rabba
    ]) {
      expect(days.shortDays).toContain(iso);
      expect(days.holidays).not.toContain(iso);
    }
  });

  it('never lists a day as both shut and short', () => {
    expect(days.shortDays.filter((d) => days.holidays.includes(d))).toEqual([]);
  });

  it('stays inside the years asked for', () => {
    for (const iso of [...days.holidays, ...days.shortDays]) {
      expect(Number(iso.slice(0, 4))).toBeGreaterThanOrEqual(2026);
      expect(Number(iso.slice(0, 4))).toBeLessThanOrEqual(2027);
    }
  });
});

describe('the IL calendar reads them', () => {
  const weekdayOf = (iso: string) => toExchangeLocal(il, new Date(`${iso}T10:00:00Z`)).weekday;

  it('is shut on Yom Kippur, a Monday that would otherwise trade', () => {
    expect(weekdayOf('2026-09-21')).toBe(1);
    expect(hoursFor(il, '2026-09-21', 1)).toBeUndefined();
    // 13:00 Israel time — mid-session on any ordinary Monday.
    expect(getSessionState(il, new Date('2026-09-21T10:00:00Z')).phase).toBe('closed');
  });

  it('rings the early bell on Erev Yom Kippur', () => {
    // 2026-09-20 is a Sunday: outside the Mon–Fri week either way.
    // Erev Pesach 2026-04-01 is a Wednesday, and that is the one that shows.
    expect(weekdayOf('2026-04-01')).toBe(3);
    expect(hoursFor(il, '2026-04-01', 3)?.close).toBe(13 * 60 + 45);
    // 14:00 Israel time: past the short bell, still inside a normal session.
    expect(getSessionState(il, new Date('2026-04-01T11:00:00Z')).phase).toBe('closed');
    expect(getSessionState(il, new Date('2026-04-01T09:00:00Z')).phase).toBe('open');
  });

  it('keeps ordinary weekdays full-length', () => {
    expect(hoursFor(il, '2026-04-15', 3)?.close).toBe(17 * 60 + 25);
  });
});
