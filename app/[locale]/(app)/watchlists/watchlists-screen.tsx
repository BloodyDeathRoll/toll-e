'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronDown, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { ActionBar } from '@/components/app-shell/action-bar';
import { AppHeader } from '@/components/app-shell/app-header';
import { useMarket } from '@/components/app-shell/market-context';
import { ListInfo, ListMenu } from '@/components/list-menu';
import { ErrorCard } from '@/components/error-card';
import { ReorderList } from '@/components/reorder-list';
import { RowLink } from '@/components/row-link';
import { ChangePill, NO_VALUE } from '@/components/quote-bits';
import { WatchlistSheet } from '@/components/watchlist-sheet';
import { useQuotes, useSearch } from '@/components/use-market-data';
import { useWatchlists, type WatchlistData } from '@/components/use-watchlists';
import { demoWatchlists } from '@/src/demo/data';
import { HOLDINGS_LIST, listInMarket } from '@/src/watchlists/constants';
import { getMarket, displaySymbol, marketForSymbol } from '@/src/markets/registry';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

type Mode =
  | { kind: 'browse' }
  | { kind: 'edit'; listId: string; addOpen: boolean }
  | { kind: 'create' };

export function WatchlistsScreen({
  initialMode,
  listId,
}: { initialMode?: 'create' | 'edit' | 'add'; listId?: string } = {}) {
  const t = useTranslations('lists');
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const { state, reload, createList, patchList, deleteList } = useWatchlists();
  const router = useRouter();
  // /watchlists/new is how the tab bar's plus asks for the create screen;
  // /watchlists/<id>/edit and /<id>/add are how the home screen's list menu
  // reaches the same flows without a query param.
  const wantsNew = initialMode === 'create';
  const deepLinked = (initialMode === 'edit' || initialMode === 'add') && Boolean(listId);

  const real = state.status === 'data' ? state.lists : null;
  const [mode, setMode] = useState<Mode>(
    deepLinked && listId
      ? { kind: 'edit', listId, addOpen: initialMode === 'add' }
      : { kind: 'browse' },
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // A row's ★ never removes on the spot — it opens the same "include in
  // watchlists" sheet the stock page and search use, so one gesture means
  // one thing everywhere.
  const [sheetFor, setSheetFor] = useState<string | null>(null);

  /** Leaving a flow: back to the list when deep-linked, in place otherwise. */
  const toBrowse = () => {
    setMode({ kind: 'browse' });
    if (deepLinked || wantsNew) router.replace('/watchlists');
  };

  // Demo showcase for signed-out visitors; real lists otherwise. "Holdings"
  // is filled in from transactions but is an ordinary container otherwise.
  const lists: Array<{
    id: string;
    name: string;
    symbols: string[];
    demo?: boolean;
    managed?: boolean;
    /** Size before the market filter — an empty list and one filtered down
     *  to nothing need different words. */
    total: number;
  }> = real
    ? real
        // One group per market: only the selected market's lists (plus
        // market-agnostic ones — Holdings and legacy) are on screen.
        .filter((l) => listInMarket(l, marketId))
        .map((l) => ({
          id: l.id,
          name: l.name === HOLDINGS_LIST ? t('holdings') : l.name,
          // A market-agnostic list can hold tickers from several markets; the
          // selected market decides which of them are on screen.
          symbols: l.symbols.filter((s) => marketForSymbol(s).id === marketId),
          managed: l.name === HOLDINGS_LIST,
          total: l.symbols.length,
        }))
    : demoWatchlists.map((w, i) => ({
        id: `demo-${i}`,
        name: w.name,
        symbols: w.items.map((q) => q.symbol).filter((s) => marketForSymbol(s).id === marketId),
        demo: true,
        total: w.items.length,
      }));
  // Every list opens and closes on its own; opening one leaves the rest be.
  const openLists = lists.filter((l) => !collapsed.has(l.id));
  const { quotes } = useQuotes(openLists.flatMap((l) => l.symbols), 60_000);
  const toggleOpen = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const editingList = mode.kind === 'edit' ? real?.find((l) => l.id === mode.listId) : undefined;
  if (mode.kind === 'edit' && editingList) {
    return (
      <EditList
        list={editingList}
        marketId={marketId}
        managed={editingList.name === HOLDINGS_LIST}
        addOpen={mode.addOpen}
        onBack={toBrowse}
        onPatch={patchList}
        onDelete={async (id) => {
          await deleteList(id);
          toBrowse();
        }}
      />
    );
  }

  if (mode.kind === 'create' || wantsNew) {
    return (
      <CreateList
        marketId={marketId}
        onBack={toBrowse}
        onSave={async (listName, symbols) => {
          // Born into the market it was created under — lists group per market.
          const created = await createList(listName, marketId);
          if (created && symbols.length) await patchList(created.id, { symbols });
          toBrowse();
          if (created) setCollapsed(new Set());
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
              onClick={() => router.push('/watchlists/new')}
              className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Plus className="size-5" aria-hidden />
            </button>
          ) : undefined
        }
      />
      <h1 className="sr-only">{t('editList')}</h1>

      {/* Desktop header: the mobile AppHeader (with its create button) is hidden ≥md. */}
      {real && (
        <div className="hidden items-center justify-between px-4 pt-7 pb-4 md:flex">
          <span className="text-xl font-bold tracking-tight text-foreground">{t('editList')}</span>
          <button
            type="button"
            onClick={() => router.push('/watchlists/new')}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" aria-hidden />
            {t('newList')}
          </button>
        </div>
      )}

      {/* Signed in, zero lists: design empty state. */}
      {real && real.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 pb-24">
          <p className="text-base text-foreground">{t('noListsFound')}</p>
          <button
            type="button"
            onClick={() => router.push('/watchlists/new')}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {t('emptyCta')}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3.5 px-4 pb-6">
        {lists.map((l) => {
          const open = !collapsed.has(l.id);
          return (
            <section key={l.id} className="rounded-xl bg-card px-4 py-1">
              <div className="flex items-center gap-3 py-3">
                {/* Title and its info dot are one unit — 4px apart, top-aligned. */}
                <span className="flex items-start">
                  <button
                    type="button"
                    onClick={() => toggleOpen(l.id)}
                    aria-expanded={open}
                    className="text-start text-base text-muted-foreground"
                  >
                    {l.name}
                  </button>
                  {l.managed && <ListInfo note={t('managedNote')} />}
                </span>
                <span className="flex-1" aria-hidden />
                {!l.demo && (
                  <ListMenu
                    locked={l.managed}
                    onEdit={() => setMode({ kind: 'edit', listId: l.id, addOpen: false })}
                    onAddTickers={() => setMode({ kind: 'edit', listId: l.id, addOpen: true })}
                    onDelete={() => void deleteList(l.id)}
                    onCreateList={() => router.push('/watchlists/new')}
                  />
                )}
                <button
                  type="button"
                  onClick={() => toggleOpen(l.id)}
                  aria-label={l.name}
                  aria-expanded={open}
                >
                  <ChevronDown
                    className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                    aria-hidden
                  />
                </button>
              </div>
              {open && l.symbols.length === 0 && (
                <p className="border-t border-border py-3 text-[13px] text-muted-foreground">
                  {t(l.total > 0 ? 'emptyInMarket' : 'emptyList')}
                </p>
              )}
              {open &&
                l.symbols.map((s) => {
                  const q = quotes[s];
                  const demoQuote = l.demo
                    ? demoWatchlists.flatMap((w) => w.items).find((it) => it.symbol === s)
                    : undefined;
                  const price = q?.price ?? demoQuote?.price;
                  // No `?? 0` tail: a quote that has not landed reads as a
                  // dash, not as an unchanged day.
                  const pct = q?.changePct ?? demoQuote?.changePct;
                  const sm = marketForSymbol(s); // a list may span markets
                  return (
                    <div key={s} className="flex items-center gap-4 border-t border-border py-3">
                      {/* The whole row opens the stock view; only the star,
                          which does something else, is left out of it. */}
                      <RowLink
                        href={`/stock/${s}`}
                        className="flex min-w-0 flex-1 items-center justify-between gap-4"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[18px] font-bold text-foreground">
                            {displaySymbol(s, sm)}
                          </span>
                          <span className="truncate text-xs text-foreground">
                            {q?.name ?? demoQuote?.name ?? s}
                          </span>
                          <span className="text-xs text-muted-foreground">{t('equity')}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span dir="ltr" className="text-[16px] font-bold text-foreground tabular-nums">
                            {price !== undefined
                              ? `${sm.currencySymbol}${fmtNum(price, sm.numberLocale)}`
                              : NO_VALUE}
                          </span>
                          <ChangePill pct={pct} numberLocale={nl} variant="soft" className="text-[16px]" />
                        </span>
                      </RowLink>
                      <button
                        type="button"
                        aria-label={t('includeIn')}
                        onClick={() => (l.demo ? router.push('/sign-in') : setSheetFor(s))}
                      >
                        <Star className="size-5 fill-primary text-primary" aria-hidden />
                      </button>
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

      {/* The demo lists above are the signed-out showcase. On a failure they
          are still what renders, so say plainly that these are not yours. */}
      {state.status === 'error' && (
        <div className="px-6 pb-6">
          <ErrorCard onRetry={reload} />
        </div>
      )}

      {sheetFor && real && (
        <WatchlistSheet symbol={sheetFor} lists={real} onClose={() => setSheetFor(null)} />
      )}
    </main>
  );
}

/**
 * Edit watchlist (design frame): rename, add, drag-reorder, per-row + list
 * delete.
 *
 * `managed` is Holdings. What it holds is transactions' business, so the two
 * ways in and the two ways out — add, remove, rename, delete the list — are
 * all gone. The order is not: which of your positions you want to see first
 * is a reading preference, and it survives the next sync (the reconcile only
 * adds and removes, it never rewrites sortOrder). So the screen keeps its
 * drag handles and loses everything else.
 */
function EditList({
  list,
  marketId,
  managed = false,
  addOpen = false,
  onBack,
  onPatch,
  onDelete,
}: {
  list: WatchlistData;
  marketId: string;
  /** Holdings: reorder only. */
  managed?: boolean;
  /** Opened straight from "Add tickers": the search is already waiting. */
  addOpen?: boolean;
  onBack: () => void;
  onPatch: (id: string, patch: { name?: string; symbols?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslations('lists');
  const market = getMarket(marketId);
  const [name, setName] = useState(list.name);
  const [searchOpen, setSearchOpen] = useState(addOpen && !managed);
  const [query, setQuery] = useState('');
  // A dropped row must stay where it was dropped. The write is a round trip
  // (PATCH, then reload), and rendering the server's copy in the meantime
  // snaps the row back for as long as that takes — so the order the user just
  // made is what we render, until the list gains or loses a symbol and the
  // server's copy is the only one that knows the membership.
  const [dropped, setDropped] = useState<string[] | null>(null);
  const symbols =
    dropped &&
    dropped.length === list.symbols.length &&
    dropped.every((s) => list.symbols.includes(s))
      ? dropped
      : list.symbols;
  const { quotes } = useQuotes(symbols, 60_000);
  // Add-ticker search looks in the list's own market, not the browsing lens.
  const results = useSearch(query, list.market ?? marketId)
    .filter((r) => !symbols.includes(r.symbol))
    .slice(0, 6);

  const reorder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...symbols];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDropped(next);
    await onPatch(list.id, { symbols: next });
  };

  const saveName = () => {
    if (managed) return;
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
        <h1 className="flex-1 text-base font-semibold text-foreground">{t('editWatchlist')}</h1>
        {!managed && (
          <button
            type="button"
            aria-label={t('addTickers')}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
            className="text-foreground"
          >
            <Plus className="size-6 rounded-full border border-foreground p-0.5" aria-hidden />
          </button>
        )}
      </div>

      {managed && (
        <p className="px-6 pb-4 text-[13px] text-muted-foreground">{t('reorderOnlyNote')}</p>
      )}

      {searchOpen && !managed && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <input
            autoFocus
            value={query}
            placeholder={t('addTicker')}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[48px] rounded-[20px] border border-field bg-well px-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && results.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-border bg-popover">
              {results.map((r, i) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      void onPatch(list.id, { symbols: [r.symbol, ...symbols] });
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

      <section className="mx-4 rounded-xl bg-card px-4 py-1">
        <div className="flex items-center gap-3 border-b border-border py-3">
          {managed ? (
            <span className="min-w-0 flex-1 text-base text-foreground">{t('holdings')}</span>
          ) : (
            <>
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
            </>
          )}
        </div>
        <ReorderList
          items={symbols}
          keyOf={(s) => s}
          onReorder={(from, to) => void reorder(from, to)}
          handleLabel={(s) => t('reorder', { name: displaySymbol(s, market) })}
          rowClassName={(i) => cn('flex items-center gap-3 py-3', i > 0 && 'border-t border-border')}
        >
          {(s) => (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base font-bold text-foreground">{displaySymbol(s, market)}</span>
                <span className="truncate text-xs text-foreground">{quotes[s]?.name ?? s}</span>
                <span className="text-xs text-muted-foreground">{t('equity')}</span>
              </span>
              {!managed && (
                <button
                  type="button"
                  aria-label={t('removeFromList')}
                  onClick={() => void onPatch(list.id, { symbols: symbols.filter((x) => x !== s) })}
                >
                  <Trash2 className="size-5 text-muted-foreground" aria-hidden />
                </button>
              )}
            </>
          )}
        </ReorderList>
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
          className="h-[48px] rounded-[20px] border border-field bg-well px-4 text-base text-foreground outline-none"
        />
      </div>

      {searchOpen && (
        <div className="relative flex flex-col gap-2 px-6 pt-4">
          <input
            autoFocus
            value={query}
            placeholder={t('addTicker')}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[48px] rounded-[20px] border border-field bg-well px-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && results.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-border bg-popover">
              {results.map((r, i) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!symbols.includes(r.symbol)) setSymbols([r.symbol, ...symbols]);
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

      <ActionBar
        label={t('save')}
        disabled={!name.trim() || busy}
        onClick={async () => {
          setBusy(true);
          await onSave(name.trim(), symbols);
        }}
      />
    </main>
  );
}
