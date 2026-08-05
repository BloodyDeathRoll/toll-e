'use client';

import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { useMarket } from './market-context';
import { getMarket } from '@/src/markets/registry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Market is a dropdown, not a two-tab — built to add currencies. Picking a
// market also switches the app language: ILS ⇒ Hebrew RTL, USD ⇒ English.
const marketLocale: Record<string, 'en' | 'he'> = { US: 'en', IL: 'he' };

export function MarketMenu() {
  const t = useTranslations('market');
  const { marketId, setMarketId } = useMarket();
  const market = getMarket(marketId);
  const router = useRouter();
  const pathname = usePathname();

  const pick = (id: string) => {
    setMarketId(id);
    router.replace(pathname, { locale: marketLocale[id] ?? 'en' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 outline-none data-[state=open]:border-primary data-[state=open]:ring-[3px] data-[state=open]:ring-primary/20">
        <span dir="ltr" className="text-[13px] font-semibold text-foreground">
          {market.currencySymbol} {market.currency}
        </span>
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[250px] rounded-xl p-0">
        <DropdownMenuLabel className="px-4 pt-3 pb-2 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('menuTitle')}
        </DropdownMenuLabel>
        {(['US', 'IL'] as const).map((id) => {
          const m = getMarket(id);
          const active = id === marketId;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => pick(id)}
              className={cn(
                'gap-3 rounded-none border-t border-border px-4 py-2.5',
                active && 'bg-accent',
              )}
            >
              <span className="w-6 text-center text-[15px] text-foreground">{m.currencySymbol}</span>
              <span className="flex flex-1 flex-col gap-px">
                <span className="text-sm font-semibold text-foreground">{t(id)}</span>
                <span className="text-xs text-muted-foreground">{t(`${id}lang`)}</span>
              </span>
              {active && <Check className="size-3.5 text-brand" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem disabled className="gap-3 rounded-none border-t border-border px-4 py-2.5">
          <span className="w-6 text-center text-[15px] text-foreground">€</span>
          <span className="flex flex-1 flex-col gap-px">
            <span className="text-sm font-semibold text-foreground">{t('EU')}</span>
            <span className="text-xs text-muted-foreground">{t('comingSoon')}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="gap-3 rounded-none border-t border-border bg-well px-4 py-3 data-[disabled]:opacity-100">
          <Plus className="w-6 size-4 text-brand" aria-hidden />
          <span className="text-sm font-semibold text-brand">{t('addMarket')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
