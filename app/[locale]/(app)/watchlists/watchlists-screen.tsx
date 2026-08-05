'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Check, GripHorizontal, Plus } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { demoWatchlists } from '@/src/demo/data';
import { cn } from '@/lib/utils';

export function WatchlistsScreen() {
  const t = useTranslations('lists');
  const locale = useLocale();
  const router = useRouter();
  const [listIdx, setListIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = demoWatchlists[listIdx];
  const [name, setName] = useState(list.name);

  const pickList = (i: number) => {
    setListIdx(i);
    setName(demoWatchlists[i].name);
    setSelected(new Set());
  };

  const toggle = (symbol: string) => {
    const next = new Set(selected);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    setSelected(next);
  };

  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3.5 p-4 md:py-7">
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label={t('editList')} className="md:hidden">
            <ArrowLeft className="size-[18px] text-foreground rtl:-scale-x-100" aria-hidden />
          </button>
          <h1 className="text-xl font-semibold text-foreground">{t('editList')}</h1>
        </div>
        <button type="button" className="text-[15px] font-semibold text-brand">
          {t('save')}
        </button>
      </div>

      {/* List chips */}
      <div className="flex gap-2 overflow-x-auto">
        {demoWatchlists.map((w, i) => (
          <button
            key={w.name}
            type="button"
            onClick={() => pickList(i)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap',
              i === listIdx
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'bg-secondary text-secondary-foreground',
            )}
          >
            {w.name}
          </button>
        ))}
        <button
          type="button"
          aria-label={t('newList')}
          className="rounded-full bg-secondary px-3 py-1.5 text-[13px] text-muted-foreground"
        >
          ＋
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-subtle">{t('listName')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-border bg-well px-3.5 py-3 text-base text-foreground outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
        />
      </label>

      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">
          {t('currency')} <span className="font-medium text-foreground">{list.currency}</span>
        </span>
        <span className="text-muted-foreground">
          {t('sort')} <span className="font-medium text-foreground">{t('sortCustom')}</span>
        </span>
      </div>

      {/* Items */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {list.items.map((q, i) => {
          const isSel = selected.has(q.symbol);
          return (
            <button
              key={q.symbol}
              type="button"
              onClick={() => toggle(q.symbol)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-[13px] text-start',
                i > 0 && 'border-t border-border',
                isSel && 'bg-accent',
              )}
            >
              <span
                className={cn(
                  'flex size-[18px] items-center justify-center rounded-[5px]',
                  isSel ? 'bg-primary text-primary-foreground' : 'border-[1.5px] border-border',
                )}
                aria-hidden
              >
                {isSel && <Check className="size-3" />}
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">{q.symbol}</span>
                <span className="text-xs text-muted-foreground">
                  {locale === 'he' && q.nameHe ? q.nameHe : q.name}
                </span>
              </span>
              <GripHorizontal className={cn('size-4', isSel ? 'text-subtle' : 'text-faint')} aria-hidden />
            </button>
          );
        })}
      </section>

      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          disabled={selected.size === 0}
          className="text-sm font-medium text-loss disabled:opacity-40"
        >
          {t('removeSelected', { count: selected.size })}
        </button>
        <button type="button" className="text-sm text-muted-foreground">
          {t('moveToList')}
        </button>
      </div>

      {/* FAB */}
      <button
        type="button"
        aria-label={t('newList')}
        className="fixed bottom-[92px] end-4 z-30 flex size-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(240,185,11,0.4)] md:absolute md:bottom-8"
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </main>
  );
}
