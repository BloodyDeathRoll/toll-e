'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListPlus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The three-dots menu a watchlist title carries, identical wherever a list
 * appears — home screen or Watchlists. Callers supply the behaviour, since
 * Watchlists switches screens in place while the home screen navigates.
 *
 * `locked` is the Holdings list: it is filled in from transactions, so every
 * action that would edit it is shown (the menu must not change shape from one
 * list to the next) but disabled. Only creating a new list survives.
 */
export function ListMenu({
  onEdit,
  onAddTickers,
  onDelete,
  onCreateList,
  locked = false,
}: {
  onEdit: () => void;
  onAddTickers: () => void;
  onDelete: () => void;
  onCreateList: () => void;
  locked?: boolean;
}) {
  const t = useTranslations('lists');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const item = 'flex items-center gap-3 text-start text-base disabled:opacity-40';

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={t('listMenu')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="size-5 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 flex w-56 flex-col gap-4 rounded-[20px] bg-well p-6 shadow-lg">
          <button type="button" disabled={locked} onClick={run(onEdit)} className={cn(item, 'text-foreground')}>
            <Pencil className="size-4 shrink-0" aria-hidden />
            {t('editWatchlist')}
          </button>
          <button type="button" disabled={locked} onClick={run(onAddTickers)} className={cn(item, 'text-foreground')}>
            <Plus className="size-4 shrink-0" aria-hidden />
            {t('addTickers')}
          </button>
          <button type="button" disabled={locked} onClick={run(onDelete)} className={cn(item, 'text-loss')}>
            <Trash2 className="size-4 shrink-0" aria-hidden />
            {t('deleteList')}
          </button>
          <span className="border-t border-border" aria-hidden />
          <button type="button" onClick={run(onCreateList)} className={cn(item, 'text-foreground')}>
            <ListPlus className="size-4 shrink-0" aria-hidden />
            {t('createNewList')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The 12px info dot beside a locked list's title. Its tooltip is the one
 * explanation Holdings needs, and it belongs here rather than hidden behind
 * the menu.
 */
export function ListInfo({ note }: { note: string }) {
  const t = useTranslations('lists');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <span className="relative ms-1 inline-flex self-start pt-px" ref={ref}>
      <button
        type="button"
        aria-label={t('listInfo')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-3 items-center justify-center"
      >
        <Info className="size-3 text-muted-foreground" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute start-0 top-full z-50 mt-1 w-56 rounded-[20px] bg-well p-4 text-sm normal-case tracking-normal text-muted-foreground shadow-lg"
        >
          {note}
        </span>
      )}
    </span>
  );
}

/** 12×12 info glyph — lucide's own is stroke-tuned for 24px and reads muddy this small. */
function Info({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="6" cy="3.4" r="0.75" fill="currentColor" />
      <path d="M6 5.4v3.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
