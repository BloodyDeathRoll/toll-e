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
