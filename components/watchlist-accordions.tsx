'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Star } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { ChangePill } from '@/components/quote-bits';
import { useQuotes } from '@/components/use-market-data';
import { useWatchlists } from '@/components/use-watchlists';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The user's watchlists as collapsible cards — the Watchlists-screen pattern,
 * reused on the home screen. "Holdings" is auto-maintained from transactions
 * and sorts first (its sortOrder is -1), so it opens by default.
 */
export function WatchlistAccordions({ marketId }: { marketId: string }) {
  const t = useTranslations('lists');
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const { state } = useWatchlists();
  const [openId, setOpenId] = useState<string | undefined>(undefined);

  const lists = state.status === 'data' ? state.lists : [];
  const expandedId = openId ?? lists[0]?.id;
  const expanded = lists.find((l) => l.id === expandedId);
  const { quotes } = useQuotes(expanded?.symbols ?? [], 60_000);

  if (lists.length === 0) return null;

  return (
    <section className="flex flex-col gap-3.5 px-4 pb-6">
      <h2 className="px-2 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
        {t('sectionTitle')}
      </h2>
      {lists.map((l) => {
        const open = l.id === expandedId;
        return (
          <div key={l.id} className="rounded-xl bg-card px-4 py-1">
            <button
              type="button"
              onClick={() => setOpenId(open ? '' : l.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 py-3 text-start"
            >
              <span className="text-base text-muted-foreground">
                {l.name === HOLDINGS_LIST ? t('holdings') : l.name}
              </span>
              <ChevronDown
                className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                aria-hidden
              />
            </button>
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
                      className="flex items-center justify-between gap-4 border-t border-border py-3"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-base font-bold text-foreground">
                          {displaySymbol(s, market)}
                        </span>
                        <span className="truncate text-xs text-foreground">{q?.name ?? s}</span>
                      </span>
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
                        <Star className="size-5 fill-primary text-primary" aria-hidden />
                      </span>
                    </Link>
                  );
                })
              ))}
          </div>
        );
      })}
    </section>
  );
}
