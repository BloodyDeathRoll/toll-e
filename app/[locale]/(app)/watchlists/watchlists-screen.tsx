'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Check, GripHorizontal, Plus } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useQuotes, useSearch } from '@/components/use-market-data';
import { useWatchlists } from '@/components/use-watchlists';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMarket } from '@/components/app-shell/market-context';
import { demoWatchlists } from '@/src/demo/data';
import { getMarket, displaySymbol } from '@/src/markets/registry';
import { cn } from '@/lib/utils';

interface Row {
  symbol: string;
  name: string;
}

export function WatchlistsScreen() {
  const t = useTranslations('lists');
  const locale = useLocale();
  const router = useRouter();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const { state, createList, patchList } = useWatchlists();

  const real = state.status === 'data' ? state.lists : null;
  const [listIdx, setListIdx] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addQuery, setAddQuery] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  const activeReal = real?.[Math.min(listIdx, Math.max(0, (real?.length ?? 1) - 1))];
  const activeDemo = demoWatchlists[Math.min(listIdx, demoWatchlists.length - 1)];

  const symbols = activeReal?.symbols ?? [];
  const { quotes } = useQuotes(symbols, 60_000);
  const addResults = useSearch(addQuery, marketId).slice(0, 6);

  const rows: Row[] = activeReal
    ? symbols.map((s) => ({ symbol: s, name: quotes[s]?.name ?? s }))
    : activeDemo.items.map((q) => ({
        symbol: q.symbol,
        name: locale === 'he' && q.nameHe ? q.nameHe : q.name,
      }));

  const displayName = name ?? activeReal?.name ?? activeDemo.name;

  // Reset per-list edit state when switching lists or when data arrives.
  const activeKey = activeReal?.id ?? String(listIdx);
  const prevKey = useRef(activeKey);
  useEffect(() => {
    if (prevKey.current !== activeKey) {
      prevKey.current = activeKey;
       
      setName(null);
      setSelected(new Set());
    }
  }, [activeKey]);

  const toggle = (symbol: string) => {
    const next = new Set(selected);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    setSelected(next);
  };

  const saveName = async () => {
    if (activeReal && name && name !== activeReal.name) {
      await patchList(activeReal.id, { name });
      setName(null);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addSymbol = async (symbol: string) => {
    setAddQuery('');
    if (!activeReal || activeReal.symbols.includes(symbol)) return;
    await patchList(activeReal.id, { symbols: [...activeReal.symbols, symbol] });
  };

  const removeSelected = async () => {
    if (!activeReal || selected.size === 0) return;
    await patchList(activeReal.id, {
      symbols: activeReal.symbols.filter((s) => !selected.has(s)),
    });
    setSelected(new Set());
  };

  const reorder = async (from: number, to: number) => {
    if (!activeReal || from === to) return;
    const next = [...activeReal.symbols];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await patchList(activeReal.id, { symbols: next });
  };

  const moveSelected = async (targetId: string) => {
    const target = real?.find((l) => l.id === targetId);
    if (!activeReal || !target || selected.size === 0) return;
    const moved = activeReal.symbols.filter((s) => selected.has(s));
    await patchList(activeReal.id, {
      symbols: activeReal.symbols.filter((s) => !selected.has(s)),
    });
    await patchList(targetId, {
      symbols: [...target.symbols, ...moved.filter((s) => !target.symbols.includes(s))],
    });
    setSelected(new Set());
  };

  const newList = async () => {
    const created = await createList(t('newList'));
    if (created && real) setListIdx(real.length); // it appends
  };

  const chips = real ? real.map((l) => l.name) : demoWatchlists.map((w) => w.name);

  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3.5 p-4 md:py-7">
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label={t('editList')} className="md:hidden">
            <ArrowLeft className="size-[18px] text-foreground rtl:-scale-x-100" aria-hidden />
          </button>
          <h1 className="text-xl font-semibold text-foreground">{t('editList')}</h1>
        </div>
        <button
          type="button"
          onClick={saveName}
          disabled={!activeReal}
          className="text-[15px] font-semibold text-brand disabled:opacity-40"
        >
          {saved ? '✓' : t('save')}
        </button>
      </div>

      {/* List chips */}
      <div className="flex gap-2 overflow-x-auto">
        {chips.map((chip, i) => (
          <button
            key={`${chip}-${i}`}
            type="button"
            onClick={() => setListIdx(i)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap',
              i === listIdx
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'bg-secondary text-secondary-foreground',
            )}
          >
            {chip}
          </button>
        ))}
        <button
          type="button"
          onClick={newList}
          disabled={!real}
          aria-label={t('newList')}
          className="rounded-full bg-secondary px-3 py-1.5 text-[13px] text-muted-foreground disabled:opacity-40"
        >
          ＋
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-subtle">{t('listName')}</span>
        <input
          value={displayName}
          onChange={(e) => setName(e.target.value)}
          disabled={!activeReal}
          className="rounded-lg border border-border bg-well px-3.5 py-3 text-base text-foreground outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:opacity-70"
        />
      </label>

      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">
          {t('currency')}{' '}
          <span className="font-medium text-foreground">
            {activeReal ? market.currency : activeDemo.currency}
          </span>
        </span>
        <span className="text-muted-foreground">
          {t('sort')} <span className="font-medium text-foreground">{t('sortCustom')}</span>
        </span>
      </div>

      {/* Items — drag rows to reorder (sortOrder rewrite on drop) */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((q, i) => {
          const isSel = selected.has(q.symbol);
          return (
            <div
              key={q.symbol}
              draggable={Boolean(activeReal)}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null) reorder(dragIdx, i);
                setDragIdx(null);
              }}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-[13px]',
                i > 0 && 'border-t border-border',
                isSel && 'bg-accent',
                dragIdx === i && 'opacity-50',
              )}
            >
              <button
                type="button"
                onClick={() => toggle(q.symbol)}
                aria-pressed={isSel}
                className={cn(
                  'flex size-[18px] items-center justify-center rounded-[5px]',
                  isSel ? 'bg-primary text-primary-foreground' : 'border-[1.5px] border-border',
                )}
              >
                {isSel && <Check className="size-3" aria-hidden />}
              </button>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">
                  {displaySymbol(q.symbol, market)}
                </span>
                <span className="text-xs text-muted-foreground">{q.name}</span>
              </span>
              <GripHorizontal
                className={cn('size-4 cursor-grab', isSel ? 'text-subtle' : 'text-faint')}
                aria-hidden
              />
            </div>
          );
        })}

        {/* Add ticker */}
        {activeReal && (
          <div className={cn('relative px-4 py-2.5', rows.length > 0 && 'border-t border-border')}>
            <input
              ref={addRef}
              value={addQuery}
              placeholder={t('addTicker')}
              onChange={(e) => setAddQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {addQuery && addResults.length > 0 && (
              <ul className="absolute inset-x-4 bottom-full z-50 mb-1 overflow-hidden rounded-xl border border-border bg-popover shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
                {addResults.map((r, i) => (
                  <li key={r.symbol}>
                    <button
                      type="button"
                      onClick={() => addSymbol(r.symbol)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-accent',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <span className="text-[13px] font-semibold text-foreground">{r.symbol}</span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">{r.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={removeSelected}
          disabled={selected.size === 0 || !activeReal}
          className="text-sm font-medium text-loss disabled:opacity-40"
        >
          {t('removeSelected', { count: selected.size })}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={selected.size === 0 || !activeReal || (real?.length ?? 0) < 2}
            className="text-sm font-medium text-brand outline-none disabled:font-normal disabled:text-muted-foreground disabled:opacity-60"
          >
            {t('moveToList')}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px] rounded-xl p-0">
            {real
              ?.filter((l) => l.id !== activeReal?.id)
              .map((l, i) => (
                <DropdownMenuItem
                  key={l.id}
                  onSelect={() => moveSelected(l.id)}
                  className={cn('rounded-none px-4 py-2.5', i > 0 && 'border-t border-border')}
                >
                  <span className="truncate text-sm text-foreground">{l.name}</span>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {state.status === 'signed-out' && (
        <p className="px-1 text-xs text-muted-foreground">{t('demoNote')}</p>
      )}

      {/* FAB — jump to the add-ticker field */}
      <button
        type="button"
        onClick={() => addRef.current?.focus()}
        disabled={!activeReal}
        aria-label={t('addTicker')}
        className="fixed bottom-[92px] end-4 z-30 flex size-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(240,185,11,0.4)] disabled:opacity-50 md:absolute md:bottom-8"
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </main>
  );
}
