'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { MarketMenu } from './market-menu';
import { useMarket } from './market-context';
import { SearchBox } from './search-box';
import { UserMenu } from './user-menu';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { SessionStatus } from '@/components/session-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { useIndexQuotes } from '@/components/use-market-data';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

// Home and Portfolio merged: '/' is the portfolio dashboard.
const links = [
  { href: '/', key: 'portfolio' },
  { href: '/markets', key: 'markets' },
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

        <SearchBox className="max-w-[420px] flex-1" />

        <div className="ms-auto flex items-center gap-3.5">
          <MarketMenu />
          <PrivacyToggle />
          <ThemeToggle />
          <UserMenu />
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
  // Live quotes overlay the demo placeholders as they arrive (Phase 1).
  const { quotes } = useIndexQuotes(marketId);

  return (
    <div className="flex h-[52px] items-center gap-8 border-b border-border bg-background px-7">
      {data.indexes.map((ix) => {
        const live = quotes[ix.symbol];
        const value = live?.price ?? ix.value;
        const pct = live?.changePct ?? ix.changePct;
        return (
          <div key={ix.symbol} className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">
              {locale === 'he' && ix.nameHe ? ix.nameHe : ix.name}
            </span>
            <span dir="ltr" className="text-sm text-foreground tabular-nums">
              {fmtNum(value, market.numberLocale)}
            </span>
            <span
              dir="ltr"
              className={cn('text-xs tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}
            >
              {fmtPct(pct, market.numberLocale)}
            </span>
          </div>
        );
      })}
      <SessionStatus marketId={marketId} className="ms-auto" />
    </div>
  );
}
