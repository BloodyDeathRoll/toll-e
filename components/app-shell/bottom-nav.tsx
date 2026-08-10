'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeftRight, CircleUser, House, List, Plus } from 'lucide-react';
import { Link, usePathname } from '@/src/i18n/navigation';
import { cn } from '@/lib/utils';

const leftTabs = [
  { href: '/', key: 'home', icon: House },
  { href: '/transactions', key: 'transactions', icon: ArrowLeftRight },
] as const;

const rightTabs = [
  { href: '/watchlists', key: 'lists', icon: List },
  { href: '/settings', key: 'account', icon: CircleUser },
] as const;

/** Mobile bottom tab bar — hidden on md+ where the top navbar takes over. */
export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

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
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 text-[11px]',
            active ? 'font-semibold text-brand' : 'text-muted-foreground',
          )}
        >
          <Icon className="size-[17px]" aria-hidden />
          {t(key)}
        </Link>
      </li>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/90 backdrop-blur-lg md:hidden">
      <ul className="flex h-[72px] items-stretch justify-around px-1.5 pb-[env(safe-area-inset-bottom)]">
        {leftTabs.map(renderTab)}
        <li className="relative flex flex-1">
          <Link
            href="/transactions/new"
            aria-label={t('addTransaction')}
            className="absolute inset-x-0 -top-5 mx-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Plus className="size-7" aria-hidden />
          </Link>
        </li>
        {rightTabs.map(renderTab)}
      </ul>
    </nav>
  );
}
