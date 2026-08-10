'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Link, useRouter } from '@/src/i18n/navigation';
import { ChangePill } from '@/components/quote-bits';
import { useQuotes } from '@/components/use-market-data';
import { useWatchlists } from '@/components/use-watchlists';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Watchlists on the home screen: flat sections in the same shape as the
 * Holdings list above them — no card, no stars, every list open by default,
 * each collapsible on its own. Holdings itself is drawn by the positions
 * section, so it is skipped here rather than repeated.
 */
export function WatchlistAccordions({ marketId }: { marketId: string }) {
  const t = useTranslations('lists');
  const router = useRouter();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const { state, deleteList } = useWatchlists();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const lists = (state.status === 'data' ? state.lists : []).filter(
    (l) => l.name !== HOLDINGS_LIST,
  );
  const { quotes } = useQuotes(
    lists.filter((l) => !collapsed.has(l.id)).flatMap((l) => l.symbols),
    60_000,
  );

  if (lists.length === 0) return null;

  return (
    <>
      {lists.map((l) => {
        const open = !collapsed.has(l.id);
        return (
          <section key={l.id} className="flex flex-col px-6 pb-6">
            <div className="flex items-center justify-between gap-3 pb-2.5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {l.name}
              </h2>
              <span className="flex items-center gap-3">
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
                  aria-label={l.name}
                  aria-expanded={open}
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.id)) next.delete(l.id);
                      else next.add(l.id);
                      return next;
                    })
                  }
                >
                  <ChevronDown
                    className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                    aria-hidden
                  />
                </button>
              </span>
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
                    <Link
                      key={s}
                      href={`/stock/${s}`}
                      className="flex items-center justify-between gap-4 border-b border-border py-2.5"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-base font-bold text-foreground">
                          {displaySymbol(s, market)}
                        </span>
                        <span className="truncate text-xs text-foreground">{q?.name ?? s}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        {q && (
                          <span dir="ltr" className="text-sm font-bold text-foreground tabular-nums">
                            {market.currencySymbol}
                            {fmtNum(q.price, nl)}
                          </span>
                        )}
                        <ChangePill pct={q?.changePct ?? 0} numberLocale={nl} />
                      </span>
                    </Link>
                  );
                })
              ))}
          </section>
        );
      })}
    </>
  );
}
