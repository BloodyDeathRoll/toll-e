import { describe, expect, it } from 'vitest';
import { hasHebrew, searchTase } from './tase-search';

describe('hasHebrew', () => {
  it('spots Hebrew anywhere in the query', () => {
    expect(hasHebrew('טבע')).toBe(true);
    expect(hasHebrew('teva טבע')).toBe(true);
    expect(hasHebrew('teva')).toBe(false);
    expect(hasHebrew('')).toBe(false);
  });
});

describe('searchTase', () => {
  it('finds a share by its Hebrew ticker, exact hit first', () => {
    expect(searchTase('טבע')[0].symbol).toBe('TEVA.TA');
  });

  it('finds a share by Hebrew name, exact name before substring hits', () => {
    // 'לאומי' is also a substring of הבינלאומי (FIBI); Leumi must lead.
    expect(searchTase('לאומי')[0].symbol).toBe('LUMI.TA');
    expect(searchTase('לאומי').map((e) => e.symbol)).toContain('FIBI.TA');
  });

  it('finds a share by Latin symbol prefix the provider whiffs on', () => {
    expect(searchTase('poli')[0].symbol).toBe('POLI.TA');
  });

  it('is case-insensitive on Latin queries', () => {
    expect(searchTase('TeVa')[0].symbol).toBe('TEVA.TA');
  });

  it('carries both names and a type on every entry', () => {
    const [teva] = searchTase('טבע');
    expect(teva.name).toBe('TEVA');
    expect(teva.heName).toBe('טבע');
    expect(teva.type).toBe('EQUITY');
  });

  it('covers ETF series symbols with Yahoo dash form', () => {
    const hits = searchTase('MTF-F100');
    expect(hits[0].symbol).toBe('MTF-F100.TA');
    expect(hits[0].type).toBe('ETF');
  });

  it('finds by ISIN', () => {
    expect(searchTase('IL0006290147').map((e) => e.symbol)).toContain('TEVA.TA');
  });

  it('returns nothing for blank or unmatched queries', () => {
    expect(searchTase('')).toEqual([]);
    expect(searchTase('   ')).toEqual([]);
    expect(searchTase('zzzzqqqq')).toEqual([]);
  });

  it('honors the limit', () => {
    expect(searchTase('א', 5)).toHaveLength(5);
  });
});
