'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaxPayload } from '@/src/server/tax';

// 'error' stays distinct from 'signed-out': only a 401 means signed out.
// See the note in use-portfolio.ts.
export type TaxState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'data'; data: TaxPayload };

/** The lens market's tax ledgers; 'empty' until a portfolio has sales. */
export function useTax(marketId: string) {
  const [state, setState] = useState<TaxState>({ status: 'loading' });
  // Same stale-response guard as usePortfolioPositions: the lens can change
  // while a request is in flight, and the loser must not write state.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    const apply = (next: TaxState) => {
      if (gen.current === mine) setState(next);
    };
    try {
      const res = await fetch(`/api/tax?market=${marketId}`);
      if (res.status === 401) {
        apply({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!json.portfolio || json.years.length === 0) {
        apply({ status: 'empty' });
        return;
      }
      apply({ status: 'data', data: json });
    } catch {
      if (gen.current === mine) {
        setState((s) => (s.status === 'loading' ? { status: 'error' } : s));
      }
    }
  }, [marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on market switch
    setState({ status: 'loading' });
    load();
  }, [load]);

  return { state, reload: load };
}
