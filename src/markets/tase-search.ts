import catalogue from './tase-catalogue.json';

// Local search over the TASE catalogue (scripts/build-tase-catalogue.mjs).
// Yahoo rejects Hebrew queries outright and carries no Hebrew names, so
// Hebrew search — and Latin search over Hebrew-named listings — has to be
// answered from data we ship. Pure TS: the market-data facade merges these
// hits with the provider's; nothing here touches the network.

export interface TaseCatalogueEntry {
  /** Provider (Yahoo) symbol, suffix included: 'TEVA.TA'. */
  symbol: string;
  name: string;
  heName: string;
  /** TASE's Hebrew ticker ('טבע'); absent when it just repeats the Latin one. */
  heSymbol?: string;
  isin?: string;
  type: string; // EQUITY | ETF
}

const entries = catalogue as TaseCatalogueEntry[];

export const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/**
 * Rank a query against one entry; higher is better, 0 is no match.
 * Symbol hits outrank name hits, prefixes outrank substrings — the order a
 * ticker typeahead is expected to have.
 */
function score(entry: TaseCatalogueEntry, q: string): number {
  const symbol = entry.symbol.slice(0, -'.TA'.length).toLowerCase();
  const name = entry.name.toLowerCase();
  if (symbol === q || entry.heSymbol === q) return 6;
  if (symbol.startsWith(q) || entry.heSymbol?.startsWith(q)) return 5;
  if (entry.heName === q) return 4;
  if (name.startsWith(q) || entry.heName.startsWith(q)) return 3;
  if (name.includes(q) || entry.heName.includes(q)) return 2;
  if (entry.isin === q.toUpperCase()) return 1;
  return 0;
}

/** Catalogue matches for a query, best first. Empty for a blank query. */
export function searchTase(query: string, limit = 10): TaseCatalogueEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries
    .map((entry) => ({ entry, rank: score(entry, q) }))
    .filter((m) => m.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.entry.symbol.localeCompare(b.entry.symbol))
    .slice(0, limit)
    .map((m) => m.entry);
}
