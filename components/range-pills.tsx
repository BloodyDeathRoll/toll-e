'use client';

import { cn } from '@/lib/utils';
import type { ChartRange } from '@/src/market-data/types';

export const rangeOptions = ['1D', '1W', '1M', '1Y', 'YTD', 'All'] as const;
export type RangeOption = (typeof rangeOptions)[number];

export const rangeToChart: Record<RangeOption, ChartRange> = {
  '1D': '1d',
  '1W': '5d',
  '1M': '1mo',
  '1Y': '1y',
  YTD: 'ytd',
  All: 'max',
};

/** Design range selector: equal-width pills, active yellow, inactive 40%. */
export function RangePills({
  value,
  onChange,
  className,
}: {
  value: RangeOption;
  onChange: (r: RangeOption) => void;
  className?: string;
}) {
  return (
    <div dir="ltr" className={cn('flex gap-3 px-6', className)}>
      {rangeOptions.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            'flex-1 rounded-[20px] px-3 py-2.5 text-sm font-bold',
            r === value
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground/40',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
