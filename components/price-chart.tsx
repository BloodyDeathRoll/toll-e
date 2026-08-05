'use client';

import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  createChart,
  type AreaData,
  type UTCTimestamp,
  type WhitespaceData,
} from 'lightweight-charts';
import type { ChartPoint } from '@/src/market-data/types';

// TradingView lightweight-charts v5 area chart (toll-e-plan.md §4).
// An LTR island: time axes and prices never mirror under RTL.

/** Minutes to add to UTC so tick labels read as the exchange's wall clock. */
function tzOffsetMs(timezone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((asUtc - at) / 60_000) * 60_000;
}

export function PriceChart({
  points,
  up,
  height,
  intraday,
  timezone,
  fullDay = false,
}: {
  points: ChartPoint[];
  up: boolean;
  height: number;
  intraday: boolean;
  /** Exchange tz — intraday tick labels shift to its wall clock. */
  timezone?: string;
  /**
   * Yahoo-style 1D axis: the scale spans the whole exchange-local day
   * (00:00–23:59), so a live session only fills part of the chart.
   */
  fullDay?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || points.length === 0) return;

    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue(up ? '--gain' : '--loss').trim();
    const border = css.getPropertyValue('--border').trim();
    const text = css.getPropertyValue('--muted-foreground').trim();

    // Display times in exchange-local wall clock (lightweight-charts labels
    // raw UTC), constant offset taken at the last point — fine within a day.
    const offset = intraday && timezone ? tzOffsetMs(timezone, points[points.length - 1].t) : 0;
    const toTime = (t: number) => ((t + offset) / 1000) as UTCTimestamp;

    const data: Array<AreaData<UTCTimestamp> | WhitespaceData<UTCTimestamp>> = points.map((p) => ({
      time: toTime(p.t),
      value: p.close,
    }));

    let dayRange: { from: UTCTimestamp; to: UTCTimestamp } | null = null;
    if (fullDay && intraday) {
      // Whitespace points stretch the axis across the full local day; the
      // plotted line ends at the last real trade (design: half-full when live).
      const day = 24 * 60 * 60 * 1000;
      // First gap, not last — the newest bar is often partial (e.g. 13:04),
      // which would knock the whole whitespace grid off the :00/:05 marks.
      const step = points.length > 1 ? points[1].t - points[0].t : 5 * 60_000;
      const firstLocal = points[0].t + offset;
      const lastLocal = points[points.length - 1].t + offset;
      const dayStart = Math.floor(firstLocal / day) * day;
      const dayEnd = dayStart + day;
      const lead: WhitespaceData<UTCTimestamp>[] = [];
      for (let t = dayStart; t < firstLocal; t += step) {
        lead.push({ time: (t / 1000) as UTCTimestamp });
      }
      const trail: WhitespaceData<UTCTimestamp>[] = [];
      for (let t = lastLocal + step; t < dayEnd; t += step) {
        trail.push({ time: (t / 1000) as UTCTimestamp });
      }
      data.unshift(...lead);
      data.push(...trail);
      dayRange = { from: (dayStart / 1000) as UTCTimestamp, to: ((dayEnd - step) / 1000) as UTCTimestamp };
    }

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
    series.setData(data);
    // After first layout — autoSize hasn't measured yet during this effect.
    const raf = requestAnimationFrame(() => {
      if (dayRange) chart.timeScale().setVisibleRange(dayRange);
      else chart.timeScale().fitContent();
    });

    return () => {
      cancelAnimationFrame(raf);
      chart.remove();
    };
  }, [points, up, height, intraday, timezone, fullDay]);

  return <div ref={ref} dir="ltr" style={{ height }} />;
}
