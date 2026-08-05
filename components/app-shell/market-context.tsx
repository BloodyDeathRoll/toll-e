'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { marketIds } from '@/src/markets/registry';

// The active market tab is a lens, not a data wall (arnakplan.md §2.2):
// it controls which indexes/portfolios/search results surface first.

interface MarketContextValue {
  marketId: string;
  setMarketId: (id: string) => void;
}

const MarketContext = createContext<MarketContextValue | null>(null);
const STORAGE_KEY = 'arnak.market';

export function MarketProvider({
  defaultMarketId = 'US',
  children,
}: {
  defaultMarketId?: string;
  children: React.ReactNode;
}) {
  const [marketId, setMarketId] = useState(defaultMarketId);

  // Hydrate the persisted tab after mount — localStorage isn't available on
  // the server, and reading it during render would mismatch SSR markup.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot rehydration
    if (stored && marketIds.includes(stored)) setMarketId(stored);
  }, []);

  const set = (id: string) => {
    setMarketId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <MarketContext.Provider value={{ marketId, setMarketId: set }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within MarketProvider');
  return ctx;
}
