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

// Building an Intl.DateTimeFormat is ~25µs — a hundred times the cost of using
// one. Every bar of an over-fetched intraday payload is projected through here
// (see pickSession), so the formatter is built once per exchange timezone and
// reused. The set of timezones is the market registry: two, today.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    formatters.set(timezone, fmt);
  }
  return fmt;
}

// The same memoization for callers that hold a bare IANA timezone rather than
// a whole calendar — the exchange-local *date* of a chart bar. A date-only
// formatter is a third of the cost of reassembling the one above from parts,
// and `toLocaleDateString(locale, {timeZone})` rebuilds a formatter on every
// call: 9.0 ms of pure Intl construction per 367-bar daily series.
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Exchange-local calendar date ('YYYY-MM-DD') of an instant, in `timezone`. */
export function localDateIn(timezone: string, at: Date | number): string {
  let fmt = dateFormatters.get(timezone);
  if (!fmt) {
    // en-CA renders ISO order, which is the shape every caller wants.
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatters.set(timezone, fmt);
  }
  return fmt.format(at);
}

/** Project an absolute instant into the exchange's local wall clock. */
export function toExchangeLocal(cal: TradingCalendar, now: Date): ExchangeLocalTime {
  const parts = formatterFor(cal.timezone).formatToParts(now);

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
 * day (early close, late open) overrides its weekday's *hours*, everything
 * else follows the schedule. `undefined` = the exchange does not trade at all.
 *
 * A special day cannot open a day the trading week has shut. The entry says
 * "this session runs to a different bell", not "the exchange trades today":
 * TASE's short days are derived from the Hebrew calendar (registry.ts), and an
 * eve lands on Shabbat — or, under the Mon–Fri week, on a Sunday — often
 * enough that reading them unconditionally had the app announcing an open
 * exchange on 17 shut days between 2024 and 2032. A genuine one-off session on
 * a normally-dark day belongs in an effective-dated `schedules` entry, where
 * the trading week itself is the thing being changed.
 */
export function hoursFor(
  cal: TradingCalendar,
  isoDate: string,
  weekday: Weekday,
): SessionHours | undefined {
  if (cal.holidays.includes(isoDate)) return undefined;
  const scheduled = scheduleFor(cal, isoDate).hours[weekday];
  if (!scheduled) return undefined;
  return cal.specialHours?.[isoDate] ?? scheduled;
}

export interface MarketState {
  open: boolean;
  /** Minutes until the next open/close transition, when computable within 14 days. */
  minutesToChange?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Absolute ms of exchange-local midnight for the day containing `at`. */
function localMidnight(at: number, minuteOfDay: MinuteOfDay): number {
  return Math.floor(at / 60_000) * 60_000 - minuteOfDay * 60_000;
}

/**
 * The absolute instant at which the exchange-local day containing `at` reads
 * `minute` on its wall clock. Midnight + minute is only right when no offset
 * change sits between the two, so the guess is projected back and corrected —
 * an offset change is at most an hour, and one pass closes it.
 */
function instantAtLocalMinute(cal: TradingCalendar, at: Date, minute: MinuteOfDay): number {
  const local = toExchangeLocal(cal, at);
  let guess = localMidnight(at.getTime(), local.minuteOfDay) + minute * 60_000;
  for (let i = 0; i < 2; i++) {
    const seen = toExchangeLocal(cal, new Date(guess));
    if (seen.isoDate === local.isoDate && seen.minuteOfDay === minute) break;
    // Whole days out means the correction crossed midnight; minutes out is the
    // offset change itself.
    const dayShift = seen.isoDate < local.isoDate ? 1 : seen.isoDate > local.isoDate ? -1 : 0;
    guess += dayShift * DAY_MS + (minute - seen.minuteOfDay) * 60_000;
  }
  return guess;
}

/**
 * Is the market open at `now`, and how long until it opens/closes?
 * Holiday-aware for "is open"; the countdown scans forward day by day.
 *
 * The scan walks exchange-local *dates* and measures the gap in absolute time.
 * Stepping the instant by 24h instead drops or repeats a local day across a
 * DST boundary — Israel switches on a Friday morning, so a Thursday-evening
 * probe skipped a whole trading session — and d×24×60 minute arithmetic misses
 * the offset change even when it lands on the right day.
 */
export function getMarketState(cal: TradingCalendar, now: Date): MarketState {
  const local = toExchangeLocal(cal, now);
  const today = hoursFor(cal, local.isoDate, local.weekday);

  if (today && local.minuteOfDay >= today.open && local.minuteOfDay < today.close) {
    return { open: true, minutesToChange: today.close - local.minuteOfDay };
  }

  // Closed — scan forward (up to 14 days) for the next opening bell.
  const t = now.getTime();
  const midnight = localMidnight(t, local.minuteOfDay);
  for (let d = 0; d < 14; d++) {
    // Anchored at local noon: an offset change is at most an hour, so noon
    // never slides onto the neighbouring date and every day is probed once.
    const probe = new Date(midnight + d * DAY_MS + 12 * 60 * 60_000);
    const p = toExchangeLocal(cal, probe);
    const h = hoursFor(cal, p.isoDate, p.weekday);
    if (!h) continue;
    const openAt = instantAtLocalMinute(cal, probe, h.open);
    if (openAt <= t) continue; // that bell has already rung
    return { open: false, minutesToChange: Math.round((openAt - t) / 60_000) };
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
 * The two views again, and `live` says which one you got:
 *
 * - **`live: true`** — the regular session is running. The axis is the
 *   bell-to-bell day and the points are today's only, however few. At the
 *   opening bell that is *zero* bars, and it is still view one: the caller
 *   anchors the line at the previous close and carries it to the live price,
 *   which is the sliver-at-the-left-edge shape Yahoo shows a minute in.
 *   Bars from outside the session (a pre-market print that survived into the
 *   series) are dropped rather than drawn off the side of the canvas.
 * - **`live: false`** — the session on show is finished; it spans the width.
 *
 * `lastTradeAt` is the provider's last-trade stamp (a quote's `asOf`, chart
 * metadata's `regularMarketTime`). It is what separates "the bell just rang
 * and no bar has printed" from "this exchange is shut today and our calendar
 * does not know it" — the two look identical in the bars alone. Without it,
 * an empty session falls back to the finished day rather than blanking.
 */
export function intradaySeries<T extends { t: number }>(
  cal: TradingCalendar,
  points: T[],
  now: number = Date.now(),
  lastTradeAt?: number,
): { points: T[]; from: number; to: number; live: boolean } {
  const whole = () => ({
    points,
    from: points[0]?.t ?? 0,
    to: points[points.length - 1]?.t ?? 1,
    live: false,
  });

  const win = liveSession(cal, now);
  if (!win) return whole();

  const session = points.filter((p) => p.t >= win.start);
  if (session.length > 0) {
    return {
      points: session,
      from: win.start,
      to: Math.max(win.end, session[session.length - 1].t),
      live: true,
    };
  }
  // Trading, but no bar has printed yet: the 5m feed is up to five minutes
  // behind the bell. The tape settles it — a trade stamped inside today's
  // session means view one with an empty series, and the caller draws the
  // previous close and the live price. No such trade means the exchange is
  // shut (an unlisted holiday), so the last finished session stays up.
  if (lastTradeAt !== undefined && lastTradeAt >= win.start) {
    return { points: [], from: win.start, to: win.end, live: true };
  }
  return whole();
}

/** A point on an intraday line: epoch ms and a value (a close, a total). */
export interface SeriesPoint {
  t: number;
  v: number;
}

/**
 * The polyline an intraday chart actually draws, for both views.
 *
 * View two is the bars as they are. View one is the bars plus the two things
 * that make a session-in-progress legible before it has any width:
 *
 * - a first point on the **previous close** at the opening bell, so the line
 *   leaves the dashed rule instead of floating unattached, and
 * - a last point at the **live quote**, which runs minutes ahead of a 5m bar
 *   feed and is all there is to draw in the first five minutes of the day.
 *
 * With both, the moment the bell rings the chart is a stroke at the left edge
 * against a full-session axis — what Yahoo shows, and what an empty
 * `points` array could never produce on its own.
 */
export function sessionLine(
  cal: TradingCalendar,
  points: SeriesPoint[],
  opts: {
    previousClose?: number;
    price?: number;
    priceAt?: number;
    /**
     * The market's newest last-trade stamp, when the caller has one (see
     * `lastTradeByMarket`). Liveness belongs to the exchange, so a row whose
     * own quote lags the bell still draws the session in progress.
     */
    lastTradeAt?: number;
    now?: number;
  } = {},
): { points: SeriesPoint[]; from: number; to: number; live: boolean } {
  const now = opts.now ?? Date.now();
  const win = intradaySeries(cal, points, now, opts.lastTradeAt ?? opts.priceAt);
  if (!win.live) return win;

  const line = [...win.points];
  if (opts.previousClose !== undefined) line.unshift({ t: win.from, v: opts.previousClose });
  if (opts.price !== undefined) {
    const lastT = line.length ? line[line.length - 1].t : win.from;
    const t = Math.min(win.to, Math.max(opts.priceAt ?? now, lastT));
    // A bar stamped later than the quote is the fresher datum; leave it be.
    if (t > lastT || line.length === 0) line.push({ t, v: opts.price });
  }
  return { ...win, points: line };
}
