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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchEntities(lang) {
  // The WAF rate-limits bursts; a couple of spaced retries ride it out.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}?lang=${lang}`, { headers: HEADERS });
    if (!res.ok) {
      if (attempt < 3) {
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      throw new Error(`TASE searchentities lang=${lang}: HTTP ${res.status}`);
    }
    const list = await res.json();
    if (!Array.isArray(list) || list.length < 1000) {
      throw new Error(`TASE searchentities lang=${lang}: implausible payload (${list?.length} rows)`);
    }
    return list;
  }
}

/** TASE series symbols use dots (MTF.F100); Yahoo flattens them to dashes. */
const yahooSymbol = (smb) => `${smb.replace(/\./g, '-')}.TA`;

// Maya (TASE's filings site) serves the company's own Hebrew business
// description — the registrar's text, not a translation. Same build-time
// stance as the entity feed: fetched here, shipped as static data.
const MAYA = 'https://mayaapi.tase.co.il/api/company/details';
const MAYA_HEADERS = {
  'X-Maya-With': 'allow',
  'Accept-Language': 'he-IL',
  Origin: 'https://maya.tase.co.il',
  Referer: 'https://maya.tase.co.il/',
  Accept: 'application/json',
  'User-Agent': HEADERS['User-Agent'],
};

async function fetchHeAbout(companyId) {
  const res = await fetch(`${MAYA}?companyId=${companyId}`, { headers: MAYA_HEADERS });
  if (!res.ok) return undefined;
  const d = await res.json().catch(() => null);
  const text = typeof d?.Description === 'string' ? d.Description.trim() : '';
  return text || undefined;
}

const he = await fetchEntities(0);
const en = await fetchEntities(1);
const heById = new Map(he.filter((e) => e.Type === 1).map((e) => [e.Id, e]));

const kept = en.filter((e) => e.Type === 1 && KEEP.has(e.SubTypeDesc) && e.Smb);

// One description per company, shares only — an ETF's SubId points at the
// fund manager, whose description would be the issuer's, not the fund's.
const companyIds = [...new Set(kept.filter((e) => e.SubTypeDesc === 'Shares').map((e) => e.SubId))];
const aboutById = new Map();
const POOL = 8;
for (let i = 0; i < companyIds.length; i += POOL) {
  await Promise.all(
    companyIds.slice(i, i + POOL).map(async (id) => {
      const text = await fetchHeAbout(id).catch(() => undefined);
      if (text) aboutById.set(id, text);
    }),
  );
  if (i % 200 < POOL) console.log(`descriptions: ${Math.min(i + POOL, companyIds.length)}/${companyIds.length}`);
}

const entries = kept
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
      heAbout: e.SubTypeDesc === 'Shares' ? aboutById.get(e.SubId) : undefined,
    };
  })
  .sort((a, b) => a.symbol.localeCompare(b.symbol));

const dupes = entries.length - new Set(entries.map((e) => e.symbol)).size;
if (dupes > 0) throw new Error(`${dupes} duplicate symbols after mapping`);

const counts = entries.reduce((m, e) => m.set(e.type, (m.get(e.type) ?? 0) + 1), new Map());
const withAbout = entries.filter((e) => e.heAbout).length;
const out = new URL('../src/markets/tase-catalogue.json', import.meta.url);
const { writeFile } = await import('node:fs/promises');
await writeFile(out, JSON.stringify(entries, null, 1) + '\n');
console.log(`wrote ${entries.length} entries (${[...counts].map(([k, v]) => `${v} ${k}`).join(', ')}, ${withAbout} with heAbout) → ${out.pathname}`);

// Mutual funds (Type 4): quoted daily via Maya, not Yahoo — a separate
// catalogue so the securities one stays a securities one. Names in both
// languages; the id is the symbol (docs/mutual-funds-plan.md).
const enFundById = new Map(en.filter((e) => e.Type === 4).map((e) => [e.Id, e]));
const funds = he
  .filter((e) => e.Type === 4)
  .map((e) => ({
    id: e.Id,
    heName: e.Name,
    name: enFundById.get(e.Id)?.Name ?? e.Name,
    isin: e.ISIN ?? undefined,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));
const fundsOut = new URL('../src/markets/tase-funds.json', import.meta.url);
await writeFile(fundsOut, JSON.stringify(funds, null, 1) + '\n');
console.log(`wrote ${funds.length} mutual funds → ${fundsOut.pathname}`);
