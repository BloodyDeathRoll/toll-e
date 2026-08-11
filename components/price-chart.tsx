'use client';

import { useId, useRef, useState } from 'react';
import { sessionLine } from '@/src/markets/calendar';
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

/** The point under the scrubbing finger: epoch ms and the value there. */
export interface ScrubPoint {
  t: number;
  v: number;
}

export function PriceChart({
  points,
  up,
  height,
  intraday,
  timezone,
  fullDay = false,
  previousClose,
  price,
  priceAt,
  marketId,
  onScrub,
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
  /** Live quote price — the line's last point while the session is running. */
  price?: number;
  /** Epoch ms of that quote's last trade (`Quote.asOf`). */
  priceAt?: number;
  /** Supplies the trading calendar behind `fullDay`. */
  marketId?: string;
  /**
   * Scrubbing: the point under the finger, or null when it lifts. The
   * headline above the chart is what reads it out — the chart only draws the
   * crosshair.
   */
  onScrub?: (point: ScrubPoint | null) => void;
  className?: string;
}) {
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);

  const VB = 1000; // viewBox width; the graph stretches to the container
  const plotH = height - TIME_H;
  const innerH = plotH - PAD_Y * 2;

  // x-domain: the live session when asked (a day in progress ⇒ a partial
  // chart, previous close to live price), otherwise the data's own extent.
  const flat = points.map((p) => ({ t: p.t, v: p.close }));
  const series =
    fullDay && intraday && marketId
      ? sessionLine(getMarket(marketId).calendar, flat, { previousClose, price, priceAt })
      : { points: flat, from: flat[0]?.t ?? 0, to: flat[flat.length - 1]?.t ?? 1 };
  const shown = series.points;
  if (shown.length === 0) return <div style={{ height }} className={className} aria-hidden />;

  const firstT = shown[0].t;
  const lastT = shown[shown.length - 1].t;
  const xFrom = series.from;
  const xTo = series.to;
  const xSpan = xTo - xFrom || 1;
  const x = (t: number) => ((t - xFrom) / xSpan) * VB;

  // y-domain: the series, widened to keep the previous-close line on screen.
  const closes = shown.map((p) => p.v);
  const baseline = intraday ? previousClose : undefined;
  const lo = Math.min(...closes, baseline ?? Infinity);
  const hi = Math.max(...closes, baseline ?? -Infinity);
  const pad = (hi - lo) * 0.05 || Math.max(Math.abs(hi) * 0.001, 0.01);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const y = (v: number) => PAD_Y + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

  const line = shown.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
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

  // The plot is inset from the container by the price gutter, so a viewBox x
  // maps to a percentage of the whole minus its share of that gutter — the
  // same arithmetic the time-axis labels already use.
  const leftOf = (t: number) =>
    `calc(${((x(t) / VB) * 100).toFixed(3)}% - ${((x(t) / VB) * AXIS_W).toFixed(1)}px)`;

  // A range switch swaps the series under us; an index from the old one would
  // read out the wrong bar for a frame.
  const at = scrub !== null && scrub < shown.length ? shown[scrub] : null;

  /** Nearest point to where the finger is, in container coordinates. */
  const pickAt = (clientX: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const plotW = box.width - AXIS_W;
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / (plotW || 1)));
    const wanted = xFrom + frac * xSpan;
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < shown.length; i++) {
      const gap = Math.abs(shown[i].t - wanted);
      if (gap >= bestGap) continue;
      bestGap = gap;
      best = i;
    }
    setScrub(best);
    onScrub?.({ t: shown[best].t, v: shown[best].v });
  };

  const endScrub = () => {
    setScrub(null);
    onScrub?.(null);
  };

  return (
    <div dir="ltr" className={cn('relative', className)} style={{ height }} ref={boxRef}>
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

      {/* Crosshair. HTML, not SVG: the viewBox stretches horizontally, so a
          circle drawn in it would come out an ellipse. */}
      {at && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute w-px bg-foreground/40"
            style={{ left: leftOf(at.t), top: 0, height: plotH }}
          />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background',
              up ? 'bg-gain' : 'bg-loss',
            )}
            style={{ left: leftOf(at.t), top: y(at.v) }}
          />
        </>
      )}

      {/* Time axis */}
      <div className="absolute inset-x-0 bottom-0 text-[11px] text-muted-foreground" style={{ height: TIME_H }}>
        {timeTicks.map((t) => (
          <span
            key={t}
            className={cn('absolute -translate-x-1/2 whitespace-nowrap', at && 'opacity-0')}
            style={{ left: leftOf(t) }}
          >
            {label(t)}
          </span>
        ))}
        {/* The scrubbed moment replaces the ticks, so the row never doubles up. */}
        {at && (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-foreground"
            style={{ left: leftOf(at.t) }}
          >
            {label(at.t)}
          </span>
        )}
      </div>

      {/* Pointer surface over the plot. `pan-y` so a vertical swipe still
          scrolls the page and only a sideways drag scrubs. */}
      <div
        role="presentation"
        className="absolute inset-y-0 start-0"
        style={{ width: `calc(100% - ${AXIS_W}px)`, height: plotH, touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pickAt(e.clientX);
        }}
        onPointerMove={(e) => {
          // Mouse hovers scrub too; a touch has to be down.
          if (e.buttons > 0 || e.pointerType === 'mouse') pickAt(e.clientX);
        }}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerLeave={endScrub}
      />
    </div>
  );
}
