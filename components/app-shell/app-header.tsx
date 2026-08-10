'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import {
  Check,
  ChartLine,
  ChevronDown,
  EyeOff,
  FileText,
  Gauge,
  Menu,
  Percent,
  X,
} from 'lucide-react';
import { Link, usePathname } from '@/src/i18n/navigation';
import { SearchBox } from './search-box';
import { usePrivacy } from '@/components/use-privacy';
import { authClient, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const CURRENCY_KEY = 'toll-e.currency';

const currencyLabel: Record<string, string> = { USD: '$USD', ILS: '₪NIS' };

/** language (flag) × display currency rows, in design order. */
const combos = [
  { locale: 'en', currency: 'USD' },
  { locale: 'he', currency: 'USD' },
  { locale: 'en', currency: 'ILS' },
  { locale: 'he', currency: 'ILS' },
] as const;

const flagSrc = (locale: string) => (locale === 'he' ? '/flags/il.svg' : '/flags/us.svg');

/**
 * Mobile global header (Components/header): hamburger menu, search pill,
 * and the language × display-currency selector. Screens can swap the
 * selector for their own trailing control via `action` (e.g. Watchlists'
 * create button).
 */
export function AppHeader({ action }: { action?: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { on: privacyOn, toggle: togglePrivacy } = usePrivacy();

  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Signed-in preference wins; localStorage keeps the choice for guests.
  const userCurrency = (session?.user as { displayCurrency?: string } | undefined)?.displayCurrency;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate stored preference
    setCurrency(userCurrency ?? localStorage.getItem(CURRENCY_KEY) ?? 'USD');
  }, [userCurrency]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (combo: (typeof combos)[number]) => {
    setPickerOpen(false);
    if (combo.currency !== currency) {
      setCurrency(combo.currency);
      localStorage.setItem(CURRENCY_KEY, combo.currency);
      if (session) void authClient.updateUser({ displayCurrency: combo.currency });
      window.dispatchEvent(new CustomEvent('toll-e:currency', { detail: combo.currency }));
    }
    if (combo.locale !== locale) {
      // Full navigation, not a client transition: switching locale remounts
      // the [locale] layout, and React refuses to re-run its init <script>
      // (console error). A hard load also re-applies dir/lang cleanly.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload is the point
      window.location.assign(`/${combo.locale}${pathname === '/' ? '' : pathname}`);
    }
  };

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
      {action}
      <div ref={pickerRef} className={cn('relative shrink-0', action && 'hidden')}>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="flex h-[43px] items-center gap-2 rounded-[20px] bg-well px-4"
        >
          <Image src={flagSrc(locale)} alt="" width={16} height={15} aria-hidden />
          <span className="text-base text-foreground">{currencyLabel[currency] ?? currency}</span>
          <ChevronDown className="size-4 text-foreground" aria-hidden />
        </button>
        {pickerOpen && (
          <div className="absolute end-0 top-full z-50 mt-1.5 flex flex-col gap-[13px] rounded-[20px] bg-well p-6 shadow-lg">
            {combos.map((combo) => {
              const active = combo.locale === locale && combo.currency === currency;
              return (
                <button
                  key={combo.locale + combo.currency}
                  type="button"
                  onClick={() => pick(combo)}
                  className="flex items-center justify-end gap-2"
                >
                  {active && <Check className="size-4 text-foreground" aria-hidden />}
                  <Image src={flagSrc(combo.locale)} alt="" width={16} height={15} aria-hidden />
                  <span className="text-base text-foreground">{currencyLabel[combo.currency]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

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
