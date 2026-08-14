import { describe, expect, it } from 'vitest';
import { computeCosts, type CostsInput, type CostsTx } from './index';
import { computeTax } from '../tax';
import type { EngineTx } from '../portfolio';
import { getBroker, scheduleFor } from '@/src/brokers/registry';

const sched = (id: string) => scheduleFor(getBroker(id), '2026-08-01');

const ctx = (tradeDate: string, commission: number, currency = 'ILS'): CostsTx => ({
  tradeDate,
  commission,
  currency,
});

const base = (over: Partial<CostsInput>): CostsInput => ({
  year: 2026,
  today: '2026-08-14',
  txs: [],
  schedule: null,
  firstTradeDate: '2026-03-05',
  ...over,
});

describe('computeCosts — account fee', () => {
  it('offsets each month’s commissions against an offset-able fee — spec §6', () => {
    // IBI: ₪15/month, מתקזז. ₪20 of March commissions → ₪0; ₪6 in April →
    // ₪9; quiet months pay in full.
    const ledger = computeCosts(
      base({
        schedule: sched('ibi-trade'),
        txs: [ctx('2026-03-10', 20), ctx('2026-04-12', 6)],
        commissionsInFeeCurrency: { 3: 20, 4: 6 },
      }),
    );
    const feeByMonth = new Map(ledger.months.map((m) => [m.month, m.accountFee]));
    expect(feeByMonth.get(3)).toBe(0);
    expect(feeByMonth.get(4)).toBe(9);
    expect(feeByMonth.get(5)).toBe(15);
    // March through July = 0 + 9 + 3 × 15 — August is still running.
    expect(ledger.accountFee).toEqual({ amount: 54, currency: 'ILS' });
  });

  it('charges a non-offset fee in full regardless of commissions', () => {
    const ledger = computeCosts(
      base({
        schedule: sched('meitav-trade'),
        txs: [ctx('2026-03-10', 20)],
        commissionsInFeeCurrency: { 3: 20 },
      }),
    );
    // Five ended months, ₪15 each, the ₪20 of commissions notwithstanding.
    expect(ledger.accountFee).toEqual({ amount: 75, currency: 'ILS' });
  });

  it('never bills the month still running — future trades may yet cover it', () => {
    const running = (today: string) =>
      computeCosts(base({ schedule: sched('meitav-trade'), today })).months.some((m) => m.month === 8);
    // Mid-August, and even on August's own last day, no fee exists yet…
    expect(running('2026-08-14')).toBe(false);
    expect(running('2026-08-31')).toBe(false);
    // …it becomes a fact only once the month is behind us.
    expect(running('2026-09-01')).toBe(true);
  });

  it('waived months owe nothing — spec §2 promo waivers', () => {
    const ledger = computeCosts(
      base({
        schedule: sched('meitav-trade'),
        accountFeeWaivedUntil: '2026-05-31',
      }),
    );
    // March–May waived; August still running; June–July remain.
    expect(ledger.accountFee).toEqual({ amount: 30, currency: 'ILS' });
    expect(ledger.months.map((m) => m.month)).toEqual([6, 7]);
  });

  it('runs no fee clock before the first trade or without a schedule', () => {
    expect(computeCosts(base({ schedule: sched('meitav-trade'), firstTradeDate: undefined })).accountFee).toBeNull();
    expect(computeCosts(base({ txs: [ctx('2026-03-10', 20)] })).accountFee).toBeNull();
    // No fee at a broker without one.
    expect(computeCosts(base({ schedule: sched('psagot-trade') })).accountFee).toBeNull();
  });
});

describe('computeCosts — trade commissions', () => {
  it('keeps currencies apart: both keys present, never cross-summed', () => {
    // Spec §6: US min $7.50 and TASE min ₪4.65 in the same portfolio never
    // interact and never convert.
    const ledger = computeCosts(
      base({
        txs: [ctx('2026-03-10', 4.65, 'ILS'), ctx('2026-03-20', 7.5, 'USD'), ctx('2026-04-02', 4.65, 'ILS')],
      }),
    );
    expect(ledger.tradeCommissions).toEqual({ ILS: 9.3, USD: 7.5 });
    expect(ledger.months.find((m) => m.month === 3)?.tradeCommissions).toEqual({ ILS: 4.65, USD: 7.5 });
  });

  it('counts only the requested year', () => {
    const ledger = computeCosts(base({ txs: [ctx('2025-12-30', 100), ctx('2026-01-05', 5)] }));
    expect(ledger.tradeCommissions).toEqual({ ILS: 5 });
  });
});

describe('computeCosts — custody', () => {
  it('applies the quarterly clamps per period — FIBI min ₪15, max ₪450', () => {
    const ledger = computeCosts(
      base({
        schedule: sched('fibi'),
        valuations: [
          { year: 2026, quarter: 1, value: 100_000, basis: 'market' }, // ₪2.50 → floor ₪15
          { year: 2026, quarter: 2, value: 100_000_000, basis: 'market' }, // ₪2,500 → cap ₪450
        ],
      }),
    );
    expect(ledger.custody).toEqual({
      amount: 465,
      currency: 'ILS',
      basis: 'market',
      quarters: 2,
      quartersAtCost: 0,
    });
  });

  it('derives the honesty label from the valuation bases', () => {
    const ledger = computeCosts(
      base({
        schedule: sched('fibi'),
        valuations: [
          { year: 2026, quarter: 1, value: 1_000_000, basis: 'cost' },
          { year: 2026, quarter: 2, value: 1_000_000, basis: 'market' },
        ],
      }),
    );
    expect(ledger.custody).toMatchObject({ basis: 'partial', quarters: 2, quartersAtCost: 1 });
  });

  it('bills no custody at an investment house or with no valued quarters', () => {
    expect(
      computeCosts(base({ schedule: sched('meitav-trade'), valuations: [{ year: 2026, quarter: 1, value: 1, basis: 'cost' }] }))
        .custody,
    ).toBeNull();
    expect(computeCosts(base({ schedule: sched('fibi') })).custody).toBeNull();
  });
});

describe('custody never touches tax', () => {
  it('the tax computation is identical with and without a custody-bearing schedule', () => {
    // Periodic fees are not part of any lot's basis or any sale's proceeds
    // and are never netted at source (spec §4.5) — computeTax cannot even
    // see a fee schedule, and this pins that it stays that way.
    let seq = 0;
    const etx = (type: 'BUY' | 'SELL', tradeDate: string, shares: number, price: number): EngineTx => ({
      id: `t${++seq}`,
      type,
      symbol: 'TEVA.TA',
      tradeDate,
      shares,
      pricePerShare: price,
      commission: 4.65,
      createdAt: seq,
    });
    const txs = [etx('BUY', '2026-01-10', 100, 100), etx('SELL', '2026-03-10', 100, 150)];

    const before = computeTax(txs, { ratePct: 25 });
    computeCosts(
      base({
        schedule: sched('leumi'),
        txs: txs.map((t) => ({ tradeDate: t.tradeDate, commission: t.commission, currency: 'ILS' })),
        valuations: [{ year: 2026, quarter: 1, value: 15_000, basis: 'market' }],
        commissionsInFeeCurrency: { 1: 4.65, 3: 4.65 },
      }),
    );
    const after = computeTax(txs, { ratePct: 25 });
    expect(after).toEqual(before);
  });
});
