'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { Link, useRouter } from '@/src/i18n/navigation';
import { ChangePill } from '@/components/quote-bits';
import { useQuotes } from '@/components/use-market-data';
import { useWatchlists } from '@/components/use-watchlists';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The user's watchlists as collapsible cards — the Watchlists-screen pattern,
 * reused on the home screen. "Holdings" is filled in from transactions but is
 * otherwise an ordinary list: same chevron, same menu. It sorts first (its
 * sortOrder is -1), so it opens by default.
 */
export function WatchlistAccordions({ marketId }: { marketId: string }) {
  const t = useTranslations('lists');
  const router = useRouter();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const { state, patchList, deleteList } = useWatchlists();
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const lists = state.status === 'data' ? state.lists : [];
  const expandedId = openId ?? lists[0]?.id;
  const expanded = lists.find((l) => l.id === expandedId);
  const { quotes } = useQuotes(expanded?.symbols ?? [], 60_000);

  if (lists.length === 0) return null;

  return (
    <section className="flex flex-col gap-3.5 px-4 pb-6">
      {lists.map((l) => {
        const open = l.id === expandedId;
        return (
          <div key={l.id} className="rounded-xl bg-card px-4 py-1">
            <div className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? '' : l.id)}
                aria-expanded={open}
                className="flex flex-1 items-center text-start"
              >
                <span className="text-base text-muted-foreground">
                  {l.name === HOLDINGS_LIST ? t('holdings') : l.name}
                </span>
              </button>
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
                        router.push('/watchlists');
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
              <button
                type="button"
                onClick={() => setOpenId(open ? '' : l.id)}
                aria-label={l.name}
                aria-expanded={open}
              >
                <ChevronDown
                  className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                  aria-hidden
                />
              </button>
            </div>
            {open &&
              (l.symbols.length === 0 ? (
                <p className="border-t border-border py-3 text-[13px] text-muted-foreground">
                  {t('emptyList')}
                </p>
              ) : (
                l.symbols.map((s) => {
                  const q = quotes[s];
                  return (
                    <div
                      key={s}
                      className="flex items-center justify-between gap-4 border-t border-border py-3"
                    >
                      <Link href={`/stock/${s}`} className="flex min-w-0 flex-col">
                        <span className="text-base font-bold text-foreground">
                          {displaySymbol(s, market)}
                        </span>
                        <span className="truncate text-xs text-foreground">{q?.name ?? s}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-4">
                        <span className="flex flex-col items-end gap-0.5">
                          {q && (
                            <span dir="ltr" className="text-sm font-bold text-foreground tabular-nums">
                              {market.currencySymbol}
                              {fmtNum(q.price, nl)}
                            </span>
                          )}
                          <ChangePill pct={q?.changePct ?? 0} numberLocale={nl} variant="soft" />
                        </span>
                        <button
                          type="button"
                          aria-label={t('removeFromList')}
                          onClick={() =>
                            patchList(l.id, { symbols: l.symbols.filter((x) => x !== s) })
                          }
                        >
                          <Star className="size-5 fill-primary text-primary" aria-hidden />
                        </button>
                      </span>
                    </div>
                  );
                })
              ))}
          </div>
        );
      })}
    </section>
  );
}
