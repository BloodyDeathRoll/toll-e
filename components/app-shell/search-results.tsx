'use client';

import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { ChangePill } from '@/components/quote-bits';
import { useQuotes } from '@/components/use-market-data';
import { useWatchlists } from '@/components/use-watchlists';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import type { SearchResult } from '@/src/market-data/types';
import { fmtNum } from '@/lib/format';

/**
 * Typeahead results (Figma "HP search auto complete"): a full-page list under
 * the header rather than a dropdown, each row quoted live and starrable
 * straight into the default watchlist.
 */
export function SearchResults({
  results,
  marketId,
  onPick,
}: {
  results: SearchResult[];
  marketId: string;
  onPick: () => void;
}) {
  const t = useTranslations('lists');
  const tn = useTranslations('nav');
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const symbols = results.map((r) => r.symbol);
  const { quotes } = useQuotes(symbols, 60_000);
  const { state, createList, patchList } = useWatchlists();
  const lists = state.status === 'data' ? state.lists : null;

  const inAny = (symbol: string) => Boolean(lists?.some((l) => l.symbols.includes(symbol)));
  const toggle = async (symbol: string) => {
    if (!lists) return;
    if (lists.length === 0) {
      const created = await createList(t('newList'));
      if (created) await patchList(created.id, { symbols: [symbol] });
      return;
    }
    const target = lists.find((l) => l.isDefault === 1) ?? lists[0];
    await patchList(target.id, {
      symbols: target.symbols.includes(symbol)
        ? target.symbols.filter((s) => s !== symbol)
        : [...target.symbols, symbol],
    });
  };

  if (results.length === 0) {
    return (
      <p className="px-6 py-4 text-sm text-muted-foreground">{tn('searchNoResults')}</p>
    );
  }

  return (
    <section className="flex flex-col gap-6 px-6 py-6">
      {results.map((r) => {
        const q = quotes[r.symbol];
        const starred = inAny(r.symbol);
        return (
          <div key={r.symbol} className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
            <Link href={`/stock/${r.symbol}`} onClick={onPick} className="flex min-w-0 flex-col">
              <span className="text-base font-bold text-foreground">
                {r.market ? displaySymbol(r.symbol, getMarket(r.market)) : r.symbol}
              </span>
              <span className="truncate text-xs text-foreground">{r.name}</span>
              <span className="text-xs text-foreground">{t('equity')}</span>
            </Link>
            <span className="flex shrink-0 items-center gap-6">
              <span className="flex flex-col items-end gap-0.5">
                {q && (
                  <span dir="ltr" className="text-sm font-bold text-foreground tabular-nums">
                    {fmtNum(q.price, nl)}
                  </span>
                )}
                {q && <ChangePill pct={q.changePct} numberLocale={nl} />}
              </span>
              <button
                type="button"
                aria-label={t('addTicker')}
                aria-pressed={starred}
                disabled={!lists}
                onClick={() => void toggle(r.symbol)}
              >
                <Star
                  className={starred ? 'size-6 text-primary' : 'size-6 text-faint'}
                  fill={starred ? 'currentColor' : 'none'}
                  aria-hidden
                />
              </button>
            </span>
          </div>
        );
      })}
    </section>
  );
}
