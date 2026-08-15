'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The app's one dropdown. Language, Market and the Performance year are all
 * axes that grow by data rather than by design — a third language, a fourth
 * market, another tax year is a new entry, not a new control. The trigger
 * carries the identity alone (a flag, a currency symbol) unless `showName`
 * spells it out; the menu always names every option.
 */
export function Dropdown({
  options,
  active,
  onPick,
  disabled,
  showName,
  fullWidth,
}: {
  options: Array<{ value: string; badge?: React.ReactNode; name: string }>;
  active: string;
  onPick: (value: string) => void;
  disabled?: boolean;
  /** Spell the name out on the trigger, not just in the menu. */
  showName?: boolean;
  /**
   * Span the container, name at the start and chevron at the end. For a
   * control that governs the whole page below it (the year pickers) rather
   * than sitting in a row of settings — a page-wide scope reads as a
   * page-wide control, not a chip hiding in a corner.
   */
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const current = options.find((o) => o.value === active) ?? options[0];
  // Badgeless options (years) would otherwise each reserve an empty gutter.
  const hasBadges = options.some((o) => o.badge !== undefined);

  return (
    <div ref={ref} className={cn('relative', fullWidth && 'w-full')}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={current?.name}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-[48px] items-center gap-2 rounded-lg border border-border bg-card-lighter px-4 text-[15px] text-foreground hover:bg-card-hover',
          fullWidth && 'w-full',
          disabled && 'opacity-50',
        )}
      >
        {current?.badge}
        {showName && <span>{current?.name}</span>}
        <ChevronDown
          className={cn('size-4 text-muted-foreground', fullWidth && 'ms-auto')}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className={cn(
            'absolute end-0 top-full z-50 mt-1.5 flex max-h-[280px] min-w-[180px] flex-col gap-3 overflow-y-auto rounded-[20px] bg-card-lighter p-5',
            fullWidth && 'start-0',
          )}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setOpen(false);
                if (o.value !== active) onPick(o.value);
              }}
              className={cn(
                'flex items-center gap-3 text-start text-[15px] whitespace-nowrap',
                // The chosen row goes brand-coloured whole — icon, name and
                // tick together — so the choice reads at a glance instead of
                // hanging off a tick at the far end. `--gain` rather than the
                // lime `--primary`, which is a surface colour and vanishes as
                // text on a light menu.
                o.value === active ? 'text-gain' : 'text-foreground',
              )}
            >
              {hasBadges && <span className="flex w-5 shrink-0 justify-center">{o.badge}</span>}
              <span className="flex-1">{o.name}</span>
              {o.value === active && <Check className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
