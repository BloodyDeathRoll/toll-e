'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { MarketMenu } from './market-menu';
import { useMarket } from './market-context';
import { SearchBox } from './search-box';
import { UserMenu } from './user-menu';
import { Logo } from '@/components/logo';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { SessionStatus } from '@/components/session-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChangePill } from '@/components/quote-bits';
import { useIndexQuotes } from '@/components/use-market-data';
import { useSession } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

// Home and Portfolio merged: '/' is the portfolio dashboard.
const links = [
  { href: '/', key: 'portfolio' },
  { href: '/markets', key: 'markets' },
  { href: '/performance', key: 'performance' },
  { href: '/tax', key: 'tax' },
  { href: '/watchlists', key: 'watchlists' },
] as const;

/** Desktop top navbar + index strip — hidden below md (bottom tab bar takes over). */
export function TopNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const hydrated = useHydrated();

  // The signed-out screen is a bare sign-in wall: no app chrome. The navbar
  // is held back one render so it matches the server's HTML — see useHydrated.
  if (!hydrated || isPending || !session) return null;

  return (
    <header className="sticky top-0 z-40 hidden md:block">
      <div className="flex h-16 items-center gap-7 border-b border-border bg-background px-7">
        <Link href="/" aria-label={t('app.name')}>
          <Logo width={71} height={21} />
        </Link>

        <nav className="flex items-center gap-1 text-[15px] font-medium">
          {links.map(({ href, key }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  'border-b-2 px-3 py-[19px] transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>

        <SearchBox
          className="max-w-[420px] flex-1"
          inputClassName="h-10 rounded-[20px] border-none bg-well ps-10 text-sm font-medium"
          iconClassName="start-4 size-4"
        />

        {/* Market only. Language is not a header control any more — it is set
            at the onboarding gate and changed from Account, so the chrome
            never offers two ways to move the same setting. */}
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
          <div key={ix.symbol} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {locale === 'he' && ix.nameHe ? ix.nameHe : ix.name}
            </span>
            <span dir="ltr" className="text-sm font-medium text-foreground tabular-nums">
              {fmtNum(value, market.numberLocale)}
            </span>
            <ChangePill pct={pct} numberLocale={market.numberLocale} className="text-xs" />
          </div>
        );
      })}
      <SessionStatus marketId={marketId} className="ms-auto" />
    </div>
  );
}
