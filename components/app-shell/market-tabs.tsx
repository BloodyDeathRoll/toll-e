'use client';

import { useTranslations } from 'next-intl';
import { markets } from '@/src/markets/registry';
import { useMarket } from '@/components/app-shell/market-context';
import { cn } from '@/lib/utils';

/**
 * The market lens switch (US $ ↔ IL ₪) — registry-driven: renders one tab
 * per market entry, no market-specific code.
 */
export function MarketTabs() {
  const t = useTranslations('market');
  const { marketId, setMarketId } = useMarket();

  return (
    <div role="tablist" className="flex rounded-lg border border-border p-0.5 text-sm">
      {Object.values(markets).map((m) => (
        <button
          key={m.id}
          role="tab"
          type="button"
          aria-selected={marketId === m.id}
          onClick={() => setMarketId(m.id)}
          className={cn(
            'rounded-md px-3 py-1 transition-colors',
            marketId === m.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(m.id)} <span className="opacity-70">{m.currencySymbol}</span>
        </button>
      ))}
    </div>
  );
}
