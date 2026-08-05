'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PositionsPayload } from '@/src/server/portfolios';

// Client view of /api/positions: 'signed-out' | 'empty' (no portfolio or no
// positions yet) | live payload. Screens fall back to demo data outside the
// 'data' state so the app stays demoable without an account.

export type PortfolioState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'empty' }
  | {
      status: 'data';
      data: PositionsPayload & { portfolio: { id: string; name: string; taxRatePct: number } };
    };

export function usePortfolioPositions(marketId: string, refreshMs = 30_000) {
  const [state, setState] = useState<PortfolioState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/positions?market=${marketId}`);
      if (res.status === 401) {
        setState({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!json.portfolio || json.positions.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      setState({ status: 'data', data: json });
    } catch {
      // Keep whatever we had; a transient failure shouldn't flip the UI.
      setState((s) => (s.status === 'loading' ? { status: 'signed-out' } : s));
    }
  }, [marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on market switch
    setState({ status: 'loading' });
    load();
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  return { state, reload: load };
}

/** Ensure the user has a portfolio for this market; returns its id. */
export async function ensurePortfolioId(marketId: string): Promise<string> {
  const res = await fetch('/api/portfolios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ market: marketId, ensure: true }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('failed');
  const json = await res.json();
  return json.portfolio.id;
}
