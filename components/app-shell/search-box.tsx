'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useMarket } from './market-context';
import { SearchResults } from './search-results';
import { suggest, useSearchScope } from './search-scope';
import { useSearch } from '@/components/use-market-data';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { cn } from '@/lib/utils';

/**
 * Navbar typeahead, scoped to the active market.
 *
 * `fullPageResults` (mobile screens): typing opens the full-page results
 * screen — the same one the home header opens — instead of a dropdown. Every
 * search looks the same wherever it starts; the dropdown stays only on the
 * desktop navbar, where a full-page takeover is not the layout's idiom.
 */
export function SearchBox({
  className,
  inputClassName,
  iconClassName,
  fullPageResults = false,
}: {
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
  fullPageResults?: boolean;
}) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const { marketId } = useMarket();
  const [globalQuery, setGlobalQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // On a ledger screen the box completes that screen's lines instead of
  // offering symbols to navigate to — same input, same navbar. See
  // ./search-scope.tsx.
  const { scope, query: scopedQuery, setQuery: setScopedQuery } = useSearchScope();
  const query = scope ? scopedQuery : globalQuery;
  const setQuery = scope ? setScopedQuery : setGlobalQuery;
  const results = useSearch(scope ? '' : query, marketId).slice(0, fullPageResults ? 12 : 8);
  const suggestions = scope ? suggest(scope.terms, query) : [];

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (symbol: string) => {
    setOpen(false);
    setQuery('');
    router.push(`/stock/${encodeURIComponent(symbol)}`);
  };

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <Search
        className={cn(
          'pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground',
          iconClassName,
        )}
        aria-hidden
      />
      <input
        type="search"
        value={query}
        placeholder={scope?.placeholder ?? t('search')}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // A scoped search has nowhere to go on Enter: its results are the
          // screen already under the box.
          if (e.key === 'Enter' && !scope && results[0]) go(results[0].symbol);
          if (e.key === 'Escape') setOpen(false);
        }}
        className={cn(
          'h-[48px] w-full rounded-lg border border-field bg-well ps-9 pe-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
          inputClassName,
        )}
      />
      {open && scope && suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  setQuery(s);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full px-4 py-2.5 text-start text-[13px] text-foreground hover:bg-accent',
                  i > 0 && 'border-t border-border',
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {fullPageResults && !scope && query.trim().length > 0 && (
        // Same takeover as the home header's (top-[88px] = this header's
        // height: 24px padding + 48px pill + 16px padding).
        <div className="app-frame fixed inset-x-0 bottom-0 top-[88px] z-40 overflow-y-auto bg-background">
          <SearchResults results={results} marketId={marketId} onPick={() => setQuery('')} />
        </div>
      )}

      {open && !scope && !fullPageResults && results.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
          {results.map((r, i) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => go(r.symbol)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-accent',
                  i > 0 && 'border-t border-border',
                )}
              >
                <span className="min-w-14 text-[13px] font-semibold text-foreground">
                  {r.market ? displaySymbol(r.symbol, getMarket(r.market)) : r.symbol}
                </span>
                <span className="flex-1 truncate text-[13px] text-muted-foreground">
                  {locale === 'he' ? (r.heName ?? r.name) : r.name}
                </span>
                {r.exchange && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                    {r.exchange}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
