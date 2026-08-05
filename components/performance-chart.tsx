'use client';

import { useEffect, useRef } from 'react';
import {
  ColorType,
  LineSeries,
  PriceScaleMode,
  createChart,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useCharts } from '@/components/use-market-data';
import type { ChartRange } from '@/src/market-data/types';

export const MAX_OVERLAYS = 5;

export interface OverlayRow {
  symbol: string;
  shares: number;
}

/**
 * The accumulated portfolio line with optional per-stock overlays
 * (categorical series colors — fixed order, first MAX_OVERLAYS rows).
 * All series render on a percentage scale from period start, so different
 * price magnitudes overlay meaningfully. LTR island.
 */
export function PerformanceChart({
  rows,
  hidden,
  range,
  height,
  showPortfolio = true,
}: {
  rows: OverlayRow[];
  /** Symbols whose overlay is unchecked. */
  hidden: Set<string>;
  range: ChartRange;
  height: number;
  /** The accumulated portfolio line — toggled by the Holdings header checkbox. */
  showPortfolio?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const symbols = rows.map((r) => r.symbol);
  const charts = useCharts(symbols, range);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const loaded = rows.filter((r) => charts[r.symbol]?.points.length);
    if (loaded.length === 0) return;

    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();

    // Portfolio value series: Σ shares × close over the timestamps every
    // loaded symbol has (daily bars align within a market).
    const base = charts[loaded[0].symbol].points;
    const maps = loaded.map((r) => new Map(charts[r.symbol].points.map((p) => [p.t, p.close])));
    const portfolio: Array<{ time: UTCTimestamp; value: number }> = [];
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
      if (complete) portfolio.push({ time: (p.t / 1000) as UTCTimestamp, value: total });
    }
    if (portfolio.length < 2) return;

    const up = portfolio[portfolio.length - 1].value >= portfolio[0].value;
    const border = v('--border');

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: v('--muted-foreground'),
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border, mode: PriceScaleMode.Percentage },
      timeScale: {
        borderColor: border,
        timeVisible: range === '1d' || range === '5d',
        secondsVisible: false,
      },
      crosshair: {
        horzLine: { labelBackgroundColor: v(up ? '--gain' : '--loss') },
        vertLine: { labelBackgroundColor: v(up ? '--gain' : '--loss') },
      },
    });

    // Accumulated portfolio line.
    if (showPortfolio) {
      chart
        .addSeries(LineSeries, {
          color: v(up ? '--gain' : '--loss'),
          lineWidth: 2,
          priceLineVisible: false,
        })
        .setData(portfolio);
    }

    // Thin per-stock overlays — color follows the row, not the checked set.
    rows.slice(0, MAX_OVERLAYS).forEach((r, i) => {
      if (hidden.has(r.symbol)) return;
      const series = charts[r.symbol];
      if (!series?.points.length) return;
      chart
        .addSeries(LineSeries, {
          color: v(`--series-${i + 1}`),
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        .setData(series.points.map((p) => ({ time: (p.t / 1000) as UTCTimestamp, value: p.close })));
    });

    const raf = requestAnimationFrame(() => chart.timeScale().fitContent());
    return () => {
      cancelAnimationFrame(raf);
      chart.remove();
    };
  }, [rows, hidden, charts, range, height, showPortfolio]);

  return <div ref={ref} dir="ltr" style={{ height }} />;
}
