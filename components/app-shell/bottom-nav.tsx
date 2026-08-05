'use client';

import { useTranslations } from 'next-intl';
import { ChartCandlestick, House, PiggyBank, Receipt } from 'lucide-react';
import { Link, usePathname } from '@/src/i18n/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/', key: 'home', icon: House },
  { href: '/markets', key: 'markets', icon: ChartCandlestick },
  { href: '/portfolio', key: 'portfolio', icon: PiggyBank },
  { href: '/tax', key: 'tax', icon: Receipt },
] as const;

/** Mobile bottom tab bar — hidden on md+ where the top navbar takes over. */
export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
      <ul className="flex h-16 items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, key, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={key} className="flex flex-1">
              <Link
                href={href}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 text-xs',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
