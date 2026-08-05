'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Link, usePathname } from '@/src/i18n/navigation';
import { MarketMenu } from './market-menu';
import { useMarket } from './market-context';
import { SessionStatus } from '@/components/session-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', key: 'home' },
  { href: '/markets', key: 'markets' },
  { href: '/portfolio', key: 'portfolio' },
  { href: '/tax', key: 'tax' },
  { href: '/watchlists', key: 'watchlists' },
] as const;

/** Desktop top navbar + index strip — hidden below md (bottom tab bar takes over). */
export function TopNav() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden md:block">
      <div className="flex h-[60px] items-center gap-7 border-b border-border bg-card px-7">
        <Link href="/" className="text-[19px] font-bold tracking-tight text-foreground">
          {t('app.name')}
        </Link>

        <nav className="flex items-center gap-[22px] text-sm">
          {links.map(({ href, key }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  'py-[19px] transition-colors hover:text-foreground',
                  active
                    ? 'border-b-2 border-brand font-semibold text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="relative max-w-[420px] flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('nav.search')}
            className="h-9 w-full rounded-lg border border-border bg-well ps-9 pe-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
            // Wired to /api/market/search in Phase 1.
            disabled
          />
        </div>

        <div className="ms-auto flex items-center gap-3.5">
          <MarketMenu />
          <ThemeToggle />
          <span className="flex size-[30px] items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
            AN
          </span>
        </div>
      </div>

      <IndexStrip />
    </header>
  );
}

function IndexStrip() {
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const data = demo[marketId];

  return (
    <div className="flex h-[52px] items-center gap-8 border-b border-border bg-background px-7">
      {data.indexes.map((ix) => (
        <div key={ix.symbol} className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">
            {locale === 'he' && ix.nameHe ? ix.nameHe : ix.name}
          </span>
          <span dir="ltr" className="text-sm text-foreground tabular-nums">
            {fmtNum(ix.value, market.numberLocale)}
          </span>
          <span
            dir="ltr"
            className={cn('text-xs tabular-nums', ix.changePct >= 0 ? 'text-gain' : 'text-loss')}
          >
            {fmtPct(ix.changePct, market.numberLocale)}
          </span>
        </div>
      ))}
      <SessionStatus marketId={marketId} className="ms-auto" />
    </div>
  );
}
