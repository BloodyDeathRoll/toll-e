import 'server-only';

/**
 * Hebrew company names and descriptions from Wikidata and Hebrew Wikipedia.
 *
 * The provider writes in English only, whatever `lang` is asked of it. These
 * two answer in Hebrew, free and keyless, and — unlike a translation — in prose
 * a person actually wrote. Everything found here is stored in `symbol_i18n`, so
 * a symbol is looked up once and never again.
 *
 * The lookup goes by company name, not by ticker: Wikidata's ticker property
 * (P249) is set on 39 items in the entire database, so it is not a lookup path.
 * Name search plus a "is this actually a company" check is.
 */

const WD = 'https://www.wikidata.org/w/api.php';
const HEWIKI = 'https://he.wikipedia.org/w/api.php';
const HEADERS = { Accept: 'application/json', 'User-Agent': 'toll-e/0.1 (https://github.com/toll-e)' };
const TIMEOUT_MS = 4_000;

/** Business, enterprise, public company, … — what makes a hit the right kind of thing. */
const COMPANY_TYPES = new Set([
  'Q4830453', // business
  'Q891723', // public company
  'Q6881511', // enterprise
  'Q783794', // company
  'Q43229', // organization
  'Q167037', // corporation
]);

const HEBREW = /[֐-׿]/;

interface WdSearchHit {
  id: string;
}
interface WdEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>;
}

export interface HeLookup {
  name?: string;
  about?: string;
  /** Set only when the text came from a hewiki article — CC BY-SA wants the credit. */
  sourceUrl?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** The claim ids on one property, flattened past the snak wrapper. */
const claimIds = (e: WdEntity, prop: string): string[] =>
  (e.claims?.[prop] ?? [])
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter((id): id is string => typeof id === 'string');

/**
 * Is this entity the company we are looking at? Either it says so outright
 * (P31), or it is listed on a stock exchange (P414), which nothing but a
 * company is.
 */
export function isCompany(e: WdEntity): boolean {
  return claimIds(e, 'P31').some((id) => COMPANY_TYPES.has(id)) || claimIds(e, 'P414').length > 0;
}

/**
 * The Hebrew name, which is not always the Hebrew label: AMD's `he` label is
 * still "Advanced Micro Devices" while its Hebrew article is titled "AMD", and
 * Arista's label is Latin where its article is "אריסטה נטוורקס". So the label
 * only counts when it is actually in Hebrew; otherwise the article title wins.
 *
 * Article titles carry disambiguation in parentheses — "טסלה (חברה)",
 * "אלפאבית (חברה)" — which is Wikipedia's bookkeeping, not part of the name.
 */
export function pickName(e: WdEntity): string | undefined {
  const label = e.labels?.he?.value;
  if (label && HEBREW.test(label)) return label;
  const title = e.sitelinks?.hewiki?.title;
  if (!title) return label;
  const stripped = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || title;
}

/**
 * Provider names are not search terms. They carry bookkeeping Wikidata has
 * never heard of: "Coca-Cola Company (The)" finds nothing, "Coca-Cola Company"
 * finds the company — and "Coca-Cola", trimmed one step further, finds the
 * drink. So the variants are tried in order, least-edited first, and the first
 * one that turns up an actual company wins.
 */
export function searchNames(englishName: string): string[] {
  const raw = englishName.trim();
  const article = raw.replace(/\s*\((the|le|la)\)\s*$/i, '').trim();
  const bare = article
    .replace(
      /[,.]?\s+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|sa|nv|ag)\.?$/i,
      '',
    )
    .replace(/\s+-\s+(class|series)\s+[a-z]$/i, '')
    .trim();
  return [...new Set([raw, article, bare].filter(Boolean))];
}

/** Pure: pick the first hit that is a company. Exported for the unit tests. */
export function pickEntity(
  ids: string[],
  entities: Record<string, WdEntity>,
): { id: string; entity: WdEntity } | undefined {
  for (const id of ids) {
    const entity = entities[id];
    if (entity && isCompany(entity)) return { id, entity };
  }
  return undefined;
}

/** The intro section of a Hebrew Wikipedia article, as plain text. */
async function heWikiIntro(title: string): Promise<string | undefined> {
  const url =
    `${HEWIKI}?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&origin=*` +
    `&titles=${encodeURIComponent(title)}`;
  const json = await getJson<{ query?: { pages?: Record<string, { extract?: string }> } }>(url);
  const page = Object.values(json.query?.pages ?? {})[0];
  const text = page?.extract?.trim();
  return text && HEBREW.test(text) ? text : undefined;
}

/**
 * Hebrew name and About for a company, by its English name.
 *
 * Returns whatever it found — the name without the About is a normal and
 * useful answer, and so is nothing at all. Never throws: the caller falls
 * through to the reader's own browser, and a page must not fail over a
 * missing translation.
 */
export async function lookupHe(englishName: string): Promise<HeLookup> {
  try {
    let hit: { id: string; entity: WdEntity } | undefined;
    for (const name of searchNames(englishName)) {
      const search = await getJson<{ search?: WdSearchHit[] }>(
        `${WD}?action=wbsearchentities&search=${encodeURIComponent(name)}` +
          `&language=en&uselang=en&type=item&limit=5&format=json&origin=*`,
      );
      const ids = (search.search ?? []).map((h) => h.id);
      if (ids.length === 0) continue;

      const entities = await getJson<{ entities?: Record<string, WdEntity> }>(
        `${WD}?action=wbgetentities&ids=${ids.join('|')}` +
          `&props=labels|descriptions|claims|sitelinks&languages=he&sitefilter=hewiki&format=json&origin=*`,
      );
      hit = pickEntity(ids, entities.entities ?? {});
      if (hit) break;
    }
    if (!hit) return {};

    const name = pickName(hit.entity);
    const title = hit.entity.sitelinks?.hewiki?.title;
    // An article is the better About by far. Where there is none, Wikidata's
    // one-line description ("חברת טכנולוגיה אמריקאית") still beats an English
    // paragraph, and it covers a good deal more companies than the articles do.
    const intro = title ? await heWikiIntro(title).catch(() => undefined) : undefined;
    const about = intro ?? hit.entity.descriptions?.he?.value;

    return {
      name,
      about,
      sourceUrl: intro && title ? `https://he.wikipedia.org/wiki/${encodeURIComponent(title)}` : undefined,
    };
  } catch {
    return {};
  }
}
