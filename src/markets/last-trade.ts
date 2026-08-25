import { marketForSymbol } from './registry';

/**
 * The newest last-trade stamp seen per market, across every quote on hand.
 *
 * Liveness is a property of the *exchange*, not of a ticker. Yahoo only moves
 * a symbol's `regularMarketTime` on its own first regular print, so minutes
 * into a session a thin name — or one whose feed lagged the bell — still
 * carries yesterday's stamp, and a symbol the provider answered pricelessly
 * carries the persisted close's stamp instead. Judging that row on its own
 * stamp concludes "the exchange is shut" and redraws yesterday's whole
 * session as if it were today.
 *
 * One ticker printing inside today's session settles it for all of them: pass
 * the market's max as `lastTradeAt` and every row draws the session-in-
 * progress view, however stale its own quote is. Only when *nothing* has
 * printed does the finished-session view stand — which is the real holiday
 * the stamp was there to catch.
 */
export function lastTradeByMarket(
  quotes: Iterable<{ symbol: string; asOf?: number } | undefined>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of quotes) {
    if (!q || q.asOf === undefined) continue;
    const id = marketForSymbol(q.symbol).id;
    if (out[id] === undefined || q.asOf > out[id]) out[id] = q.asOf;
  }
  return out;
}
