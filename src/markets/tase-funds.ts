import funds from './tase-funds.json';
import { isTaseFund, taseFundSymbol } from './registry';
import type { SearchResult } from '@/src/market-data/types';

// Israeli mutual funds (docs/mutual-funds-plan.md): named from the shipped
// catalogue, quoted daily via the Maya adapter — never Yahoo. Pure TS, no
// network, same stance as tase-search.ts.

export interface TaseFundEntry {
  /** TASE fund id — also the symbol's base: '5118674' ↔ '5118674.TA'. */
  id: string;
  name: string;
  heName: string;
  isin?: string;
}

const entries = funds as TaseFundEntry[];
const byId = new Map(entries.map((e) => [e.id, e]));

export function taseFundName(symbol: string, hebrew: boolean): string | undefined {
  if (!isTaseFund(symbol)) return undefined;
  const e = byId.get(symbol.slice(0, -'.TA'.length));
  return e ? (hebrew ? e.heName : e.name) : undefined;
}

/**
 * Fund-name search for the IL lens. A fund is found by either name, its id,
 * or its ISIN — brokers' users search by classification words ("אנרגיה
 * ירוקה"), which live inside fund names. Ranked like the securities search:
 * prefix beats substring.
 */
export function searchTaseFunds(query: string, limit = 6): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: Array<{ e: TaseFundEntry; s: number }> = [];
  for (const e of entries) {
    const name = e.name.toLowerCase();
    let s = 0;
    if (e.id === q || e.isin === q.toUpperCase()) s = 3;
    else if (name.startsWith(q) || e.heName.startsWith(q)) s = 2;
    else if (name.includes(q) || e.heName.includes(q)) s = 1;
    if (s > 0) scored.push({ e, s });
  }
  return scored
    .sort((a, b) => b.s - a.s || a.e.heName.localeCompare(b.e.heName))
    .slice(0, limit)
    .map(({ e }) => ({
      symbol: taseFundSymbol(e.id),
      name: /[֐-׿]/.test(query) ? e.heName : e.name,
      exchange: 'Tel Aviv',
      type: 'FUND',
      market: 'IL',
    }));
}
