import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isCompany, pickEntity, pickName, searchNames } from './wikidata';

// Fixtures trimmed from real wbgetentities responses (props=labels|descriptions
// |claims|sitelinks, languages=he, sitefilter=hewiki).

const P31 = (...ids: string[]) => ({
  P31: ids.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
});

const nvidia = {
  labels: { he: { value: 'אנבידיה' } },
  descriptions: { he: { value: 'חברת טכנולוגיה אמריקאית' } },
  sitelinks: { hewiki: { title: 'אנבידיה' } },
  claims: {
    ...P31('Q891723', 'Q4830453'),
    P414: [{ mainsnak: { datavalue: { value: { id: 'Q82059' } } } }],
  },
};

/** AMD: the Hebrew label is still Latin, but the article title is the name. */
const amd = {
  labels: { he: { value: 'Advanced Micro Devices' } },
  descriptions: { he: { value: 'חברה העוסקת בתכנון ושיווק מיקרו-מעבדים' } },
  sitelinks: { hewiki: { title: 'AMD' } },
  claims: P31('Q4830453'),
};

/** Arista: Latin label, Hebrew article title. */
const arista = {
  labels: { he: { value: 'Arista Networks' } },
  sitelinks: { hewiki: { title: 'אריסטה נטוורקס' } },
  claims: P31('Q4830453'),
};

/** Tesla: a Hebrew label of its own, and an article under a disambiguated title. */
const tesla = {
  labels: { he: { value: 'טסלה מוטורס' } },
  sitelinks: { hewiki: { title: 'טסלה (חברה)' } },
  claims: P31('Q4830453'),
};

/** No Hebrew label at all, so the disambiguated article title is the only name. */
const disambiguated = {
  labels: { he: { value: 'Alphabet Inc.' } },
  sitelinks: { hewiki: { title: 'אלפאבית (חברה)' } },
  claims: P31('Q4830453'),
};

/** Calvados the brandy — what a careless name search turns up. */
const notACompany = {
  labels: { he: { value: 'קלבדוס' } },
  sitelinks: { hewiki: { title: 'קלבדוס' } },
  claims: P31('Q40050'),
};

describe('isCompany', () => {
  it('accepts a business by its P31', () => {
    expect(isCompany(amd)).toBe(true);
  });

  it('accepts anything listed on a stock exchange', () => {
    expect(isCompany({ claims: { P414: [{ mainsnak: { datavalue: { value: { id: 'Q82059' } } } }] } })).toBe(
      true,
    );
  });

  it('rejects a drink', () => {
    expect(isCompany(notACompany)).toBe(false);
  });

  it('rejects an entity with no claims at all', () => {
    expect(isCompany({})).toBe(false);
  });
});

describe('pickName', () => {
  it('takes the Hebrew label when it is Hebrew', () => {
    expect(pickName(nvidia)).toBe('אנבידיה');
  });

  it('prefers the article title over a Latin label', () => {
    expect(pickName(amd)).toBe('AMD');
    expect(pickName(arista)).toBe('אריסטה נטוורקס');
  });

  it('keeps a Hebrew label even where the article title differs', () => {
    expect(pickName(tesla)).toBe('טסלה מוטורס');
  });

  it("drops Wikipedia's disambiguation suffix when the title is the name", () => {
    expect(pickName(disambiguated)).toBe('אלפאבית');
  });

  it('falls back to the label when there is no article', () => {
    expect(pickName({ labels: { he: { value: 'Tidewater' } } })).toBe('Tidewater');
  });

  it('has no answer for an entity with neither', () => {
    expect(pickName({})).toBeUndefined();
  });
});

describe('pickEntity', () => {
  it('skips non-companies and takes the first real one', () => {
    const got = pickEntity(['Q1', 'Q2'], { Q1: notACompany, Q2: nvidia });
    expect(got?.id).toBe('Q2');
  });

  it('respects search order among companies', () => {
    const got = pickEntity(['Q1', 'Q2'], { Q1: amd, Q2: nvidia });
    expect(got?.id).toBe('Q1');
  });

  it('answers nothing when no hit is a company', () => {
    expect(pickEntity(['Q1'], { Q1: notACompany })).toBeUndefined();
  });

  it('tolerates an id the entity map does not carry', () => {
    expect(pickEntity(['Q404'], {})).toBeUndefined();
  });
});

describe('searchNames', () => {
  it("peels the provider's trailing article before its corporate suffix", () => {
    // "Coca-Cola Company" is the company; "Coca-Cola" alone is the drink, so
    // the order of these two matters.
    expect(searchNames('Coca-Cola Company (The)')).toEqual([
      'Coca-Cola Company (The)',
      'Coca-Cola Company',
      'Coca-Cola',
    ]);
  });

  it('offers the name without its corporate suffix', () => {
    expect(searchNames('NVIDIA Corporation')).toEqual(['NVIDIA Corporation', 'NVIDIA']);
    expect(searchNames('Apple Inc.')).toEqual(['Apple Inc.', 'Apple']);
    expect(searchNames('Advanced Micro Devices, Inc.')).toEqual([
      'Advanced Micro Devices, Inc.',
      'Advanced Micro Devices',
    ]);
  });

  it('drops a share-class tail', () => {
    expect(searchNames('Alphabet Inc - Class C')).toEqual(['Alphabet Inc - Class C', 'Alphabet Inc']);
  });

  it('leaves a name with nothing to strip alone', () => {
    expect(searchNames('Tidewater')).toEqual(['Tidewater']);
  });
});
