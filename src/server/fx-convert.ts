import 'server-only';

/**
 * The one FX closure, shared by performance and costs so two copies cannot
 * drift. Presentation-layer only — no engine ever converts currencies — and
 * the rate used must travel in whatever payload shows the result.
 */
export function makeConvert(usdIlsRate: number, to: string) {
  return (amount: number, from: string): number => {
    if (from === to) return amount;
    if (from === 'USD' && to === 'ILS') return amount * usdIlsRate;
    if (from === 'ILS' && to === 'USD') return amount / usdIlsRate;
    return amount; // unknown pair — pass through rather than invent a rate
  };
}
