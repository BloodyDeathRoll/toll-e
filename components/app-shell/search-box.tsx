'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useMarket } from './market-context';
import { useSearch } from '@/components/use-market-data';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { cn } from '@/lib/utils';

/** Navbar typeahead: /api/market/search with active-market priority. */
export function SearchBox({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const router = useRouter();
  const { marketId } = useMarket();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const results = useSearch(query, marketId).slice(0, 8);

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
        className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        placeholder={t('search')}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0].symbol);
          if (e.key === 'Escape') setOpen(false);
        }}
        className="h-9 w-full rounded-lg border border-border bg-well ps-9 pe-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
      />
      {open && results.length > 0 && (
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
                <span className="flex-1 truncate text-[13px] text-muted-foreground">{r.name}</span>
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
