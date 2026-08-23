// Pure portfolio math — no framework or DB imports (AGENTS.md invariant).
// FIFO lot matching is computed here once and shared by the portfolio page,
// stock-page position card, homepage card, and (Phase 3) the tax engine.

export interface EngineTx {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  /** ISO date (exchange-local trade date). */
  tradeDate: string;
  shares: number;
  pricePerShare: number;
  commission: number;
  /** Tie-breaker for same-day ordering; ISO timestamp or epoch ms. */
  createdAt?: string | number;
}

export interface Lot {
  /** Buy transaction this lot descends from (lots split on partial sells). */
  txId: string;
  date: string;
  shares: number;
  /** Per-share cost including the buy commission's pro-rata share. */
  costPerShare: number;
}

export interface RealizedEvent {
  saleTxId: string;
  symbol: string;
  date: string;
  shares: number;
  proceeds: number;
  costBasis: number;
  gain: number;
  /** The lots (and quantities) this sale consumed, oldest first. */
  matchedLots: Array<{ txId: string; date: string; shares: number; costPerShare: number }>;
}

export interface Holding {
  symbol: string;
  shares: number;
  totalCost: number;
  avgCost: number;
  lots: Lot[];
}

export interface PortfolioComputation {
  holdings: Holding[];
  realized: RealizedEvent[];
}

export class OversellError extends Error {
  constructor(
    public symbol: string,
    public date: string,
    public requested: number,
    public available: number,
  ) {
    super(`Cannot sell ${requested} ${symbol} on ${date}: only ${available} held`);
    this.name = 'OversellError';
  }
}

/**
 * `createdAt` as an epoch-ms instant, whichever documented representation it
 * arrived in. Comparing the raw values is not an option: a string never
 * compares true against a number in either direction, so one ISO-stamped row
 * among epoch-stamped ones makes the comparator inconsistent and the sorted
 * order depend on the input permutation — which FIFO then turns into a
 * different realized gain for the same transaction set.
 */
const createdAtMs = (v: string | number | undefined): number => {
  if (typeof v !== 'string') return v ?? 0;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? 0 : ms;
};

