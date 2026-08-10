import { useId } from 'react';
import { cn } from '@/lib/utils';

// Hand-rolled SVG marks matching the design frames. Replaced by
// lightweight-charts on the stock page once real series exist (Phase 1).
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
