'use client';

import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';
import type { ChartPoint } from '@/src/market-data/types';

// TradingView lightweight-charts v5 area chart (toll-e-plan.md §4).
// An LTR island: time axes and prices never mirror under RTL.

export function PriceChart({
  points,
  up,
  height,
  intraday,
}: {
  points: ChartPoint[];
  up: boolean;
  height: number;
  intraday: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || points.length === 0) return;

    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue(up ? '--gain' : '--loss').trim();
    const border = css.getPropertyValue('--border').trim();
    const text = css.getPropertyValue('--muted-foreground').trim();

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: border },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: intraday, secondsVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: line }, vertLine: { labelBackgroundColor: line } },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: line,
      topColor: `${line}44`,
      bottomColor: `${line}00`,
      lineWidth: 2,
      priceLineVisible: false,
    });
    series.setData(points.map((p) => ({ time: (p.t / 1000) as UTCTimestamp, value: p.close })));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [points, up, height, intraday]);

  return <div ref={ref} dir="ltr" style={{ height }} />;
}
