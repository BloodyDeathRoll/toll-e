// TASE closures, derived from the Hebrew calendar rather than transcribed.
//
// A hand-typed list of Gregorian dates rots — one wrong entry shows "closed"
// on a real trading day, and nobody notices until a chart is wrong. The
// Hebrew dates, by contrast, never move: Yom Kippur is 10 Tishrei every year.
// So we name the holidays in their own calendar and let `Intl` (ICU's Hebrew
// calendar, exact) project them onto Gregorian dates.

/** A holiday's fixed position in the Hebrew year. */
interface HebrewDate {
  /** ICU month name. Adar is 'Adar II' in a leap year — pass both. */
  month: string | string[];
  day: number;
  label: string;
}

/**
 * Full closures. Every one of these is fixed in the Hebrew calendar, with
 * two postponements handled below (Yom HaAtzmaut, Tisha B'Av).
 */
const CLOSED: HebrewDate[] = [
  { month: ['Adar', 'Adar II'], day: 14, label: 'Purim' },
  { month: 'Nisan', day: 15, label: 'Pesach I' },
  { month: 'Nisan', day: 21, label: 'Pesach VII' },
  { month: 'Sivan', day: 6, label: 'Shavuot' },
  { month: 'Av', day: 9, label: "Tisha B'Av" },
  { month: 'Tishri', day: 1, label: 'Rosh Hashanah I' },
  { month: 'Tishri', day: 2, label: 'Rosh Hashanah II' },
  { month: 'Tishri', day: 10, label: 'Yom Kippur' },
  { month: 'Tishri', day: 15, label: 'Sukkot I' },
  { month: 'Tishri', day: 22, label: 'Shemini Atzeret' },
];

/** Eves: TASE trades, but on a shortened session (see `taseEveHours`). */
const SHORT: HebrewDate[] = [
  { month: ['Adar', 'Adar II'], day: 15, label: 'Shushan Purim' },
  { month: 'Nisan', day: 14, label: 'Erev Pesach' },
  { month: 'Nisan', day: 20, label: 'Erev Pesach VII' },
  { month: 'Sivan', day: 5, label: 'Erev Shavuot' },
  { month: 'Elul', day: 29, label: 'Erev Rosh Hashanah' },
  { month: 'Tishri', day: 9, label: 'Erev Yom Kippur' },
  { month: 'Tishri', day: 14, label: 'Erev Sukkot' },
  { month: 'Tishri', day: 21, label: 'Hoshana Rabba' },
];

const DAY = 24 * 60 * 60 * 1000;

const hebrewParts = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

interface Stamped {
  iso: string;
  month: string;
  day: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

/** Every day in [from, to] (Gregorian years), stamped with its Hebrew date. */
function hebrewDays(from: number, to: number): Stamped[] {
  const out: Stamped[] = [];
  for (let t = Date.UTC(from, 0, 1); t <= Date.UTC(to, 11, 31); t += DAY) {
    const d = new Date(t);
    const parts = hebrewParts.formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    out.push({
      iso: d.toISOString().slice(0, 10),
      month: get('month'),
      day: Number(get('day')),
      weekday: d.getUTCDay(),
    });
  }
  return out;
}

const matches = (d: Stamped, h: HebrewDate) =>
  d.day === h.day && (Array.isArray(h.month) ? h.month.includes(d.month) : d.month === h.month);

/**
 * Yom HaAtzmaut is 5 Iyar, but it is moved so the Yom HaZikaron that precedes
 * it never abuts Shabbat: Friday or Saturday ⇒ back to the Thursday before,
 * Monday ⇒ forward to Tuesday. Both days are TASE closures.
 */
function independenceDays(days: Stamped[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.month !== 'Iyar' || d.day !== 5) continue;
    const shift = d.weekday === 5 ? -1 : d.weekday === 6 ? -2 : d.weekday === 1 ? 1 : 0;
    const atzmaut = i + shift;
    // Yom HaZikaron is the day before, and moves with it.
    if (days[atzmaut - 1]) out.push(days[atzmaut - 1].iso);
    if (days[atzmaut]) out.push(days[atzmaut].iso);
  }
  return out;
}

/** Tisha B'Av is deferred to 10 Av when 9 Av falls on Shabbat. */
function tishaBAv(days: Stamped[], i: number): string {
  return days[i].weekday === 6 && days[i + 1] ? days[i + 1].iso : days[i].iso;
}

export interface TaseCalendarDays {
  /** ISO dates the exchange is shut. */
  holidays: string[];
  /** ISO dates that trade a shortened session. */
  shortDays: string[];
}

/**
 * TASE's closures and short days across a span of Gregorian years.
 *
 * Not exhaustive by construction: TASE also shuts for national election days,
 * which follow no calendar at all and have to be added by hand when called.
 * An unlisted closure is survivable — a session with no prints of its own
 * falls back to the last finished session, drawn full width.
 */
export function taseCalendarDays(fromYear: number, toYear: number): TaseCalendarDays {
  const days = hebrewDays(fromYear - 1, toYear + 1);
  const holidays = new Set(independenceDays(days));
  const shortDays = new Set<string>();

  days.forEach((d, i) => {
    for (const h of CLOSED) {
      if (!matches(d, h)) continue;
      holidays.add(h.label === "Tisha B'Av" ? tishaBAv(days, i) : d.iso);
    }
    for (const h of SHORT) if (matches(d, h)) shortDays.add(d.iso);
  });

  const inRange = (iso: string) => {
    const y = Number(iso.slice(0, 4));
    return y >= fromYear && y <= toYear;
  };
  return {
    holidays: [...holidays].filter(inRange).sort(),
    // A day cannot be both; a full closure wins.
    shortDays: [...shortDays].filter((iso) => inRange(iso) && !holidays.has(iso)).sort(),
  };
}
