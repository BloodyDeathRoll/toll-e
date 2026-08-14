import { describe, expect, it } from 'vitest';
import { toQuote } from './yahoo';

// Yahoo quotes TASE in agorot under the pseudo-currency 'ILA' — TEVA.TA
// arrives as `currency: 'ILA', price: 10950` meaning ₪109.50. The provider
// boundary must divide every money field by 100 and report ILS, while
// ratios and counts pass through untouched.
type Q = Parameters<typeof toQuote>[0];
const quote = (fields: Record<string, unknown>) => fields as unknown as Q;

const asOf = new Date('2026-08-13T14:30:00Z');

describe('agorot → shekel conversion at the Yahoo boundary', () => {
  it('divides money fields by 100 and reports ILS', () => {
    const q = toQuote(
      quote({
        symbol: 'TEVA.TA',
        shortName: 'Teva',
        currency: 'ILA',
        regularMarketPrice: 10950,
        regularMarketChange: 150,
        regularMarketChangePercent: 1.39,
        regularMarketPreviousClose: 10800,
        regularMarketOpen: 10820,
        regularMarketDayLow: 10790,
        regularMarketDayHigh: 11010,
        fiftyTwoWeekLow: 9000,
        fiftyTwoWeekHigh: 12000,
        regularMarketVolume: 1_234_567,
        marketCap: 12_600_000_000_000,
        regularMarketTime: asOf,
      }),
    );
    expect(q.currency).toBe('ILS');
    expect(q.price).toBe(109.5);
    expect(q.change).toBe(1.5);
    expect(q.previousClose).toBe(108);
    expect(q.open).toBe(108.2);
    expect(q.dayLow).toBe(107.9);
    expect(q.dayHigh).toBe(110.1);
    expect(q.wk52Low).toBe(90);
    expect(q.wk52High).toBe(120);
    expect(q.marketCap).toBe(126_000_000_000);
    // Ratios and counts are unit-free — they must not be touched.
    expect(q.changePct).toBe(1.39);
    expect(q.volume).toBe(1_234_567);
  });

  it('converts an extended-session print along with the regular one', () => {
    const q = toQuote(
      quote({
        symbol: 'TEVA.TA',
        currency: 'ILA',
        regularMarketPrice: 10950,
        regularMarketTime: asOf,
        postMarketPrice: 11000,
        postMarketChange: 50,
        postMarketChangePercent: 0.46,
        postMarketTime: new Date(asOf.getTime() + 60 * 60 * 1000),
      }),
    );
    expect(q.extended?.price).toBe(110);
    expect(q.extended?.change).toBe(0.5);
    expect(q.extended?.changePct).toBe(0.46);
  });

  it('leaves every other currency alone', () => {
    const q = toQuote(
      quote({
        symbol: 'AAPL',
        currency: 'USD',
        regularMarketPrice: 217.5,
        regularMarketChange: 1.2,
        regularMarketPreviousClose: 216.3,
        marketCap: 3_300_000_000_000,
      }),
    );
    expect(q.currency).toBe('USD');
    expect(q.price).toBe(217.5);
    expect(q.change).toBe(1.2);
    expect(q.previousClose).toBe(216.3);
    expect(q.marketCap).toBe(3_300_000_000_000);
  });
});
