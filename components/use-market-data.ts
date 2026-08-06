'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChartRange,
  ChartSeries,
  FxRate,
  NewsItem,
  Quote,
  SearchResult,
  StockAnalysis,
  StockFinancials,
  Summary,
} from '@/src/market-data/types';

// Client-side polling against /api/market/* (server-side provider + cache).
// Errors surface as `stale: true` — callers keep showing the last good value.

interface FetchState<T> {
  data?: T;
  stale: boolean;
}

function useJson<T>(url: string | null, refreshMs?: number): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ stale: false });
  const dataRef = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (!url) return;
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as T;
        if (!live) return;
        dataRef.current = json;
        setState({ data: json, stale: false });
      } catch {
        if (live) setState({ data: dataRef.current, stale: true });
      }
    };
    load();
    if (refreshMs) {
      const id = setInterval(load, refreshMs);
      return () => {
        live = false;
        clearInterval(id);
      };
    }
    return () => {
      live = false;
    };
  }, [url, refreshMs]);

  return state;
}

/** Live quotes keyed by symbol, polled while mounted. */
export function useQuotes(symbols: string[], refreshMs = 30_000) {
  const key = symbols.join(',');
  const { data, stale } = useJson<{ quotes: Quote[] }>(
    symbols.length ? `/api/market/quote?symbols=${encodeURIComponent(key)}` : null,
    refreshMs,
  );
  const bySymbol = useMemo(() => {
    const map: Record<string, Quote> = {};
    for (const q of data?.quotes ?? []) map[q.symbol] = q;
    return map;
  }, [data]);
  return { quotes: bySymbol, stale };
}

/** The active market's index quotes, polled while mounted. */
export function useIndexQuotes(marketId: string, refreshMs = 30_000) {
  const { data, stale } = useJson<{ quotes: Quote[] }>(
    `/api/market/indexes?market=${marketId}`,
    refreshMs,
  );
  const bySymbol = useMemo(() => {
    const map: Record<string, Quote> = {};
    for (const q of data?.quotes ?? []) map[q.symbol] = q;
    return map;
  }, [data]);
  return { quotes: bySymbol, stale };
}

export function useChart(symbol: string, range: ChartRange) {
  return useJson<ChartSeries>(
    `/api/market/chart/${encodeURIComponent(symbol)}?range=${range}`,
  );
}

/** Chart series for several symbols at once, keyed by symbol. */
export function useCharts(symbols: string[], range: ChartRange) {
  const key = symbols.join(',');
  const [charts, setCharts] = useState<Record<string, ChartSeries>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        key.split(',').map(async (s) => {
          try {
            const res = await fetch(`/api/market/chart/${encodeURIComponent(s)}?range=${range}`);
            if (!res.ok) return null;
            return [s, (await res.json()) as ChartSeries] as const;
          } catch {
            return null;
          }
        }),
      );
      if (alive) {
        setCharts(Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => e !== null)));
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, range]);
  return charts;
}

export function useSummary(symbol: string) {
  return useJson<Summary>(`/api/market/summary/${encodeURIComponent(symbol)}`);
}

/** Symbol-tagged headlines; `enabled` defers the fetch until the tab opens. */
export function useNews(symbol: string, enabled = true) {
  return useJson<{ news: NewsItem[] }>(
    enabled ? `/api/market/news/${encodeURIComponent(symbol)}` : null,
  );
}

export function useAnalysis(symbol: string, enabled = true) {
  return useJson<StockAnalysis>(
    enabled ? `/api/market/analysis/${encodeURIComponent(symbol)}` : null,
  );
}

export function useFinancials(symbol: string, enabled = true) {
  return useJson<StockFinancials>(
    enabled ? `/api/market/financials/${encodeURIComponent(symbol)}` : null,
  );
}

/** Daily FX rate (server persists it to fx_rates). */
export function useFx(pair: string) {
  return useJson<FxRate>(`/api/market/fx?pair=${pair}`);
}

/** Debounced typeahead search, active-market results first. */
export function useSearch(query: string, marketId: string) {
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const { data } = useJson<{ results: SearchResult[] }>(
    debounced.length >= 1
      ? `/api/market/search?q=${encodeURIComponent(debounced)}&market=${marketId}`
      : null,
  );
  return debounced.length >= 1 ? (data?.results ?? []) : [];
}
