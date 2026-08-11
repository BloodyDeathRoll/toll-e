import { Moon } from 'lucide-react';
import { fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Quote } from '@/src/market-data/types';

/**
 * Change badge from the design system. `filled` (default): solid green/red
 * pill with white text. `soft`: tinted background with colored text
 * (watchlist rows).
 */
export function ChangePill({
  pct,
  numberLocale,
  variant = 'filled',
  className,
}: {
  pct: number;
  numberLocale: string;
  variant?: 'filled' | 'soft';
  className?: string;
}) {
  return (
    <span
      dir="ltr"
      className={cn(
        'rounded-[4px] px-1 py-0.5 text-sm font-semibold tabular-nums',
        variant === 'filled'
          ? pct >= 0
            ? 'bg-gain-surface text-white'
            : 'bg-loss-surface text-white'
          : pct >= 0
            ? 'bg-gain/10 text-gain'
            : 'bg-loss/10 text-loss',
        className,
      )}
    >
      {fmtPct(pct, numberLocale)}
    </span>
  );
}

/** Extended-session change: crescent + small colored percent. */
export function AfterHours({
  quote,
  numberLocale,
  className,
}: {
  quote?: Quote;
  numberLocale: string;
  className?: string;
}) {
  const ext = quote?.extended;
  if (!ext) return null;
  return (
    <span className={cn('flex items-center gap-1', className)}>
      <Moon className="size-4 text-moon" fill="currentColor" aria-hidden />
      <span
        dir="ltr"
        className={cn('text-[14px] tabular-nums', ext.changePct >= 0 ? 'text-gain' : 'text-loss')}
      >
        {fmtPct(ext.changePct, numberLocale)}
      </span>
    </span>
  );
}
