import { describe, expect, it } from 'vitest';
import { lastTradeByMarket } from './last-trade';

describe('lastTradeByMarket', () => {
  it('keeps the newest stamp per market', () => {
    const got = lastTradeByMarket([
      { symbol: 'AAPL', asOf: 100 },
      { symbol: 'MSFT', asOf: 300 },
      { symbol: 'TEVA.TA', asOf: 200 },
    ]);
    expect(got).toEqual({ US: 300, IL: 200 });
  });

  it('ignores quotes with no stamp, and missing rows', () => {
    expect(lastTradeByMarket([{ symbol: 'AAPL' }, undefined])).toEqual({});
  });

  it('never lets one market answer for another', () => {
    const got = lastTradeByMarket([{ symbol: 'AAPL', asOf: 500 }]);
    expect(got.IL).toBeUndefined();
  });
});

describe('futures never speak for the exchange', () => {
  it('drops a futures print, however fresh', () => {
    // 03:00 ET on a weekday: NQ=F is trading, the NYSE is hours from its bell.
    // Bucketing the contract under US would tell every stock row to redraw an
    // empty session-in-progress.
    expect(lastTradeByMarket([{ symbol: 'NQ=F', asOf: 900 }])).toEqual({});
  });

  it('leaves the cash market’s own stamp untouched beside one', () => {
    const got = lastTradeByMarket([
      { symbol: 'NQ=F', asOf: 900 },
      { symbol: 'AAPL', asOf: 100 },
    ]);
    expect(got).toEqual({ US: 100 });
  });
});
