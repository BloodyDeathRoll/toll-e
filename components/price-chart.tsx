'use client';

import { useId } from 'react';
import { intradaySeries } from '@/src/markets/calendar';
import { getMarket } from '@/src/markets/registry';
import type { ChartPoint } from '@/src/market-data/types';
import { cn } from '@/lib/utils';

// Hand-rolled SVG price chart. It replaced lightweight-charts, which silently
// stopped painting the series and the time axis below ~400px wide (its pane
// canvases kept a stale 300x150 buffer), leaving the chart blank on phones.
// The graph is a stretched viewBox; every label is HTML so text never skews.
// An LTR island: time axes and prices never mirror.

const PAD_Y = 8;
const AXIS_W = 54;
const TIME_H = 18;

export function PriceChart({
  points,
  up,
  height,
  intraday,
  timezone,
  fullDay = false,
  previousClose,
  marketId,
  className,
}: {
  points: ChartPoint[];
  up: boolean;
  height: number;
  intraday: boolean;
  /** Exchange tz — intraday tick labels shift to its wall clock. */
  timezone?: string;
  /**
   * Yahoo-style 1D axis: while the market is trading the scale spans the
   * whole session, so a live day only fills the part of it that has traded.
   * Off hours the finished session spans the full width.
   */
  fullDay?: boolean;
  /** Dashed reference line for an intraday day. */
  previousClose?: number;
  /** Supplies the trading calendar behind `fullDay`. */
  marketId?: string;
  className?: string;
}) {
  const id = useId();
  if (points.length === 0) return <div style={{ height }} className={className} aria-hidden />;

  const VB = 1000; // viewBox width; the graph stretches to the container
  const plotH = height - TIME_H;
  const innerH = plotH - PAD_Y * 2;

  // x-domain: the live session when asked (a day in progress ⇒ a partial
  // chart), otherwise the data's own extent.
  const series =
    fullDay && intraday && marketId
      ? intradaySeries(getMarket(marketId).calendar, points)
      : { points, from: points[0].t, to: points[points.length - 1].t };
  const shown = series.points;
  const firstT = shown[0].t;
  const lastT = shown[shown.length - 1].t;
  const xFrom = series.from;
  const xTo = series.to;
  const xSpan = xTo - xFrom || 1;
  const x = (t: number) => ((t - xFrom) / xSpan) * VB;

  // y-domain: the series, widened to keep the previous-close line on screen.
  const closes = shown.map((p) => p.close);
  const baseline = intraday ? previousClose : undefined;
  const lo = Math.min(...closes, baseline ?? Infinity);
  const hi = Math.max(...closes, baseline ?? -Infinity);
  const pad = (hi - lo) * 0.05 || Math.max(Math.abs(hi) * 0.001, 0.01);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const y = (v: number) => PAD_Y + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

  const line = shown.map((p) => `${x(p.t).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
  const area = `${x(firstT).toFixed(1)},${plotH} ${line} ${x(lastT).toFixed(1)},${plotH}`;

  const priceTicks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * (i + 0.5)) / 4);
  const timeTicks = Array.from({ length: 4 }, (_, i) => xFrom + (xSpan * (i + 0.5)) / 4);

  const label = (t: number) =>
    intraday
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(t))
      : new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          month: 'short',
          day: 'numeric',
        }).format(new Date(t));

  const decimals = yMax - yMin < 5 ? 2 : yMax < 1000 ? 1 : 0;

  return (
    <div dir="ltr" className={cn('relative', className)} style={{ height }}>
      {/* Graph — horizontally stretched, vertically 1:1 */}
      <svg
        width="100%"
        height={plotH}
        viewBox={`0 0 ${VB} ${plotH}`}
        preserveAspectRatio="none"
        aria-hidden
        className={cn('absolute inset-y-0 start-0 block', up ? 'text-gain' : 'text-loss')}
        style={{ width: `calc(100% - ${AXIS_W}px)`, height: plotH }}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {priceTicks.map((v) => (
          <line
            key={v}
            x1="0"
            y1={y(v)}
            x2={VB}
            y2={y(v)}
            className="stroke-border"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {baseline !== undefined && (
          <line
            x1="0"
            y1={y(baseline)}
            x2={VB}
            y2={y(baseline)}
            className="stroke-faint"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <polygon points={area} fill={`url(#${id}-fill)`} />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Price gutter */}
      <div className="absolute inset-y-0 end-0 text-[11px] text-muted-foreground tabular-nums" style={{ width: AXIS_W }}>
        {priceTicks.map((v) => (
          <span
            key={v}
            className="absolute end-0 -translate-y-1/2 ps-1"
            style={{ top: y(v) }}
          >
            {v.toFixed(decimals)}
          </span>
        ))}
      </div>

      {/* Time axis */}
      <div className="absolute inset-x-0 bottom-0 text-[11px] text-muted-foreground" style={{ height: TIME_H }}>
        {timeTicks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `calc(${(x(t) / VB) * 100}% - ${((x(t) / VB) * AXIS_W).toFixed(1)}px)` }}
          >
            {label(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
