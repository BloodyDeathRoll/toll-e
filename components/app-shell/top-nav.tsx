'use client';

import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Link, usePathname } from '@/src/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { MarketTabs } from '@/components/app-shell/market-tabs';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', key: 'home' },
  { href: '/markets', key: 'markets' },
  { href: '/portfolio', key: 'portfolio' },
  { href: '/tax', key: 'tax' },
] as const;

/** Desktop top navbar — hidden below md where the bottom tab bar takes over. */
export function TopNav() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-background/95 backdrop-blur md:block">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {t('app.name')}
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {links.map(({ href, key }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  'transition-colors hover:text-foreground',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="relative ms-auto hidden max-w-xs flex-1 lg:block">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('nav.search')}
            className="h-9 w-full rounded-md border border-input bg-transparent ps-9 pe-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            // Wired to /api/market/search in Phase 1.
            disabled
          />
        </div>

        <MarketTabs />
        <LocaleSwitcher compact />
      </div>
    </header>
  );
}
