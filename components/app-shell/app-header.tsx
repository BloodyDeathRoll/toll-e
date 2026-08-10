'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChartLine, EyeOff, FileText, Gauge, List, Menu, Search, Shield, X } from 'lucide-react';
import { Link, useRouter } from '@/src/i18n/navigation';
import { LangCurrencyPicker } from './lang-currency';
import { useMarket } from './market-context';
import { SearchResults } from './search-results';
import { usePrivacy } from '@/components/use-privacy';
import { useSearch } from '@/components/use-market-data';
import { cn } from '@/lib/utils';

/**
 * Mobile global header (Components/header): hamburger menu and search pill.
 *
 * The language × display-currency selector belongs to the home screen alone
 * (`currency`); everywhere else the search takes that room. Typing slides the
 * selector out and opens the full-page typeahead over the screen, per the
 * "HP search auto complete" frame. Screens can add their own trailing control
 * via `action` (e.g. Watchlists' create button).
 */
export function AppHeader({
  action,
  currency = false,
}: {
  action?: React.ReactNode;
  currency?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { marketId } = useMarket();
  const { on: privacyOn, toggle: togglePrivacy } = usePrivacy();

  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const searching = query.trim().length > 0;
  const expanded = focused || searching;
  const results = useSearch(query, marketId).slice(0, 12);

  // Tax lives on the tab bar now, so the menu carries what the bar dropped.
  const menuItems = [
    { key: 'watchlists', href: '/watchlists', icon: List },
    { key: 'performance', href: '/performance', icon: Gauge },
    { key: 'markets', href: '/markets', icon: ChartLine },
  ] as const;
  const legalItems = [
    { key: 'privacy', href: '/privacy', icon: Shield },
    { key: 'terms', href: '/terms', icon: FileText },
  ] as const;

  return (
    <>
    <header className="flex items-center gap-4 p-6 md:hidden">
      <button type="button" aria-label={t('menu.open')} onClick={() => setMenuOpen(true)}>
        <Menu className="size-6 text-foreground" aria-hidden />
      </button>

      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          placeholder={t('nav.search')}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              setQuery('');
              router.push(`/stock/${encodeURIComponent(results[0].symbol)}`);
            }
            if (e.key === 'Escape') setQuery('');
          }}
          className="h-[43px] w-full rounded-[20px] bg-well ps-11 pe-3 text-base font-medium text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* The currency selector yields its room to a search in progress. */}
      {currency && !action && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            expanded ? 'w-0 opacity-0' : 'w-auto opacity-100',
          )}
          aria-hidden={expanded}
        >
          <LangCurrencyPicker />
        </div>
      )}
      {action}

      {/* Full-screen menu (HP menu frame) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background p-6">
          <div className="flex items-center justify-between">
            <button type="button" aria-label={t('menu.close')} onClick={() => setMenuOpen(false)}>
              <X className="size-6 text-foreground" aria-hidden />
            </button>
            <span className="text-xl font-bold tracking-tight text-foreground">
              toll-<span className="text-primary">e</span>
            </span>
          </div>
          <nav className="mt-12 flex flex-col gap-2">
            {menuItems.map(({ key, href, icon: Icon }) => (
              <Link
                key={key}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-4 py-3"
              >
                <Icon className="size-5 text-subtle" aria-hidden />
                <span className="text-base font-semibold text-foreground">{t(`menu.${key}`)}</span>
              </Link>
            ))}
            <button
              type="button"
              onClick={togglePrivacy}
              className="flex items-center gap-4 py-3 text-start"
            >
              <EyeOff className="size-5 text-subtle" aria-hidden />
              <span className="text-base font-semibold text-foreground">
                {t('menu.hideAmounts')}
                {privacyOn && <span className="ms-2 text-xs text-brand">{t('menu.privacyOn')}</span>}
              </span>
            </button>
            {legalItems.map(({ key, href, icon: Icon }) => (
              <Link
                key={key}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-4 py-3"
              >
                <Icon className="size-5 text-subtle" aria-hidden />
                <span className="text-base font-semibold text-foreground">{t(`menu.${key}`)}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>

    {/* Results stand in for the screen, as in the frame — not a dropdown. */}
    {searching && (
      <div className="fixed inset-x-0 bottom-0 top-[91px] z-40 overflow-y-auto bg-background md:hidden">
        <SearchResults
          results={results}
          marketId={marketId}
          onPick={() => {
            setQuery('');
            setFocused(false);
          }}
        />
      </div>
    )}
    </>
  );
}
