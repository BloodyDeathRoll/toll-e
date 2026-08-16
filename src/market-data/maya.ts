import 'server-only';

import { taseFundId, taseFundSymbol } from '@/src/markets/registry';
import { taseFundName } from '@/src/markets/tase-funds';
import type { ChartPoint, Quote, Summary } from './types';

/**
 * Israeli mutual funds via Maya, TASE's filings site (docs/mutual-funds-plan.md).
 * Free keyless JSON, same unofficial-but-first-party stance as the Yahoo
 * adapter. Funds are NAV-priced once a day: there is no intraday, no session,
 * no order book — every number here is a daily number.
 *
 * Maya quotes NAVs in agorot; ₪ leaves this module, agorot never do (the same
 * rule yahoo.ts applies to TASE equities).
 */

const BASE = 'https://maya.tase.co.il/api/v1/funds/mutual';
const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'he-IL',
  Referer: 'https://maya.tase.co.il/',
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

interface MayaFund {
  fundId: number;
  name: string;
  longName?: string;
  managementFee?: number;
  trusteeFee?: number;
  purchasePrice?: number;
  redemptionPrice?: number;
  ratesAsOf?: string; // ISO date
  assetValueNISMillions?: number;
  taxStatusName?: string;
  classification?: { major?: string; main?: string; secondary?: string };
  yields?: { dayYield?: number | null };
}

interface MayaHistoryRow {
  tradeDate: string;
  purchasePrice?: number;
  sellPrice?: number;
}

async function fetchFund(fundId: string): Promise<MayaFund> {
  const res = await fetch(`${BASE}/${fundId}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`maya fund ${fundId}: HTTP ${res.status}`);
  return res.json();
}

const agorotToIls = (v: number) => v / 100;

function toQuote(f: MayaFund): Quote | null {
  const nav = f.redemptionPrice ?? f.purchasePrice;
  if (nav === undefined || !Number.isFinite(nav) || nav <= 0) return null;
  const price = agorotToIls(nav);
  const pct = f.yields?.dayYield ?? 0;
  const previousClose = pct === -100 ? undefined : price / (1 + pct / 100);
  const symbol = taseFundSymbol(String(f.fundId));
  return {
    symbol,
    name: taseFundName(symbol, true) ?? f.name,
    currency: 'ILS',
    exchange: 'Tel Aviv',
    price,
    change: previousClose !== undefined ? price - previousClose : 0,
    changePct: pct,
    previousClose,
    asOf: f.ratesAsOf ? Date.parse(f.ratesAsOf) : undefined,
  };
}

/** Daily NAV quotes; a fund Maya no longer answers for is dropped, not zeroed. */
export async function getFundQuotes(symbols: string[]): Promise<Quote[]> {
  const settled = await Promise.allSettled(symbols.map((s) => fetchFund(taseFundId(s))));
  return settled
    .filter((r): r is PromiseFulfilledResult<MayaFund> => r.status === 'fulfilled')
    .map((r) => toQuote(r.value))
    .filter((q): q is Quote => q !== null);
}

/**
 * The month of daily NAVs Maya serves (pageSize caps at 30, page 2 is empty).
 * The facade persists these closes; longer ranges come from what Postgres has
 * accumulated (docs/mutual-funds-plan.md).
 */
export async function getFundHistory(symbol: string): Promise<ChartPoint[]> {
  const res = await fetch(`${BASE}/${taseFundId(symbol)}/history`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageNumber: 1, pageSize: 30 }),
  });
  if (!res.ok) throw new Error(`maya fund history ${symbol}: HTTP ${res.status}`);
  const rows: MayaHistoryRow[] = await res.json();
  return rows
    .map((r) => ({
      t: Date.parse(r.tradeDate),
      close: agorotToIls(r.sellPrice ?? r.purchasePrice ?? NaN),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.t - b.t);
}

export async function getFundSummary(symbol: string): Promise<Summary> {
  const f = await fetchFund(taseFundId(symbol));
  return {
    symbol,
    name: taseFundName(symbol, true) ?? f.longName ?? f.name,
    currency: 'ILS',
    exchange: 'Tel Aviv',
    // The classification tree is the fund's sector story — coarse then fine.
    sector: f.classification?.major,
    industry: f.classification?.main,
    stats: {
      // AUM stands where market cap stands for an equity.
      marketCap:
        f.assetValueNISMillions !== undefined ? f.assetValueNISMillions * 1_000_000 : undefined,
    },
    heDescription: [
      f.classification?.main,
      f.taxStatusName ? `מסלול מס: ${f.taxStatusName}` : undefined,
      f.managementFee !== undefined ? `דמי ניהול: ${f.managementFee}%` : undefined,
      f.trusteeFee !== undefined ? `דמי נאמן: ${f.trusteeFee}%` : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
