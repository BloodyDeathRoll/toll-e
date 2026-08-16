// Regenerates src/markets/tase-catalogue.json from TASE's own entity search
// feed — the only source that carries Hebrew names and Hebrew tickers for the
// full TASE universe (Yahoo has neither, and rejects Hebrew queries outright).
//
// Run: node scripts/build-tase-catalogue.mjs
//
// The endpoint is the one market.tase.co.il itself calls; it answers only when
// the request carries the site's Origin. That makes this a build-time script by
// design: the app never talks to TASE at runtime, it ships the catalogue as
// static data (same stance as the broker fee catalogue in src/brokers/).

const BASE = 'https://api.tase.co.il/api/content/searchentities';
const HEADERS = {
  Origin: 'https://market.tase.co.il',
  Referer: 'https://market.tase.co.il/',
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

// Type 1 = tradable security. Of its subtypes we keep what toll-e can actually
// track and Yahoo can actually quote: shares and exchange-traded funds. Bonds,
// warrants and T-bills resolve namelessly (or not at all) on Yahoo and are out
// of v1's product surface anyway.
const KEEP = new Set([
  'Shares',
  'ETF Fund - Equity',
  'ETF - Bonds',
  'Foreign ETF - Equity',
  'Foreign ETF - Bonds',
]);

async function fetchEntities(lang) {
  const res = await fetch(`${BASE}?lang=${lang}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`TASE searchentities lang=${lang}: HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list) || list.length < 1000) {
    throw new Error(`TASE searchentities lang=${lang}: implausible payload (${list?.length} rows)`);
  }
  return list;
}

/** TASE series symbols use dots (MTF.F100); Yahoo flattens them to dashes. */
const yahooSymbol = (smb) => `${smb.replace(/\./g, '-')}.TA`;

const [he, en] = await Promise.all([fetchEntities(0), fetchEntities(1)]);
const heById = new Map(he.filter((e) => e.Type === 1).map((e) => [e.Id, e]));

const entries = en
  .filter((e) => e.Type === 1 && KEEP.has(e.SubTypeDesc) && e.Smb)
  .map((e) => {
    const h = heById.get(e.Id);
    return {
      symbol: yahooSymbol(e.Smb),
      name: e.Name,
      heName: h?.Name ?? e.Name,
      // Stocks carry a Hebrew ticker (טבע); series symbols repeat the latin one.
      heSymbol: h?.Smb && h.Smb !== e.Smb ? h.Smb : undefined,
      isin: e.ISIN ?? undefined,
      type: e.SubTypeDesc === 'Shares' ? 'EQUITY' : 'ETF',
    };
  })
  .sort((a, b) => a.symbol.localeCompare(b.symbol));

const dupes = entries.length - new Set(entries.map((e) => e.symbol)).size;
if (dupes > 0) throw new Error(`${dupes} duplicate symbols after mapping`);

const counts = entries.reduce((m, e) => m.set(e.type, (m.get(e.type) ?? 0) + 1), new Map());
const out = new URL('../src/markets/tase-catalogue.json', import.meta.url);
const { writeFile } = await import('node:fs/promises');
await writeFile(out, JSON.stringify(entries, null, 1) + '\n');
console.log(`wrote ${entries.length} entries (${[...counts].map(([k, v]) => `${v} ${k}`).join(', ')}) → ${out.pathname}`);
