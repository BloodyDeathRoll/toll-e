'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { ListMenu } from '@/components/list-menu';
import { RowLink } from '@/components/row-link';
import { AfterHours, ChangePill } from '@/components/quote-bits';
import { SessionSparkline } from '@/components/charts';
import { useCharts, useQuotes } from '@/components/use-market-data';
import { useWatchlists } from '@/components/use-watchlists';
import { HOLDINGS_LIST } from '@/src/watchlists/constants';
import { displaySymbol, getMarket, marketForSymbol } from '@/src/markets/registry';
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

  // A list can hold tickers from several markets; the selected market decides
  // which of them are on screen, so ₪ never shows a dollar position.
  const lists = (state.status === 'data' ? state.lists : [])
    .filter((l) => l.name !== HOLDINGS_LIST)
    .map((l) => ({
      ...l,
      symbols: l.symbols.filter((s) => marketForSymbol(s).id === marketId),
      total: l.symbols.length,
    }));
  // Only what is on screen: a collapsed list costs neither quotes nor charts.
  const shown = lists.filter((l) => !collapsed.has(l.id)).flatMap((l) => l.symbols);
  const { quotes } = useQuotes(shown, 60_000);
  const charts = useCharts(shown, '1d');

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
                <ListMenu
                  onEdit={() => router.push(`/watchlists/${l.id}/edit`)}
                  onAddTickers={() => router.push(`/watchlists/${l.id}/add`)}
                  onDelete={() => void deleteList(l.id)}
                  onCreateList={() => router.push('/watchlists/new')}
                />
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
                  {t(l.total > 0 ? 'emptyInMarket' : 'emptyList')}
                </p>
              ) : (
                l.symbols.map((s) => {
                  const q = quotes[s];
                  const sm = marketForSymbol(s);
                  const series = charts[s];
                  return (
                    <RowLink
                      key={s}
                      href={`/stock/${s}`}
                      className="flex items-center justify-between gap-4 border-b border-border py-2.5"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[18px] font-bold text-foreground">
                          {displaySymbol(s, sm)}
                        </span>
                        <span className="truncate text-xs text-foreground">{q?.name ?? s}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-6">
                        {series && (
                          <SessionSparkline
                            points={series.points}
                            previousClose={q?.previousClose ?? series.previousClose}
                            calendar={sm.calendar}
                            price={q?.price}
                            priceAt={q?.asOf}
                            width={91}
                            height={36}
                          />
                        )}
                        <span className="flex flex-col items-end gap-0.5">
                          {q && (
                            <span dir="ltr" className="text-[16px] font-bold text-foreground tabular-nums">
                              {sm.currencySymbol}
                              {fmtNum(q.price, sm.numberLocale)}
                            </span>
                          )}
                          <ChangePill pct={q?.changePct ?? 0} numberLocale={nl} className="text-[16px]" />
                          <AfterHours quote={q} numberLocale={nl} />
                        </span>
                      </span>
                    </RowLink>
                  );
                })
              ))}
          </section>
        );
      })}
    </>
  );
}
