'use client';

import { fmtNum } from '@/lib/format';

export interface AllocationSlice {
  /** Industry, as the provider classifies it. */
  label: string;
  /** Share of the portfolio's market value, in percent units (80, not 0.8). */
  pct: number;
}

/**
 * Where the money is, by industry — a donut and the names beside it.
 *
 * Drawn with `r` set so the circumference is exactly 100, which lets each
 * slice's dash array be its percentage verbatim: no arc maths, no rounding
 * drift, and a ring that closes exactly when the shares sum to a hundred.
 *
 * Colours come from the `--series-*` ramp, in its fixed order. That ramp is
 * categorical and deliberately kept away from gain/loss green and red — a
 * slice is not doing well or badly, it is simply one of several.
 */
export function AllocationDonut({
  slices,
  numberLocale,
  size = 84,
}: {
  slices: AllocationSlice[];
  numberLocale: string;
  /** Pixel width of the ring. The legend is dropped below ~40px. */
  size?: number;
}) {
  if (slices.length === 0) return null;
  const R = 15.9155; // circumference = 2πr = 100
  // Each slice starts where the ones before it ended, so the offset is the
  // running sum ahead of it — derived rather than accumulated, since a mutable
  // total across a render is exactly what the lint rule is there to stop.
  const drawn = slices.map((s, i) => ({
    ...s,
    offset: -slices.slice(0, i).reduce((sum, prev) => sum + prev.pct, 0),
    color: `var(--series-${(i % 5) + 1})`,
  }));

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 42 42"
        style={{ width: size, height: size }}
        className="shrink-0"
        role="img"
        aria-label={drawn
          .map((s) => `${s.label} ${fmtNum(s.pct, numberLocale, 0)}%`)
          .join(', ')}
      >
        {/* The unfilled remainder, so a portfolio that classifies only partly
            still reads as a ring rather than an arc adrift. */}
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--well)" strokeWidth="6" />
        {drawn.map((s) => (
          <circle
            key={s.label}
            cx="21"
            cy="21"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="6"
            strokeDasharray={`${s.pct} ${100 - s.pct}`}
            strokeDashoffset={s.offset}
            transform="rotate(-90 21 21)"
          />
        ))}
      </svg>

      {size >= 40 && (
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {drawn.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
              <span dir="ltr" className="tabular-nums text-foreground">
                {fmtNum(s.pct, numberLocale, 0)}%
              </span>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
