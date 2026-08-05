import { cn } from '@/lib/utils';

// Hand-rolled SVG marks matching the design frames. Replaced by
// lightweight-charts on the stock page once real series exist (Phase 1).
// Charts are LTR islands — numbers and time axes never mirror.

interface SparklineProps {
  /** y-coordinates, lower = higher price (SVG space). */
  points: number[];
  up: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ points, up, width = 64, height = 24, className }: SparklineProps) {
  const step = width / (points.length - 1);
  const pts = points.map((y, i) => `${(i * step).toFixed(1)},${y}`).join(' ');
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

/** Normalize a close series into Sparkline y-coords (0–24 viewBox, padded). */
export function sparkFromCloses(closes: number[], height = 24): number[] {
  if (closes.length < 2) return [];
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pad = 2;
  return closes.map((c) => height - pad - ((c - min) / span) * (height - pad * 2));
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
