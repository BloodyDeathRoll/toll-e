import type { ChartPoint } from './types';

/**
 * Average True Range over the last `period` bars of a daily series — the
 * plain mean of true ranges, where a bar's true range is the largest of
 * high−low, |high−prevClose|, |low−prevClose| (the prev-close arms are what
 * make an overnight gap count as range).
 *
 * Undefined when the series cannot supply `period` complete ranges — a
 * thin listing gets no number rather than a wrong one. Bars missing
 * high/low (degraded close-only data) are skipped the same way.
 */
export function averageTrueRange(points: ChartPoint[], period = 14): number | undefined {
  const ranges: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const bar = points[i];
    const prevClose = points[i - 1].close;
    if (bar.high === undefined || bar.low === undefined) continue;
    ranges.push(
      Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose)),
    );
  }
  if (ranges.length < period) return undefined;
  return ranges.slice(-period).reduce((s, v) => s + v, 0) / period;
}
