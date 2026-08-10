'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import { useMarket } from '@/components/app-shell/market-context';
import { ChangePill } from '@/components/quote-bits';
import { useQuotes, useSearch } from '@/components/use-market-data';
import { useWatchlists, type WatchlistData } from '@/components/use-watchlists';
import { demoWatchlists } from '@/src/demo/data';
import { getMarket, displaySymbol } from '@/src/markets/registry';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

type Mode =
  | { kind: 'browse' }
  | { kind: 'edit'; listId: string }
  | { kind: 'create' };

export function WatchlistsScreen() {
  const t = useTranslations('lists');
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const { state, createList, patchList, deleteList } = useWatchlists();

  const real = state.status === 'data' ? state.lists : null;
  const [mode, setMode] = useState<Mode>({ kind: 'browse' });
  const [openList, setOpenList] = useState<string | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Demo showcase for signed-out visitors; real lists otherwise.
  const lists: Array<{ id: string; name: string; symbols: string[]; demo?: boolean }> = real
    ? real.map((l) => ({ id: l.id, name: l.name, symbols: l.symbols }))
    : demoWatchlists.map((w, i) => ({
        id: `demo-${i}`,
        name: w.name,
        symbols: w.items.map((q) => q.symbol),
        demo: true,
      }));
  const expandedId = openList ?? lists[0]?.id;
  const expanded = lists.find((l) => l.id === expandedId);
  const { quotes } = useQuotes(expanded?.symbols ?? [], 60_000);

  const editingList = mode.kind === 'edit' ? real?.find((l) => l.id === mode.listId) : undefined;
  if (mode.kind === 'edit' && editingList) {
    return (
      <EditList
        list={editingList}
        marketId={marketId}
        onBack={() => setMode({ kind: 'browse' })}
        onPatch={patchList}
        onDelete={async (id) => {
          await deleteList(id);
          setMode({ kind: 'browse' });
        }}
      />
    );
  }

  if (mode.kind === 'create') {
    return (
      <CreateList
        marketId={marketId}
        onBack={() => setMode({ kind: 'browse' })}
        onSave={async (listName, symbols) => {
          const created = await createList(listName);
          if (created && symbols.length) await patchList(created.id, { symbols });
          setMode({ kind: 'browse' });
          if (created) setOpenList(created.id);
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <AppHeader
        action={
          real ? (
            <button
              type="button"
              aria-label={t('newList')}
              onClick={() => setMode({ kind: 'create' })}
              className="flex size-[43px] items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Plus className="size-6" aria-hidden />
            </button>
          ) : undefined
        }
      />
      <h1 className="sr-only">{t('editList')}</h1>

      {/* Signed in, zero lists: design empty state. */}
      {real && real.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 pb-24">
          <p className="text-base text-foreground">{t('noListsFound')}</p>
          <button
            type="button"
            onClick={() => setMode({ kind: 'create' })}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {t('emptyCta')}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3.5 px-4 pb-6">
        {lists.map((l) => {
          const open = l.id === expandedId;
          return (
            <section key={l.id} className="rounded-xl bg-card px-4 py-1">
              <div className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() => setOpenList(open ? '' : l.id)}
                  aria-expanded={open}
                  className="flex flex-1 items-center justify-between text-start"
                >
                  <span className="text-base text-muted-foreground">{l.name}</span>
                </button>
                {!l.demo && (
                  <div className="relative" ref={menuFor === l.id ? menuRef : undefined}>
                    <button
                      type="button"
                      aria-label={t('listMenu')}
                      onClick={() => setMenuFor(menuFor === l.id ? null : l.id)}
                    >
                      <MoreHorizontal className="size-5 text-muted-foreground" aria-hidden />
                    </button>
                    {menuFor === l.id && (
                      <div className="absolute end-0 top-full z-50 mt-1 flex w-56 flex-col gap-4 rounded-[20px] bg-well p-6 shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setMenuFor(null);
                            setMode({ kind: 'edit', listId: l.id });
                          }}
                          className="flex items-center gap-3 text-base text-foreground"
                        >
                          <Pencil className="size-4" aria-hidden />
                          {t('edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuFor(null);
                            void deleteList(l.id);
                          }}
                          className="flex items-center gap-3 text-base text-foreground"
                        >
                          <Trash2 className="size-4" aria-hidden />
                          {t('deleteList')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setOpenList(open ? '' : l.id)}
                  aria-label={l.name}
                  aria-expanded={open}
                >
                  <ChevronDown
                    className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                    aria-hidden
                  />
                </button>
              </div>
              {open &&
                l.symbols.map((s) => {
                  const q = quotes[s];
                  const demoQuote = l.demo
                    ? demoWatchlists.flatMap((w) => w.items).find((it) => it.symbol === s)
                    : undefined;
                  const price = q?.price ?? demoQuote?.price;
                  const pct = q?.changePct ?? demoQuote?.changePct ?? 0;
                  return (
                    <div key={s} className="flex items-center justify-between gap-4 border-t border-border py-3">
                      <Link href={`/stock/${s}`} className="flex min-w-0 flex-col">
                        <span className="text-base font-bold text-foreground">
                          {displaySymbol(s, market)}
                        </span>
                        <span className="truncate text-xs text-foreground">
                          {q?.name ?? demoQuote?.name ?? s}
                        </span>
                        <span className="text-xs text-muted-foreground">{t('equity')}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-4">
                        <span className="flex flex-col items-end gap-0.5">
                          {price !== undefined && (
                            <span dir="ltr" className="text-sm font-bold text-foreground tabular-nums">
                              {market.currencySymbol}
                              {fmtNum(price, nl)}
                            </span>
                          )}
                          <ChangePill pct={pct} numberLocale={nl} variant="soft" />
                        </span>
                        <button
                          type="button"
                          aria-label={t('removeFromList')}
                          disabled={Boolean(l.demo)}
                          onClick={() =>
                            patchList(l.id, { symbols: l.symbols.filter((x) => x !== s) })
                          }
                        >
                          <Star className="size-5 fill-primary text-primary" aria-hidden />
                        </button>
                      </span>
                    </div>
                  );
                })}
            </section>
          );
        })}
      </div>

      {state.status === 'signed-out' && (
        <p className="px-6 pb-6 text-xs text-muted-foreground">{t('demoNote')}</p>
      )}
    </main>
  );
}

/** Edit watchlist (design frame): rename, drag-reorder, per-row + list delete. */
function EditList({
  list,
  marketId,
  onBack,
  onPatch,
  onDelete,
}: {
  list: WatchlistData;
  marketId: string;
  onBack: () => void;
  onPatch: (id: string, patch: { name?: string; symbols?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslations('lists');
  const market = getMarket(marketId);
  const { quotes } = useQuotes(list.symbols, 60_000);
  const [name, setName] = useState(list.name);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const reorder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...list.symbols];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await onPatch(list.id, { symbols: next });
  };

  const saveName = () => {
    if (name && name !== list.name) void onPatch(list.id, { name });
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex items-center gap-4 p-6">
        <button
          type="button"
          onClick={() => {
            saveName();
            onBack();
          }}
          aria-label={t('back')}
        >
          <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <h1 className="text-base font-semibold text-foreground">{t('editWatchlist')}</h1>
      </div>

      <section className="mx-4 rounded-xl bg-card px-4 py-1">
        <div className="flex items-center gap-3 border-b border-border py-3">
          <Pencil className="size-4 text-muted-foreground" aria-hidden />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            aria-label={t('listName')}
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none"
          />
          <button type="button" aria-label={t('deleteList')} onClick={() => void onDelete(list.id)}>
            <Trash2 className="size-5 text-muted-foreground" aria-hidden />
          </button>
        </div>
        {list.symbols.map((s, i) => (
          <div
            key={s}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) void reorder(dragIdx, i);
              setDragIdx(null);
            }}
            className={cn(
              'flex items-center gap-3 py-3',
              i > 0 && 'border-t border-border',
              dragIdx === i && 'opacity-50',
            )}
          >
            <GripVertical className="size-4 cursor-grab text-faint" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-bold text-foreground">{displaySymbol(s, market)}</span>
              <span className="truncate text-xs text-foreground">{quotes[s]?.name ?? s}</span>
              <span className="text-xs text-muted-foreground">{t('equity')}</span>
            </span>
            <button
              type="button"
              aria-label={t('removeFromList')}
              onClick={() => void onPatch(list.id, { symbols: list.symbols.filter((x) => x !== s) })}
            >
              <Trash2 className="size-5 text-muted-foreground" aria-hidden />
            </button>
          </div>
        ))}
      </section>
    </main>
  );
}

/** Create watchlist (design frame): name, ticker search, Save FAB. */
function CreateList({
  marketId,
  onBack,
  onSave,
}: {
  marketId: string;
  onBack: () => void;
  onSave: (name: string, symbols: string[]) => Promise<void>;
}) {
  const t = useTranslations('lists');
  const market = getMarket(marketId);
  const [name, setName] = useState('');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const results = useSearch(query, marketId).slice(0, 6);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex items-center gap-4 p-6">
        <button type="button" onClick={onBack} aria-label={t('back')}>
          <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <h1 className="flex-1 text-base font-semibold text-foreground">{t('createWatchlist')}</h1>
        <button
          type="button"
          aria-label={t('addTicker')}
          onClick={() => setSearchOpen((v) => !v)}
          className="text-foreground"
        >
          <Plus className="size-6 rounded-full border border-foreground p-0.5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-6">
        <label className="text-xs text-muted-foreground" htmlFor="wl-name">
          {t('listName')}
        </label>
        <input
          id="wl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[20px] bg-well px-4 py-3 text-base text-foreground outline-none"
        />
      </div>

      {searchOpen && (
        <div className="relative flex flex-col gap-2 px-6 pt-4">
          <input
            autoFocus
            value={query}
            placeholder={t('addTicker')}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-[20px] bg-well px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && results.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-border bg-popover">
              {results.map((r, i) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!symbols.includes(r.symbol)) setSymbols([...symbols, r.symbol]);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-4 py-2.5 text-start hover:bg-accent',
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

      <div className="flex flex-col px-6 pt-6">
        {symbols.length === 0 ? (
          <>
            <p className="text-base text-muted-foreground">{t('suggestedTitle')}</p>
            <p className="text-base text-foreground">{t('suggestedHint')}</p>
          </>
        ) : (
          symbols.map((s, i) => (
            <div key={s} className={cn('flex items-center justify-between py-3', i > 0 && 'border-t border-border')}>
              <span className="text-base font-bold text-foreground">{displaySymbol(s, market)}</span>
              <button
                type="button"
                aria-label={t('removeFromList')}
                onClick={() => setSymbols(symbols.filter((x) => x !== s))}
              >
                <Trash2 className="size-5 text-muted-foreground" aria-hidden />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Save FAB */}
      <div className="fixed inset-x-0 bottom-[110px] flex flex-col items-center gap-1 md:absolute">
        <button
          type="button"
          disabled={!name.trim() || busy}
          onClick={async () => {
            setBusy(true);
            await onSave(name.trim(), symbols);
          }}
          aria-label={t('save')}
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Check className="size-6" aria-hidden />
        </button>
        <span className="text-xs text-foreground">{t('save')}</span>
      </div>
    </main>
  );
}
