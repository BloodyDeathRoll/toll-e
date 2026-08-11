'use client';

import { useId, useMemo } from 'react';
import { useCharts } from '@/components/use-market-data';
import { intradaySeries } from '@/src/markets/calendar';
import { getMarket } from '@/src/markets/registry';
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
  marketId,
  previousClose,
  height = 77,
  className,
}: {
  rows: HoldingWeight[];
  range: ChartRange;
  /** Supplies the trading calendar that bounds an intraday x-axis. */
  marketId?: string;
  /** Yesterday's portfolio value — drawn as the dashed reference line. */
  previousClose?: number;
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
    const out: Array<{ t: number; v: number }> = [];
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
      if (complete) out.push({ t: p.t, v: total });
    }
    return out;
  }, [rows, charts]);

  // Intraday: while the market is trading the axis is the session, so a day
  // in progress fills only the part it has traded (the Yahoo shape) and
  // anything outside those hours is left off. Other ranges — and off hours —
  // keep the series' own extent, full width.
  const window =
    range === '1d' && marketId
      ? intradaySeries(getMarket(marketId).calendar, series)
      : { points: series, from: series[0]?.t ?? 0, to: series[series.length - 1]?.t ?? 1 };
  const shown = window.points;

  if (shown.length < 2) return <div style={{ height }} className={className} aria-hidden />;

  const w = 402;
  const values = shown.map((p) => p.v);
  // The dashed previous close stays in frame, so it joins the y-domain.
  const base = range === '1d' ? previousClose : undefined;
  const min = Math.min(...values, base ?? Infinity);
  const max = Math.max(...values, base ?? -Infinity);
  const span = max - min || 1;
  const pad = 4;

  const tSpan = window.to - window.from || 1;
  const x = (t: number) => ((t - window.from) / tSpan) * w;

  const yOf = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const ys = values.map(yOf);
  const line = shown.map((p, i) => `${x(p.t).toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area = `${x(shown[0].t).toFixed(1)},${height} ${line} ${x(shown[shown.length - 1].t).toFixed(1)},${height}`;
  const up = base !== undefined
    ? values[values.length - 1] >= base
    : values[values.length - 1] >= values[0];

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
      {base !== undefined && (
        <line
          x1="0"
          y1={yOf(base)}
          x2={w}
          y2={yOf(base)}
          className="stroke-faint"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
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
