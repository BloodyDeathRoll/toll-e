import { useId } from 'react';
import { sessionLine, type TradingCalendar } from '@/src/markets/calendar';
import type { ChartPoint } from '@/src/market-data/types';
import { cn } from '@/lib/utils';

// Hand-rolled SVG marks matching the design frames.
// Charts are LTR islands — numbers and time axes never mirror.

interface SparklineProps {
  /** y-coordinates, lower = higher price (SVG space). */
  points: number[];
  up: boolean;
  /**
   * Baseline y-coordinate (usually the period-open price). When set, the line
   * renders two-tone per the design: gain-colored above, loss-colored below.
   */
  baseline?: number;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ points, up, baseline, width = 64, height = 24, className }: SparklineProps) {
  const id = useId();
  const step = width / (points.length - 1);
  const pts = points.map((y, i) => `${(i * step).toFixed(1)},${y}`).join(' ');

  if (baseline === undefined) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        className={cn('shrink-0', up ? 'text-gain' : 'text-loss', className)}
      >
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <defs>
        <clipPath id={`${id}-above`}>
          <rect x="0" y={-height} width={width} height={baseline + height} />
        </clipPath>
        <clipPath id={`${id}-below`}>
          <rect x="0" y={baseline} width={width} height={height * 2} />
        </clipPath>
      </defs>
      <polyline
        points={pts}
        fill="none"
        strokeWidth="1.5"
        className="stroke-gain"
        clipPath={`url(#${id}-above)`}
      />
      <polyline
        points={pts}
        fill="none"
        strokeWidth="1.5"
        className="stroke-loss"
        clipPath={`url(#${id}-below)`}
      />
    </svg>
  );
}

/** Normalize a close series into Sparkline y-coords (0–24 viewBox, padded). */
export function sparkFromCloses(closes: number[], height = 24): number[] {
  if (closes.length < 2) return [];
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pad = 2;
  return closes.map((c) => height - pad - ((c - min) / span) * (height - pad * 2));
}

/**
 * Two-tone sparkline inputs from a close series: y-points plus the baseline
 * (first close) y-coordinate, both in the same padded viewBox space.
 */
export function twoToneSpark(closes: number[], height = 24): { points: number[]; baseline: number } {
  const points = sparkFromCloses(closes, height);
  return { points, baseline: points[0] ?? height / 2 };
}

/**
 * Intraday sparkline, in the two views {@link sessionLine} draws:
 *
 * - **Trading.** The axis is today's bell-to-bell session and the line covers
 *   only the part of it that has traded — from the previous close at the
 *   opening bell to a dot on the live price. Two minutes in, that is a stroke
 *   at the left edge with the day's width reserved beside it.
 * - **Closed.** The last finished session, spanning the full width.
 *
 * The dashed rule is the previous close either way, and the line is two-tone
 * around it: green above yesterday's close, red below.
 */
export function SessionSparkline({
  points,
  previousClose,
  calendar,
  price,
  priceAt,
  width = 91,
  height = 36,
  className,
}: {
  points: ChartPoint[];
  previousClose?: number;
  calendar: TradingCalendar;
  /** Live quote price — the line's last point while the session is running. */
  price?: number;
  /** Epoch ms of that quote's last trade (`Quote.asOf`). */
  priceAt?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  const { points: shown, from, to, live } = sessionLine(
    calendar,
    points.map((p) => ({ t: p.t, v: p.close })),
    { previousClose, price, priceAt },
  );
  if (shown.length === 0) return <span style={{ width, height }} className={className} aria-hidden />;

  const last = shown[shown.length - 1];
  const span = to - from || 1;
  const x = (t: number) => ((t - from) / span) * width;

  const closes = shown.map((p) => p.v);
  const lo = Math.min(...closes, previousClose ?? Infinity);
  const hi = Math.max(...closes, previousClose ?? -Infinity);
  // Barely any headroom: a mark this small has amplitude to spare, and a
  // generous pad is what made the day's movement read as a flat line.
  const pad = (hi - lo) * 0.04 || Math.max(Math.abs(hi) * 0.001, 0.01);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const y = (v: number) => (1 - (v - yMin) / (yMax - yMin || 1)) * height;

  const line = shown.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const base = previousClose === undefined ? undefined : y(previousClose);
  const up = previousClose === undefined ? last.v >= shown[0].v : last.v >= previousClose;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className={cn('shrink-0 overflow-visible', className)}
    >
      {base !== undefined && (
        <>
          <defs>
            <clipPath id={`${id}-above`}>
              <rect x="0" y={-height} width={width} height={base + height} />
            </clipPath>
            <clipPath id={`${id}-below`}>
              <rect x="0" y={base} width={width} height={height * 2} />
            </clipPath>
          </defs>
          <line
            x1="0"
            y1={base}
            x2={width}
            y2={base}
            className="stroke-faint"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </>
      )}
      {base === undefined ? (
        <polyline
          points={line}
          fill="none"
          strokeWidth="1.5"
          stroke="currentColor"
          className={up ? 'text-gain' : 'text-loss'}
        />
      ) : (
        <>
          <polyline points={line} fill="none" strokeWidth="1.5" className="stroke-gain" clipPath={`url(#${id}-above)`} />
          <polyline points={line} fill="none" strokeWidth="1.5" className="stroke-loss" clipPath={`url(#${id}-below)`} />
        </>
      )}
      {/* Live mark on the last price. Minutes into a session it is most of
          what there is to see, and a one-point line draws nothing at all. */}
      {live && (
        <circle
          cx={x(last.t).toFixed(1)}
          cy={y(last.v).toFixed(1)}
          r="2.5"
          className={up ? 'fill-gain' : 'fill-loss'}
        />
      )}
    </svg>
  );
}

interface LineChartProps {
  /** y-coordinates in `viewH` space, lower = higher. */
  points: number[];
  up: boolean;
  height: number;
  viewH?: number;
  /** Horizontal gridline y-positions in `viewH` space. */
  gridlines?: number[];
  className?: string;
}

/** Full-width fluid line chart (stretches horizontally, fixed height). */
export function LineChart({ points, up, height, viewH = 150, gridlines = [], className }: LineChartProps) {
  const w = 1000;
  const step = w / (points.length - 1);
  const pts = points.map((y, i) => `${(i * step).toFixed(1)},${y}`).join(' ');
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${viewH}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn('block', up ? 'text-gain' : 'text-loss', className)}
    >
      {gridlines.map((y) => (
        <line key={y} x1="0" y1={y} x2={w} y2={y} className="stroke-border" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
