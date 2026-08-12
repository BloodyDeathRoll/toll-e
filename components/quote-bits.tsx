import { Moon } from 'lucide-react';
import { fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Quote } from '@/src/market-data/types';

/** What a figure reads as when there is no figure. */
export const NO_VALUE = '—';

/**
 * Change badge from the design system. `filled` (default): solid green/red
 * pill with white text. `soft`: tinted background with colored text
 * (watchlist rows).
 *
 * `pct` may be missing — a quote that has not arrived, or one the provider
 * had nothing for. That renders as a muted dash, never as a green 0.00%:
 * "we don't know" and "unchanged" are different claims, and only one of them
 * is safe to make about somebody's money.
 */
export function ChangePill({
  pct,
  numberLocale,
  variant = 'filled',
  className,
}: {
  pct?: number;
  numberLocale: string;
  variant?: 'filled' | 'soft';
  className?: string;
}) {
  const unknown = pct === undefined || Number.isNaN(pct);
  return (
    <span
      dir="ltr"
      className={cn(
        'rounded-[4px] px-1 py-0.5 text-sm font-semibold tabular-nums',
        unknown
          ? 'bg-muted/40 text-muted-foreground'
          : variant === 'filled'
            ? pct >= 0
              ? 'bg-gain-surface text-white'
              : 'bg-loss-surface text-white'
            : pct >= 0
              ? 'bg-gain/10 text-gain'
              : 'bg-loss/10 text-loss',
        className,
      )}
    >
      {unknown ? NO_VALUE : fmtPct(pct, numberLocale)}
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

/**
 * Crescent + which extended session the price beside it came from, and when.
 * Rows can get away with the bare percent above; a headline price cannot,
 * because the figure it sits under is a *closed* market's and the two only
 * make sense together once the later one says how much later it is.
 */
export function ExtendedStamp({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1', className)}>
      <Moon className="size-4 text-moon" fill="currentColor" aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}
