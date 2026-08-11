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
  /**
   * ISO date (exchange-local) → that day's hours, overriding the weekday
   * schedule: half-days (Christmas Eve, the day after Thanksgiving), late
   * opens, one-off extensions. Every session question — is it open, which
   * phase, and how wide the intraday axis is — goes through these first, so a
   * 13:00 close narrows the chart to 09:30–13:00 on that day only.
   */
  specialHours?: Record<string, SessionHours>;
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

/**
 * The hours in force on an exchange-local date: a holiday is shut, a special
 * day (early close, late open) overrides its weekday, everything else follows
 * the schedule. `undefined` = the exchange does not trade that day.
 */
export function hoursFor(
  cal: TradingCalendar,
  isoDate: string,
  weekday: Weekday,
): SessionHours | undefined {
  if (cal.holidays.includes(isoDate)) return undefined;
  return cal.specialHours?.[isoDate] ?? scheduleFor(cal, isoDate).hours[weekday];
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
  const today = hoursFor(cal, local.isoDate, local.weekday);

  if (today && local.minuteOfDay >= today.open && local.minuteOfDay < today.close) {
    return { open: true, minutesToChange: today.close - local.minuteOfDay };
  }

  // Closed — scan forward (up to 14 days) for the next opening bell.
  for (let d = 0; d < 14; d++) {
    const probe = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const p = toExchangeLocal(cal, probe);
    const h = hoursFor(cal, p.isoDate, p.weekday);
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
  const today = hoursFor(cal, local.isoDate, local.weekday);
  const m = local.minuteOfDay;

  if (today) {
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

/**
 * Absolute bounds of the extended trading session (pre-open → post-close,
 * falling back to the regular open/close) for the exchange-local day that
 * contains `at`. Returns null when the exchange is shut that day.
 *
 * `regular` is the bell-to-bell session, and it is what intraday charts are
 * drawn against while trading (see {@link intradayBounds}).
 */
export function sessionWindow(
  cal: TradingCalendar,
  at: Date,
): { start: number; end: number; regular: { start: number; end: number } } | null {
  const local = toExchangeLocal(cal, at);
  const hours = hoursFor(cal, local.isoDate, local.weekday);
  if (!hours) return null;

  // Absolute ms of exchange-local midnight: step back from `at` by its
  // wall-clock minutes, which sidesteps DST arithmetic on the date itself.
  // `at` is floored to the minute first — minuteOfDay is whole minutes, so
  // leftover seconds would push every boundary late by up to 59s, and a bar
  // stamped exactly at the opening bell would then look like pre-market.
  const midnight = Math.floor(at.getTime() / 60_000) * 60_000 - local.minuteOfDay * 60_000;
  const startMin = hours.preOpen ?? hours.open;
  const endMin = hours.postClose ?? hours.close;
  return {
    start: midnight + startMin * 60_000,
    end: midnight + endMin * 60_000,
    // Instruments without extended trading (indexes, most of TASE) should be
    // plotted against the regular bell-to-bell session instead, or they sit
    // marooned in the middle of an axis they never trade on.
    regular: { start: midnight + hours.open * 60_000, end: midnight + hours.close * 60_000 },
  };
}

/**
 * The x-axis bounds for an intraday series. There are exactly two views:
 *
 * - **Trading.** The regular session is running *right now* and the series
 *   belongs to it, so the axis is that day's bell-to-bell window (09:30–16:00
 *   ET for the US, 09:59–17:25 for TASE, and whatever a special half-day
 *   says). A session two hours in fills two hours of the width — the Yahoo
 *   shape, and the only time a chart is allowed to stop short.
 * - **Everything else.** Pre-market, after-hours, overnight, weekends,
 *   holidays, half-days once their early bell has rung: the session on show
 *   is finished, so it fills the whole width. No reserved space for trading
 *   that is not coming.
 *
 * The test is against the clock, never the data — a market that stamps its
 * last bar early, or a handful of pre-market prints on a day that has not
 * opened, must not read as "still trading".
 */
export function intradayBounds(
  cal: TradingCalendar,
  firstT: number,
  lastT: number,
  now: number = Date.now(),
): { from: number; to: number } {
  const win = liveSession(cal, now);
  // The series has to be *this* session's; anything older (an unlisted
  // holiday, a market that has not printed yet) is a finished day.
  if (!win || lastT < win.start) return { from: firstT, to: lastT };
  return { from: win.start, to: Math.max(win.end, lastT) };
}

/** The regular session in progress at `now`, or null outside trading hours. */
function liveSession(cal: TradingCalendar, now: number): { start: number; end: number } | null {
  const win = sessionWindow(cal, new Date(now));
  if (!win) return null;
  const { start, end } = win.regular;
  return now >= start && now < end ? { start, end } : null;
}

/**
 * An intraday series and the axis it is drawn against, in one call — the
 * companion to {@link intradayBounds} for charts that plot points.
 *
 * While the session is live the axis is the trading day, so bars from outside
 * it (a pre-market print that survived into the series) are dropped rather
 * than drawn off the side of the canvas. Off hours the series is whole and
 * spans the full width.
 */
export function intradaySeries<T extends { t: number }>(
  cal: TradingCalendar,
  points: T[],
  now: number = Date.now(),
): { points: T[]; from: number; to: number } {
  const whole = () => ({
    points,
    from: points[0]?.t ?? 0,
    to: points[points.length - 1]?.t ?? 1,
  });
  if (points.length === 0) return whole();

  const win = liveSession(cal, now);
  if (!win) return whole();
  const session = points.filter((p) => p.t >= win.start);
  // Live, but nothing has printed today — an unlisted holiday, or a market
  // still waking up. What we hold is the last finished session: full width.
  if (session.length === 0) return whole();
  return { points: session, from: win.start, to: Math.max(win.end, session[session.length - 1].t) };
}
