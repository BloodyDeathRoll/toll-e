'use client';

import { useTranslations } from 'next-intl';
import { House, Percent, Plus, Repeat, User } from 'lucide-react';
import { HouseFilled } from '@/components/icons';
import { Link, usePathname } from '@/src/i18n/navigation';
import { useSession } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

const leftTabs = [
  { href: '/', key: 'home', icon: House },
  { href: '/transactions', key: 'transactions', icon: Repeat },
] as const;

const rightTabs = [
  { href: '/tax', key: 'tax', icon: Percent },
  { href: '/settings', key: 'account', icon: User },
] as const;

/**
 * Full-page flows: each ends in its own single action — Save a transaction,
 * Save a list — and the bar has no business competing with it, or offering a
 * way out of a half-filled form. The tab bar is for the app's four screens;
 * these get an ActionBar in the same place instead.
 */
const OWN_ACTION = ['/transactions/new', '/watchlists/new'];

/** Does this screen show the tab bar, rather than its own action bar? */
export function reservesBottomNav(pathname: string): boolean {
  return !OWN_ACTION.some((p) => pathname.startsWith(p));
}

/** Mobile bottom tab bar (Components/bottomNav) — hidden on md+. */
export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const hydrated = useHydrated();

  // The signed-out screen is a bare sign-in wall: no app chrome. The bar is
  // held back one render so it matches the server's HTML — see useHydrated.
  if (!hydrated || isPending || !session) return null;
  if (!reservesBottomNav(pathname)) return null;

  // On Watchlists the centre button makes a list rather than a transaction,
  // matching the plus in that screen's header.
  const newHref = pathname.startsWith('/watchlists') ? '/watchlists/new' : '/transactions/new';

  const renderTab = ({
    href,
    key,
    icon: Icon,
  }: (typeof leftTabs | typeof rightTabs)[number]) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <li key={key} className="flex flex-1">
        <Link
          href={href}
          className="flex flex-1 flex-col items-center justify-end gap-0.5"
        >
          {active && key === 'home' ? (
            <HouseFilled className="size-6 text-primary" />
          ) : (
            <Icon
              className={cn('size-6', active ? 'text-primary' : 'text-foreground/70')}
              fill={active && key === 'account' ? 'currentColor' : 'none'}
              aria-hidden
            />
          )}
          <span className={cn('text-xs', active ? 'text-brand' : 'text-foreground')}>
            {t(key)}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <nav className="app-frame fixed inset-x-0 bottom-0 z-40 bg-card md:hidden">
      <ul className="flex items-end gap-4 px-6 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        {leftTabs.map(renderTab)}
        {/* The centre slot is empty in the bar; the button floats over it. */}
        <li className="h-[41px] flex-1" aria-hidden />
        {rightTabs.map(renderTab)}
      </ul>
      {/* Sits on the bar and breaks its top edge by 12px, label-less. */}
      <Link
        href={newHref}
        aria-label={t('new')}
        className="absolute -top-3 start-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary rtl:translate-x-1/2"
      >
        <Plus className="size-6 text-primary-foreground" aria-hidden />
      </Link>
    </nav>
  );
}
