'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { usePathname } from '@/src/i18n/navigation';
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
 * The design's language × display-currency selector (flag + $USD/₪NIS pill).
 * Currency persists to the account (localStorage for guests); language
 * switches via a full navigation — a client locale transition remounts the
 * [locale] layout and trips React's script-tag error on the init script.
 */
export function LangCurrencyPicker({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const ref = useRef<HTMLDivElement>(null);

  // Signed-in preference wins; localStorage keeps the choice for guests.
  const userCurrency = (session?.user as { displayCurrency?: string } | undefined)?.displayCurrency;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate stored preference
    setCurrency(userCurrency ?? localStorage.getItem(CURRENCY_KEY) ?? 'USD');
  }, [userCurrency]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (combo: (typeof combos)[number]) => {
    setOpen(false);
    if (combo.currency !== currency) {
      setCurrency(combo.currency);
      localStorage.setItem(CURRENCY_KEY, combo.currency);
      if (session) void authClient.updateUser({ displayCurrency: combo.currency });
      window.dispatchEvent(new CustomEvent('toll-e:currency', { detail: combo.currency }));
    }
    if (combo.locale !== locale) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload is the point
      window.location.assign(`/${combo.locale}${pathname === '/' ? '' : pathname}`);
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-[20px] bg-well px-4',
          compact ? 'h-9 text-sm' : 'h-[43px] text-base',
        )}
      >
        <Image src={flagSrc(locale)} alt="" width={16} height={15} aria-hidden />
        <span className="text-foreground">{currencyLabel[currency] ?? currency}</span>
        <ChevronDown className="size-4 text-foreground" aria-hidden />
      </button>
      {open && (
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
  );
}
