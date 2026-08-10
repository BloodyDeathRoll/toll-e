'use client';

import { useTranslations } from 'next-intl';
import { House, Percent, Plus, Repeat, User } from 'lucide-react';
import { HouseFilled } from '@/components/icons';
import { Link, usePathname } from '@/src/i18n/navigation';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const leftTabs = [
  { href: '/', key: 'home', icon: House },
  { href: '/transactions', key: 'transactions', icon: Repeat },
] as const;

const rightTabs = [
  { href: '/tax', key: 'tax', icon: Percent },
  { href: '/settings', key: 'account', icon: User },
] as const;

/** Mobile bottom tab bar (Components/bottomNav) — hidden on md+. */
export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  // The signed-out screen is a bare sign-in wall: no app chrome.
  if (isPending || !session) return null;

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
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-background md:hidden">
      <ul className="flex items-end gap-4 px-6 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]">
        {leftTabs.map(renderTab)}
        <li className="flex flex-1">
          <Link
            href="/transactions/new"
            className="flex flex-1 flex-col items-center gap-0.5"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary">
              <Plus className="size-6 text-primary-foreground" aria-hidden />
            </span>
            <span className="text-xs text-foreground">{t('new')}</span>
          </Link>
        </li>
        {rightTabs.map(renderTab)}
      </ul>
    </nav>
  );
}