/** Deterministic timeline: trade date, then insertion order. */
export function sortTxs(txs: EngineTx[]): EngineTx[] {
  return [...txs].sort((a, b) => {
    if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? -1 : 1;
    const ca = createdAtMs(a.createdAt);
    const cb = createdAtMs(b.createdAt);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

const EPS = 1e-9;

/**
 * Replay the full transaction timeline: FIFO lot matching, lots split on
 * partial sells. Throws OversellError if any sale exceeds shares held at
 * its date — write-time validation should make that unreachable.
 */
export function computePortfolio(txs: EngineTx[]): PortfolioComputation {
  return computeSortedPortfolio(sortTxs(txs));
}

/**
 * The replay itself, over a timeline already in {@link sortTxs} order.
 *
 * Split out for callers that replay the *same* transactions at several cutoff
 * dates — the custody valuation samples three month-ends per quarter — so the
 * timeline is ordered once and every sample is a prefix of it, instead of
 * re-sorting the same rows for each sample. Passing an unsorted array here is
 * a caller bug: use {@link computePortfolio}.
 */
export function computeSortedPortfolio(txs: EngineTx[]): PortfolioComputation {
  const lotsBySymbol = new Map<string, Lot[]>();
  const realized: RealizedEvent[] = [];

  for (const tx of txs) {
    const lots = lotsBySymbol.get(tx.symbol) ?? [];
    if (!lotsBySymbol.has(tx.symbol)) lotsBySymbol.set(tx.symbol, lots);

    if (tx.type === 'BUY') {
      lots.push({
        txId: tx.id,
        date: tx.tradeDate,
        shares: tx.shares,
        costPerShare: tx.pricePerShare + (tx.shares > 0 ? tx.commission / tx.shares : 0),
      });
      continue;
    }

    // SELL — consume lots oldest-first.
    const available = lots.reduce((s, l) => s + l.shares, 0);
    if (tx.shares > available + EPS) {
      throw new OversellError(tx.symbol, tx.tradeDate, tx.shares, available);
    }
    let remaining = tx.shares;
    let costBasis = 0;
    const matched: RealizedEvent['matchedLots'] = [];
    while (remaining > EPS) {
      const lot = lots[0];
      const take = Math.min(lot.shares, remaining);
      costBasis += take * lot.costPerShare;
      matched.push({ txId: lot.txId, date: lot.date, shares: take, costPerShare: lot.costPerShare });
      lot.shares -= take;
      remaining -= take;
      if (lot.shares <= EPS) lots.shift();
    }
    const proceeds = tx.shares * tx.pricePerShare - tx.commission;
    realized.push({
      saleTxId: tx.id,
      symbol: tx.symbol,
      date: tx.tradeDate,
      shares: tx.shares,
      proceeds,
      costBasis,
      gain: proceeds - costBasis,
      matchedLots: matched,
    });
  }

  const holdings: Holding[] = [];
  for (const [symbol, lots] of lotsBySymbol) {
    const shares = lots.reduce((s, l) => s + l.shares, 0);
    if (shares <= EPS) continue;
    const totalCost = lots.reduce((s, l) => s + l.shares * l.costPerShare, 0);
    holdings.push({ symbol, shares, totalCost, avgCost: totalCost / shares, lots });
  }
  return { holdings, realized };
}

/**
 * Would adding `candidate` (a SELL) keep the timeline valid? Checks the
 * running balance from the candidate's date forward, so backdated sells
 * that starve later sells are rejected too. `excludeTxId` supports edits.
 *
 * On a refusal, `available` is the largest sale the timeline *would* accept at
 * the candidate's date — not the raw balance standing there. The two differ
 * exactly when a later sale is what forces the refusal, and it is the number
 * the caller prints: the API forwards it as `{ error: 'oversell', available }`
 * and the UI renders "You only hold {available} shares on that date". Reporting
 * the raw balance made that message contradict the refusal it explains — "you
 * only hold 100" beside a rejected sale of 50.
 */
export function validateSell(
  txs: EngineTx[],
  candidate: EngineTx,
  excludeTxId?: string,
): { ok: boolean; available: number } {
  const timeline = sortTxs([
    ...txs.filter((t) => t.id !== excludeTxId && t.symbol === candidate.symbol),
    candidate,
  ]);
  let balance = 0;
  let availableAtCandidate = 0;
  // The tightest the balance gets from the candidate's slot onward with the
  // candidate itself left out — i.e. how many shares are free to sell there.
  let headroom = Infinity;
  let reached = false;
  for (const tx of timeline) {
    if (tx.id === candidate.id) {
      availableAtCandidate = balance;
      reached = true;
      headroom = Math.min(headroom, balance);
      continue; // the candidate's own shares are what `headroom` is measuring
    }
    balance += tx.type === 'BUY' ? tx.shares : -tx.shares;
    if (reached) headroom = Math.min(headroom, balance);
    // Already invalid before the candidate — nothing can be sold here.
    if (!reached && balance < -EPS) return { ok: false, available: 0 };
  }
  if (candidate.shares > headroom + EPS) {
    return { ok: false, available: Math.max(0, Number.isFinite(headroom) ? headroom : 0) };
  }
  return { ok: true, available: availableAtCandidate };
}

/** Shares of `symbol` held at end of `date`. */
export function sharesHeldAt(txs: EngineTx[], symbol: string, date: string): number {
  let balance = 0;
  for (const tx of sortTxs(txs)) {
    if (tx.symbol !== symbol || tx.tradeDate > date) continue;
    balance += tx.type === 'BUY' ? tx.shares : -tx.shares;
  }
  return balance;
}

export interface PositionQuote {
  price: number;
  previousClose?: number;
}

export interface PositionView {
  symbol: string;
  shares: number;
  avgCost: number;
  totalCost: number;
  marketValue: number;
  totalGain: number;
  totalGainPct: number;
  dayGain: number;
  dayGainPct: number;
}

/** Performance view of a holding at a quote — the one shared computation. */
export function positionView(h: Holding, q: PositionQuote): PositionView {
  const marketValue = h.shares * q.price;
  const totalGain = marketValue - h.totalCost;
  const prev = q.previousClose ?? q.price;
  const dayGain = h.shares * (q.price - prev);
  const prevValue = h.shares * prev;
  return {
    symbol: h.symbol,
    shares: h.shares,
    avgCost: h.avgCost,
    totalCost: h.totalCost,
    marketValue,
    totalGain,
    totalGainPct: h.totalCost > 0 ? (totalGain / h.totalCost) * 100 : 0,
    dayGain,
    dayGainPct: prevValue > 0 ? (dayGain / prevValue) * 100 : 0,
  };
}
