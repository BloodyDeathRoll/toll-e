import { useId } from 'react';
import { sessionWindow, type TradingCalendar } from '@/src/markets/calendar';
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
  /**
   * Fraction of the width the data occupies (0–1). Defaults to 1; a live
   * trading day passes elapsed/total so the mark grows through the session.
   */
  fill?: number;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ points, up, baseline, fill = 1, width = 64, height = 24, className }: SparklineProps) {
  const id = useId();
  // `fill` < 1 leaves the rest of the session blank instead of stretching a
  // part-traded day across the whole mark (see twoToneSpark).
  const drawnW = width * Math.min(Math.max(fill, 0.02), 1);
  const step = drawnW / (points.length - 1);
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
 * How much of the exchange's extended session has traded, 0–1. Intraday
 * marks draw across only this much of their width, so at the opening bell
 * you see a stub at the left rather than a full-width squiggle.
 */
export function sessionFill(
  points: Array<{ t: number }> | undefined,
  calendar: TradingCalendar,
): number {
  if (!points?.length) return 1;
  const last = points[points.length - 1].t;
  const win = sessionWindow(calendar, new Date(last));
  if (!win) return 1;
  const span = win.end - win.start;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (last - win.start) / span));
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
