'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth-client';
import { useMarket } from './market-context';
import { getMarket, marketIds } from '@/src/markets/registry';
import { cn } from '@/lib/utils';

/**
 * The header's market lens, as a flag.
 *
 * This control used to pick language × market as one four-way choice, which
 * conflated two unrelated things: the flag read as "language" while the
 * currency symbol beside it read as "market", and switching either moved
 * both. A flag is now unambiguously the *market* — the portfolio, indexes and
 * search priority you are looking at — and language is set once at the
 * onboarding gate and changed only from the Account screen.
 *
 * It writes the same state as Account's Default market row, so the two
 * controls never disagree.
 */
export function MarketPicker({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('market');
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

  const pick = (id: string) => {
    setOpen(false);
    if (id === marketId) return;
    setMarketId(id); // persists the lens for this browser
    if (session) void authClient.updateUser({ defaultMarket: id });
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t(`nationality.${marketId as 'US' | 'IL'}`)}
        className={cn(
          'flex items-center gap-2 rounded-[20px] border border-field bg-well px-4',
          compact ? 'h-9' : 'h-[48px]',
        )}
      >
        <Image src={getMarket(marketId).flag} alt="" width={16} height={15} aria-hidden />
        <ChevronDown className="size-4 text-foreground" aria-hidden />
      </button>
      {open && (
        // The menu names each market — the trigger can be flags-only because
        // the list, opened once, is what teaches which flag is which.
        <div className="absolute end-0 top-full z-50 mt-1.5 flex min-w-[160px] flex-col gap-[13px] rounded-[20px] bg-well p-5 shadow-lg">
          {marketIds.map((id) => {
            const active = id === marketId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className="flex items-center gap-2.5"
              >
                <Image src={getMarket(id).flag} alt="" width={16} height={15} aria-hidden />
                <span className="flex-1 text-start text-base text-foreground">
                  {t(`nationality.${id as 'US' | 'IL'}`)}
                </span>
                {active && <Check className="size-4 text-foreground" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
