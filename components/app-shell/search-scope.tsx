'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Search that belongs to the screen under it.
 *
 * The search input is chrome — the same pill on the mobile header and the same
 * box on the desktop navbar, whatever is on screen — and everywhere else it
 * answers with symbols, which is what "search" means on a market app. On a
 * screen that is itself a ledger it does not: someone typing on Activity or
 * Tax is looking for a line in the list they are already reading, and a
 * typeahead full of tickers to navigate away to is an answer to a question
 * nobody asked.
 *
 * So a ledger screen registers its own vocabulary here — every term its lines
 * contain — and for as long as it is mounted the input completes from that and
 * hands the typed query back for the screen to filter with. Unmounting restores
 * the global typeahead; nothing else has to know which screen is up.
 */
const SEP = '\u0000';

interface Scope {
  /** Every term the screen's lines contain — the autocomplete vocabulary. */
  terms: string[];
  placeholder?: string;
}

const SearchScopeContext = createContext<{
  scope: Scope | null;
  setScope: (s: Scope | null) => void;
  query: string;
  setQuery: (q: string) => void;
} | null>(null);

export function SearchScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [query, setQuery] = useState('');
  const value = useMemo(() => ({ scope, setScope, query, setQuery }), [scope, query]);
  return <SearchScopeContext.Provider value={value}>{children}</SearchScopeContext.Provider>;
}

/** The search inputs' side: what to complete from, and what has been typed. */
export function useSearchScope() {
  const ctx = useContext(SearchScopeContext);
  return (
    ctx ?? {
      scope: null,
      setScope: () => {},
      query: '',
      setQuery: () => {},
    }
  );
}

/**
 * The screen's side: register a vocabulary, read back what was typed.
 *
 * Terms are compared by value rather than identity, so a screen may rebuild
 * the list on every render — which it will, since the list comes from the rows
 * it is rendering. Registering does NOT touch the query: terms move whenever
 * data reloads, and a search that cleared itself under the user would be worse
 * than no search. Only leaving the screen clears it.
 */
export function useScopedSearch(terms: string[], placeholder?: string): string {
  const { setScope, query, setQuery } = useSearchScope();
  // Compared as one string and split back on a separator no term can hold —
  // "January 2026" is one term, not two.
  const key = terms.join(SEP);

  useEffect(() => {
    setScope({ terms: key === '' ? [] : key.split(SEP), placeholder });
  }, [key, placeholder, setScope]);

  useEffect(
    () => () => {
      setScope(null);
      setQuery('');
    },
    [setScope, setQuery],
  );

  return query;
}

/**
 * Terms that complete what has been typed, best first — a term that starts
 * with the query before one that merely contains it. The query itself is not
 * a suggestion: offering back what someone just finished typing is noise.
 */
export function suggest(terms: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const seen = new Set<string>();
  const starts: string[] = [];
  const contains: string[] = [];
  for (const term of terms) {
    const lower = term.toLowerCase();
    if (lower === q || seen.has(lower) || !lower.includes(q)) continue;
    seen.add(lower);
    (lower.startsWith(q) ? starts : contains).push(term);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Does a line match the query? A line is described by the terms a reader can
 * see on it, and any one of them matching is a hit. An empty query matches
 * everything — the unfiltered list is the list.
 */
export function lineMatches(query: string, ...fields: Array<string | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
