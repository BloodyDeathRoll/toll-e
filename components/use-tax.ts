'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TaxPayload } from '@/src/server/tax';

export type TaxState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'empty' }
  | { status: 'data'; data: TaxPayload };

/** The lens market's tax ledgers; 'empty' until a portfolio has sales. */
export function useTax(marketId: string) {
  const [state, setState] = useState<TaxState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tax?market=${marketId}`);
      if (res.status === 401) {
        setState({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!json.portfolio || json.years.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      setState({ status: 'data', data: json });
    } catch {
      setState((s) => (s.status === 'loading' ? { status: 'signed-out' } : s));
    }
  }, [marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on market switch
    setState({ status: 'loading' });
    load();
  }, [load]);

  return { state, reload: load };
}
