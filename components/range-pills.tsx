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
            // px-2, not px-3: `flex-1` shares the row out evenly whatever the
            // padding is, so on a 390px design frame these render identically
            // — but padding sets each pill's *minimum* width, and six pills at
            // px-3 cannot fit a 360px phone. The row then widened the whole
            // document and the browser asked the reader to pinch out.
            'flex-1 rounded-[20px] px-2 py-2.5 text-sm font-bold',
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
