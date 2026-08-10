'use client';

import { useId, useMemo } from 'react';
import { useCharts } from '@/components/use-market-data';
import type { ChartRange } from '@/src/market-data/types';
import { cn } from '@/lib/utils';

export interface HoldingWeight {
  symbol: string;
  shares: number;
}

/**
 * Full-bleed portfolio area chart from the HP design: 2px line over a
 * dot-textured fill (2px dots on a 4px grid) fading downward. The series is
 * Σ shares × close on the timestamps every loaded symbol shares — the same
 * accumulation the desktop PerformanceChart uses.
 */
export function PortfolioChart({
  rows,
  range,
  height = 77,
  className,
}: {
  rows: HoldingWeight[];
  range: ChartRange;
  height?: number;
  className?: string;
}) {
  const id = useId();
  const charts = useCharts(rows.map((r) => r.symbol), range);

  const series = useMemo(() => {
    const loaded = rows.filter((r) => charts[r.symbol]?.points.length);
    if (loaded.length === 0) return [];
    const base = charts[loaded[0].symbol].points;
    const maps = loaded.map((r) => new Map(charts[r.symbol].points.map((p) => [p.t, p.close])));
    const out: number[] = [];
    for (const p of base) {
      let total = 0;
      let complete = true;
      for (let i = 0; i < loaded.length; i++) {
        const close = maps[i].get(p.t);
        if (close === undefined) {
          complete = false;
          break;
        }
        total += loaded[i].shares * close;
      }
      if (complete) out.push(total);
    }
    return out;
  }, [rows, charts]);

  if (series.length < 2) return <div style={{ height }} className={className} aria-hidden />;

  const w = 402;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = 4;
  const step = w / (series.length - 1);
  const ys = series.map((v) => height - pad - ((v - min) / span) * (height - pad * 2));
  const line = ys.map((y, i) => `${(i * step).toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${w},${height}`;
  const up = series[series.length - 1] >= series[0];

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn('block', up ? 'text-gain' : 'text-loss', className)}
    >
      <defs>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
        {/* 2px dots on a 4px grid, punched in the page background. */}
        <pattern id={`${id}-dots`} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="none" />
          <rect x="2" y="2" width="2" height="2" rx="1" className="fill-background" />
        </pattern>
      </defs>
      <polygon points={area} fill={`url(#${id}-fade)`} />
      <polygon points={area} fill={`url(#${id}-dots)`} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
