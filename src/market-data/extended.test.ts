import { describe, expect, it } from 'vitest';
import { extendedOf } from './yahoo';

// Yahoo's own shapes, trimmed to the fields the rule reads. Every case pins
// the stamps, because the stamps are the rule — `marketState` is set to
// whatever Yahoo really reports at that hour, precisely to show it is not
// what decides.
type Q = Parameters<typeof extendedOf>[0];
const quote = (fields: Record<string, unknown>) => fields as unknown as Q;

const close = new Date('2026-08-11T20:00:00Z'); // 16:00 ET, the bell
const post = new Date('2026-08-11T23:59:58Z'); // 19:59:58 ET, last extended print
const pre = new Date('2026-08-12T11:30:00Z'); // 07:30 ET, next morning

const regular = { regularMarketPrice: 217.5, regularMarketTime: close };
const postFields = {
  postMarketPrice: 218.04,
  postMarketChange: 0.54,
  postMarketChangePercent: 0.25,
  postMarketTime: post,
};
const preFields = {
  preMarketPrice: 219.1,
  preMarketChange: 1.6,
  preMarketChangePercent: 0.74,
  preMarketTime: pre,
};

describe('extendedOf', () => {
  it('shows last night’s close through the small hours, when Yahoo says PREPRE', () => {
    // 02:19 ET: the state has already rolled over to PREPRE, but the figure
    // is still in the postMarket fields — the whole Israeli morning.
    const ext = extendedOf(quote({ marketState: 'PREPRE', ...regular, ...postFields }));
    expect(ext).toEqual({
      phase: 'post',
      price: 218.04,
      change: 0.54,
      changePct: 0.25,
      asOf: post.getTime(),
    });
  });

  it('shows the after-hours print during POST', () => {
    expect(extendedOf(quote({ marketState: 'POST', ...regular, ...postFields }))?.phase).toBe('post');
  });

  it('prefers the morning print over last night’s once both are quoted', () => {
    const ext = extendedOf(quote({ marketState: 'PRE', ...regular, ...postFields, ...preFields }));
    expect(ext?.phase).toBe('pre');
    expect(ext?.price).toBe(219.1);
  });

  it('drops an extended price older than the close it would sit beside', () => {
    // A live regular session still carries yesterday's postMarket fields
    // unchanged; printing them beside a moving price would be a lie about
    // when they were struck.
    const trading = { regularMarketPrice: 220, regularMarketTime: new Date('2026-08-12T17:00:00Z') };
    expect(extendedOf(quote({ marketState: 'REGULAR', ...trading, ...postFields }))).toBeUndefined();
  });

  it('drops an unstamped price — it cannot be labelled, so it cannot be shown', () => {
    const unstamped = { ...postFields, postMarketTime: undefined };
    expect(extendedOf(quote({ marketState: 'POST', ...regular, ...unstamped }))).toBeUndefined();
  });

  it('reports nothing for an exchange without extended trading', () => {
    // TASE: hasPrePostMarketData false, no pre/post fields at all.
    expect(extendedOf(quote({ marketState: 'PREPRE', regularMarketPrice: 11000 }))).toBeUndefined();
  });
});
