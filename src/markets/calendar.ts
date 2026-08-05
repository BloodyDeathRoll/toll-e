// Trading calendars — pure, data-driven, timezone-aware.
// No external deps: local exchange time is derived via Intl.DateTimeFormat.

/** Minutes since local midnight, e.g. 9*60+30 for 09:30. */
type MinuteOfDay = number;

/** 0 = Sunday … 6 = Saturday (JS Date convention). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SessionHours {
  open: MinuteOfDay;
  close: MinuteOfDay;
  /** Extended-session start (e.g. US pre-market 04:00); omit if none. */
  preOpen?: MinuteOfDay;
  /** Extended-session end (e.g. US after-hours 20:00); omit if none. */
  postClose?: MinuteOfDay;
}

export interface SessionSchedule {
  /** ISO date (exchange-local) this schedule applies from; omit for "since forever". */
  effectiveFrom?: string;
  /** Open/close per weekday; days absent = closed. */
  hours: Partial<Record<Weekday, SessionHours>>;
}

export interface TradingCalendar {
  /** IANA timezone of the exchange. */
  timezone: string;
  /**
   * Schedules ordered oldest → newest; the last one whose effectiveFrom is
   * <= the queried date wins. Lets a market change its trading week
   * (e.g. TASE Sun–Thu → Mon–Fri in Jan 2026) without losing history.
   */
  schedules: SessionSchedule[];
  /** ISO dates (exchange-local) the exchange is fully closed. Filled per-year in Phase 1. */
  holidays: string[];
}

export interface ExchangeLocalTime {
  isoDate: string; // 'YYYY-MM-DD' in exchange tz
  weekday: Weekday;
  minuteOfDay: MinuteOfDay;
}

/** Project an absolute instant into the exchange's local wall clock. */
export function toExchangeLocal(cal: TradingCalendar, now: Date): ExchangeLocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: cal.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hour = Number(get('hour')) % 24; // Intl can emit '24' at midnight

  return {
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: weekdayNames.indexOf(get('weekday')) as Weekday,
    minuteOfDay: hour * 60 + Number(get('minute')),
  };
}

/** The schedule in force on a given exchange-local ISO date. */
export function scheduleFor(cal: TradingCalendar, isoDate: string): SessionSchedule {
  let active = cal.schedules[0];
  for (const s of cal.schedules) {
    if (!s.effectiveFrom || s.effectiveFrom <= isoDate) active = s;
  }
  return active;
}

export interface MarketState {
  open: boolean;
  /** Minutes until the next open/close transition, when computable within 14 days. */
  minutesToChange?: number;
}

/**
 * Is the market open at `now`, and how long until it opens/closes?
 * Holiday-aware for "is open"; the countdown scans forward day by day.
 */
export function getMarketState(cal: TradingCalendar, now: Date): MarketState {
  const local = toExchangeLocal(cal, now);
  const today = scheduleFor(cal, local.isoDate).hours[local.weekday];
  const isHoliday = cal.holidays.includes(local.isoDate);

  if (today && !isHoliday && local.minuteOfDay >= today.open && local.minuteOfDay < today.close) {
    return { open: true, minutesToChange: today.close - local.minuteOfDay };
  }

  // Closed — scan forward (up to 14 days) for the next opening bell.
  for (let d = 0; d < 14; d++) {
    const probe = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const p = toExchangeLocal(cal, probe);
    if (cal.holidays.includes(p.isoDate)) continue;
    const h = scheduleFor(cal, p.isoDate).hours[p.weekday];
    if (!h) continue;
    if (d === 0 && local.minuteOfDay >= h.open) continue; // today's session already over
    const minutes =
      d === 0
        ? h.open - local.minuteOfDay
        : d * 24 * 60 - local.minuteOfDay + h.open;
    return { open: false, minutesToChange: minutes };
  }
  return { open: false };
}

// ---------------------------------------------------------------------------
// Session phases — Yahoo-Finance-style pre/live/post/closed indicators.
// Kept separate from getMarketState, whose open/closed countdown semantics
// (always relative to the *regular* session) existing callers rely on.

export type SessionPhase = 'pre' | 'open' | 'post' | 'closed';

export interface SessionState {
  phase: SessionPhase;
  /**
   * Minutes until this phase's next boundary: pre → regular open,
   * open → regular close, post → extended close, closed → next regular open.
   */
  minutesToChange?: number;
}

/** Which trading phase is the exchange in at `now`? Holiday-aware. */
export function getSessionState(cal: TradingCalendar, now: Date): SessionState {
  const local = toExchangeLocal(cal, now);
  const today = scheduleFor(cal, local.isoDate).hours[local.weekday];
  const isHoliday = cal.holidays.includes(local.isoDate);
  const m = local.minuteOfDay;

  if (today && !isHoliday) {
    if (today.preOpen !== undefined && m >= today.preOpen && m < today.open) {
      return { phase: 'pre', minutesToChange: today.open - m };
    }
    if (m >= today.open && m < today.close) {
      return { phase: 'open', minutesToChange: today.close - m };
    }
    if (today.postClose !== undefined && m >= today.close && m < today.postClose) {
      return { phase: 'post', minutesToChange: today.postClose - m };
    }
  }
  // Closed — reuse the regular-session countdown to the next opening bell.
  return { phase: 'closed', minutesToChange: getMarketState(cal, now).minutesToChange };
}
