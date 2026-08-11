'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { usePathname } from '@/src/i18n/navigation';
import { authClient, useSession } from '@/lib/auth-client';
import { useMarket } from './market-context';
import { getMarket } from '@/src/markets/registry';
import { cn } from '@/lib/utils';

/**
 * language (flag) × market (currency symbol) rows, in design order. The
 * symbol picks the *market* — $ is the US portfolio and its indexes, ₪ the
 * Israeli one — so all four combinations are reachable: either portfolio in
 * either language.
 */
const combos = [
  { locale: 'en', market: 'US' },
  { locale: 'he', market: 'US' },
  { locale: 'en', market: 'IL' },
  { locale: 'he', market: 'IL' },
] as const;

const flagSrc = (locale: string) => (locale === 'he' ? '/flags/il.svg' : '/flags/us.svg');

/**
 * The design's language × market selector. It is the same pair of choices as
 * the Account page's Language and Default market rows, and writes the same
 * state, so the two controls never disagree. Language switches via a full
 * navigation — a client locale transition remounts the [locale] layout and
 * trips React's script-tag error on the init script.
 */
export function LangCurrencyPicker({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { marketId, setMarketId } = useMarket();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (combo: (typeof combos)[number]) => {
    setOpen(false);
    if (combo.market !== marketId) {
      setMarketId(combo.market); // persists the lens for this browser
      if (session) void authClient.updateUser({ defaultMarket: combo.market });
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
          'flex items-center gap-2 rounded-[20px] border border-border bg-well px-4',
          compact ? 'h-9 text-sm' : 'h-[48px] text-base',
        )}
      >
        <Image src={flagSrc(locale)} alt="" width={16} height={15} aria-hidden />
        <span className="text-foreground">{getMarket(marketId).currencySymbol}</span>
        <ChevronDown className="size-4 text-foreground" aria-hidden />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1.5 flex flex-col gap-[13px] rounded-[20px] bg-well p-6 shadow-lg">
          {combos.map((combo) => {
            const active = combo.locale === locale && combo.market === marketId;
            return (
              <button
                key={combo.locale + combo.market}
                type="button"
                onClick={() => pick(combo)}
                className="flex items-center justify-end gap-2"
              >
                {active && <Check className="size-4 text-foreground" aria-hidden />}
                <Image src={flagSrc(combo.locale)} alt="" width={16} height={15} aria-hidden />
                <span className="text-base text-foreground">
                  {getMarket(combo.market).currencySymbol}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
