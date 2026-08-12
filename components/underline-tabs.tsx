'use client';

import { cn } from '@/lib/utils';

/** Design tab strip: 15px medium labels, 2px underline (yellow when active). */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  grow = false,
  className,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  label: (t: T) => string;
  /** Stretch tabs to fill the row (Taxes) instead of hugging content (Markets). */
  grow?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex', className)}>
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            'border-b-2 pb-[5px] text-[15px] font-medium',
            // A stretched strip shares the row out evenly regardless, so its
            // padding only decides the width below which the row stops
            // fitting — four tabs at px-3 overflowed a 360px phone. A
            // hug-content strip (Markets) is spaced by that padding, so it
            // keeps it.
            grow ? 'flex-1 px-2' : 'px-3',
            t === value
              ? 'border-primary text-primary'
              : 'border-border text-muted-foreground',
          )}
        >
          {label(t)}
        </button>
      ))}
    </div>
  );
}
