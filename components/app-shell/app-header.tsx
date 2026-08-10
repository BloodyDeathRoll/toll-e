'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChartLine, EyeOff, FileText, Gauge, Menu, Percent, X } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { LangCurrencyPicker } from './lang-currency';
import { SearchBox } from './search-box';
import { usePrivacy } from '@/components/use-privacy';

/**
 * Mobile global header (Components/header): hamburger menu, search pill,
 * and the language × display-currency selector. Screens can swap the
 * selector for their own trailing control via `action` (e.g. Watchlists'
 * create button).
 */
export function AppHeader({ action }: { action?: React.ReactNode }) {
  const t = useTranslations();
  const { on: privacyOn, toggle: togglePrivacy } = usePrivacy();

  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = [
    { key: 'taxView', href: '/tax', icon: Percent },
    { key: 'performance', href: '/performance', icon: Gauge },
    { key: 'markets', href: '/markets', icon: ChartLine },
  ] as const;

  return (
    <header className="flex items-center gap-4 p-6 md:hidden">
      <button type="button" aria-label={t('menu.open')} onClick={() => setMenuOpen(true)}>
        <Menu className="size-6 text-foreground" aria-hidden />
      </button>

      <SearchBox
        className="min-w-0 flex-1"
        inputClassName="h-[43px] rounded-[20px] border-none bg-well ps-11 text-base font-medium"
        iconClassName="start-4 size-4"
      />

      {/* Language × currency (or a screen-specific action) */}
      {action ?? <LangCurrencyPicker />}

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
                {t('menu.privacy')}
                {privacyOn && <span className="ms-2 text-xs text-brand">{t('menu.privacyOn')}</span>}
              </span>
            </button>
            <div aria-disabled className="flex items-center gap-4 py-3 opacity-40">
              <FileText className="size-5 text-subtle" aria-hidden />
              <span className="text-base font-semibold text-foreground">{t('menu.terms')}</span>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
