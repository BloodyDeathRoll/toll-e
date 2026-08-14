'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PositionsPayload } from '@/src/server/portfolios';

// Client view of /api/positions: 'signed-out' | 'error' | 'empty' (no
// portfolio or no positions yet) | live payload. Screens fall back to demo
// data outside the 'data' state so the app stays demoable without an account.
//
// 'error' is separate from 'signed-out' on purpose, and the distinction is
// load-bearing: only a 401 means signed out. Folding every failure into
// 'signed-out' once put the Google sign-in wall in front of a signed-in user
// because a deploy had outrun its migration and this endpoint was returning
// 500 — the app told them to log in, and logging in changed nothing.

export type PortfolioState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error' }
  | { status: 'empty' }
  | {
      status: 'data';
      data: PositionsPayload & { portfolio: { id: string; name: string; taxRatePct: number } };
    };

export function usePortfolioPositions(marketId: string, refreshMs = 30_000) {
  const [state, setState] = useState<PortfolioState>({ status: 'loading' });
  // The lens hydrates from localStorage a beat after mount, so a request for
  // the previous market is often still in flight when the new one starts.
  // Only the newest request may write state, or the old market's positions
  // land under the new market's currency.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    const apply = (next: PortfolioState) => {
      if (gen.current === mine) setState(next);
    };
    try {
      const res = await fetch(`/api/positions?market=${marketId}`);
      if (res.status === 401) {
        apply({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!json.portfolio || json.positions.length === 0) {
        apply({ status: 'empty' });
        return;
      }
      apply({ status: 'data', data: json });
    } catch {
      // Keep whatever we had; a transient failure shouldn't flip the UI.
      if (gen.current === mine) {
        setState((s) => (s.status === 'loading' ? { status: 'error' } : s));
      }
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
