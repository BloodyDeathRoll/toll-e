'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// Our own calendar, replacing <input type="date">: the native popup is
// browser chrome and takes no styling beyond color-scheme/accent-color, so
// it could never wear the palette. Surfaces are the card family
// (card / card-lighter / card-hover), the selected day is the brand lime,
// today reads gain-green, weekends loss-red.

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 0=Sun … 6=Sat for the 1st of the month. */
const firstWeekday = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

export function DatePicker({
  value,
  onChange,
  max,
  min,
  label,
}: {
  /** ISO date. */
  value: string;
  onChange: (iso: string) => void;
  /** Inclusive ISO bounds; days outside are shown but not selectable. */
  max?: string;
  min?: string;
  label: string;
}) {
  const locale = useLocale();
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  // The month on display, which is not the value until a day is picked.
  const [view, setView] = useState(() => ({ y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) }));

  // Escape closes, and the page beneath must not scroll under the overlay —
  // the same contract every other overlay in the app keeps.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const today = new Date().toISOString().slice(0, 10);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(view.y, view.m - 1, 15)),
  );
  // Weekday initials from a week of known Sundays, so the names track the locale.
  const weekdays = [...Array(7)].map((_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(Date.UTC(2026, 7, 2 + i))),
  );

  const move = (months: number) => {
    const total = view.y * 12 + (view.m - 1) + months;
    setView({ y: Math.floor(total / 12), m: (total % 12) + 1 });
  };

  // Six fixed rows of seven, spilling into the neighbour months like every
  // calendar the user already knows.
  const lead = firstWeekday(view.y, view.m);
  const cells = [...Array(42)].map((_, i) => {
    const dayNum = i - lead + 1;
    const d = new Date(Date.UTC(view.y, view.m - 1, dayNum));
    return {
      iso: isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      day: d.getUTCDate(),
      inMonth: dayNum >= 1 && dayNum <= daysIn(view.y, view.m),
      weekend: i % 7 === 0 || i % 7 === 6,
    };
  });

  const nav = (aria: string, onClick: () => void, Icon: typeof ChevronLeft) => (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      className="rounded-lg bg-card-lighter p-1.5 text-foreground hover:bg-card-hover"
    >
      <Icon className="size-4 rtl:-scale-x-100" aria-hidden />
    </button>
  );

  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setView({ y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) });
          setOpen((v) => !v);
        }}
        className="flex h-[48px] w-full items-center gap-4 rounded-[20px] border border-field bg-well px-4"
      >
        <CalendarDays className="size-4 shrink-0 text-foreground" aria-hidden />
        <span className="text-base font-medium text-foreground">{fmtDate(value, locale)}</span>
      </button>

      {/* An overlay, not a panel in the flow: anchored under the field it
          read as one more form row, and on a short screen it pushed the rest
          of the form out of reach. Fixed to the app frame — `.app-device`
          carries a transform, so this covers the phone, not the desktop
          window behind it, exactly as the watchlist sheet does. */}
      {open && (
        <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label={tCommon('close')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative w-full max-w-[330px] rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center justify-between gap-1 pb-2">
            {nav('-1y', () => move(-12), ChevronsLeft)}
            {nav('-1m', () => move(-1), ChevronLeft)}
            <span className="flex-1 text-center text-sm font-semibold text-foreground">{monthLabel}</span>
            {nav('+1m', () => move(1), ChevronRight)}
            {nav('+1y', () => move(12), ChevronsRight)}
          </div>
          <div className="grid grid-cols-7 pb-1">
            {weekdays.map((w, i) => (
              <span
                key={i}
                className={cn(
                  'py-1 text-center text-xs',
                  i === 0 || i === 6 ? 'text-loss' : 'text-muted-foreground',
                )}
              >
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((c) => {
              const disabled = (max !== undefined && c.iso > max) || (min !== undefined && c.iso < min);
              const selected = c.iso === value;
              return (
                <button
                  key={c.iso}
                  type="button"
                  disabled={disabled}
                  aria-label={c.iso}
                  aria-current={selected ? 'date' : undefined}
                  onClick={() => {
                    onChange(c.iso);
                    setOpen(false);
                  }}
                  className={cn(
                    'h-9 rounded-lg text-sm tabular-nums',
                    selected
                      ? 'bg-primary font-bold text-primary-foreground'
                      : disabled
                        ? 'text-faint opacity-40'
                        : cn(
                            'hover:bg-card-hover',
                            c.iso === today
                              ? 'font-bold text-gain'
                              : !c.inMonth
                                ? 'text-faint'
                                : c.weekend
                                  ? 'text-loss'
                                  : 'text-foreground',
                          ),
                  )}
                >
                  {c.day}
                </button>
              );
            })}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
