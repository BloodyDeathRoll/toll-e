'use client';

import { useTranslations } from 'next-intl';
import { ChartCandlestick, House, LayoutGrid, List, Percent } from 'lucide-react';
import { Link, usePathname } from '@/src/i18n/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/', key: 'home', icon: House },
  { href: '/markets', key: 'markets', icon: ChartCandlestick },
  { href: '/portfolio', key: 'portfolio', icon: LayoutGrid },
  { href: '/tax', key: 'tax', icon: Percent },
  { href: '/watchlists', key: 'lists', icon: List },
] as const;

/** Mobile bottom tab bar — hidden on md+ where the top navbar takes over. */
export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/90 backdrop-blur-lg md:hidden">
      <ul className="flex h-[72px] items-stretch justify-around px-1.5 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, key, icon: Icon }) => {
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
        })}
      </ul>
    </nav>
  );
}
