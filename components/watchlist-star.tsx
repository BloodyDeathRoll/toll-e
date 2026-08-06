'use client';

import { useTranslations } from 'next-intl';
import { Check, Star } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useWatchlists, type WatchlistData } from '@/components/use-watchlists';
import { demoWatchlists } from '@/src/demo/data';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Stock-page ★ wiring (toll-e-plan.md §2.2: "Star = add to watchlist").
// Signed out, membership reflects the demo lists and any tap routes to
// sign-in; signed in, the star toggles the default list and the desktop
// button opens a per-list picker.

export interface SymbolWatchlist {
  signedOut: boolean;
  lists: WatchlistData[] | null;
  inAny: boolean;
  isIn: (list: WatchlistData) => boolean;
  toggleIn: (list: WatchlistData) => Promise<void>;
  toggleDefault: () => Promise<void>;
  goSignIn: () => void;
}

export function useSymbolWatchlist(symbol: string): SymbolWatchlist {
  const t = useTranslations('lists');
  const router = useRouter();
  const { state, createList, patchList } = useWatchlists();
  const lists = state.status === 'data' ? state.lists : null;
  const signedOut = state.status === 'signed-out';

  const isIn = (list: WatchlistData) => list.symbols.includes(symbol);
  const inAny = lists
    ? lists.some(isIn)
    : signedOut && demoWatchlists.some((w) => w.items.some((i) => i.symbol === symbol));

  const toggleIn = async (list: WatchlistData) => {
    await patchList(list.id, {
      symbols: isIn(list) ? list.symbols.filter((s) => s !== symbol) : [...list.symbols, symbol],
    });
  };

  const toggleDefault = async () => {
    if (!lists) return;
    if (lists.length === 0) {
      const created = await createList(t('newList'));
      if (created) await patchList(created.id, { symbols: [symbol] });
      return;
    }
    await toggleIn(lists.find((l) => l.isDefault === 1) ?? lists[0]);
  };

  return { signedOut, lists, inAny, isIn, toggleIn, toggleDefault, goSignIn: () => router.push('/sign-in') };
}

/** Mobile header star — one tap toggles the default list. */
export function WatchlistStar({ wl }: { wl: SymbolWatchlist }) {
  const t = useTranslations('stock');
  return (
    <button
      type="button"
      aria-label={t('watchlistBtn')}
      aria-pressed={wl.inAny}
      onClick={() => (wl.signedOut ? wl.goSignIn() : wl.toggleDefault())}
      disabled={!wl.signedOut && !wl.lists}
    >
      <Star
        className={cn('size-4', wl.inAny ? 'text-brand' : 'text-muted-foreground')}
        fill={wl.inAny ? 'currentColor' : 'none'}
        aria-hidden
      />
    </button>
  );
}

/** Desktop "Watchlist" button — dropdown picks which list(s) hold the symbol. */
export function WatchlistMenuButton({ wl }: { wl: SymbolWatchlist }) {
  const t = useTranslations('stock');
  const tLists = useTranslations('lists');
  const tCommon = useTranslations('common');
  const rows = wl.lists ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] text-subtle outline-none data-[state=open]:border-primary data-[state=open]:ring-[3px] data-[state=open]:ring-primary/20">
        <Star
          className={cn('size-3.5', wl.inAny ? 'text-brand' : 'text-muted-foreground')}
          fill={wl.inAny ? 'currentColor' : 'none'}
          aria-hidden
        />
        {t('watchlistBtn')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[230px] rounded-xl p-0">
        <DropdownMenuLabel className="px-4 pt-3 pb-2 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('saveToList')}
        </DropdownMenuLabel>
        {wl.signedOut ? (
          <DropdownMenuItem
            onSelect={wl.goSignIn}
            className="rounded-none border-t border-border px-4 py-2.5 text-xs text-muted-foreground"
          >
            {tLists('demoNote')}
          </DropdownMenuItem>
        ) : wl.lists === null ? (
          <DropdownMenuItem disabled className="rounded-none border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
            {tCommon('loading')}
          </DropdownMenuItem>
        ) : rows.length === 0 ? (
          <DropdownMenuItem
            onSelect={() => wl.toggleDefault()}
            className="rounded-none border-t border-border px-4 py-2.5 text-sm font-semibold text-brand"
          >
            {tLists('newList')}
          </DropdownMenuItem>
        ) : (
          rows.map((l) => {
            const member = wl.isIn(l);
            return (
              <DropdownMenuItem
                key={l.id}
                onSelect={(e) => {
                  e.preventDefault(); // keep the menu open for multi-list toggling
                  wl.toggleIn(l);
                }}
                className={cn('gap-3 rounded-none border-t border-border px-4 py-2.5', member && 'bg-accent')}
              >
                <span className="flex-1 truncate text-sm text-foreground">{l.name}</span>
                {member && <Check className="size-3.5 text-brand" aria-hidden />}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
