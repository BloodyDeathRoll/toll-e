'use client';

import { useCallback, useEffect, useState } from 'react';

export interface WatchlistData {
  id: string;
  name: string;
  symbols: string[];
  isDefault: number;
}

// 'error' stays distinct from 'signed-out' — see the note in use-portfolio.ts.
export type WatchlistsState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error' }
  | { status: 'data'; lists: WatchlistData[] };

export function useWatchlists() {
  const [state, setState] = useState<WatchlistsState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlists');
      if (res.status === 401) {
        setState({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setState({ status: 'data', lists: json.watchlists });
    } catch {
      setState((s) => (s.status === 'loading' ? { status: 'error' } : s));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount
    reload();
  }, [reload]);

  const createList = async (name: string): Promise<WatchlistData | null> => {
    const res = await fetch('/api/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    await reload();
    return json.watchlist;
  };

  const patchList = async (id: string, patch: { name?: string; symbols?: string[] }) => {
    await fetch(`/api/watchlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await reload();
  };

  const deleteList = async (id: string) => {
    await fetch(`/api/watchlists/${id}`, { method: 'DELETE' });
    await reload();
  };

  return { state, reload, createList, patchList, deleteList };
}
