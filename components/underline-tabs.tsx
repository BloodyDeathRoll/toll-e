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
            'border-b-2 px-3 pb-[5px] text-[15px] font-medium',
            grow && 'flex-1',
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
