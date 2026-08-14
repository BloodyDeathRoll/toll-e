import { describe, expect, it } from 'vitest';
import { accountFeeFor, custodyFeeFor, resolveTier, tradeCommission, type TradeInput } from './fees';
import { getBroker, scheduleFor } from './registry';
import type { BrokerDef, TieredPctFee } from './types';

const sched = (id: string, on = '2026-08-01') => scheduleFor(getBroker(id), on);

const trade = (market: string, shares: number, pricePerShare: number, tierValue?: number, tierId?: string): TradeInput => ({
  market,
  shares,
  pricePerShare,
  tierValue,
  tierId,
});

describe('tradeCommission', () => {
  it('charges the floor when the rate falls short of it — spec §6 case 1', () => {
    // ₪1,000 TASE buy at Meitav: 0.08% = ₪0.80 → charged ₪4.65.
    const q = tradeCommission(sched('meitav-trade'), trade('IL', 100, 10));
    expect(q).toMatchObject({ amount: 4.65, currency: 'ILS', minApplied: true });
  });

  it('charges the rate when it clears the floor', () => {
    // ₪100,000 at 0.08% = ₪80.
    const q = tradeCommission(sched('meitav-trade'), trade('IL', 100, 1000));
    expect(q).toMatchObject({ amount: 80, currency: 'ILS', minApplied: false });
  });

  it('floors per-share pricing: 100 US shares at Meitav cost $7.50, not $1', () => {
    const q = tradeCommission(sched('meitav-trade'), trade('US', 100, 50));
    expect(q).toMatchObject({ amount: 7.5, currency: 'USD', minApplied: true });
    // 1,000 shares → $10 clears the floor.
    expect(tradeCommission(sched('meitav-trade'), trade('US', 1000, 50))).toMatchObject({
      amount: 10,
      minApplied: false,
    });
  });

  it('reports a bank US trade as two components on one quote', () => {
    // Mizrahi, $10,000 trade, ₪20k portfolio → 0.36% = $36, plus the
    // correspondent's 0.5¢ × 100 shares = $0.50 riding the same trade.
    const q = tradeCommission(sched('mizrahi-tefahot'), trade('US', 100, 100, 20_000));
    expect(q).toMatchObject({
      amount: 36.5,
      currency: 'USD',
      passthrough: 0.5,
      tier: { id: 'to-25k', pinned: false },
    });
  });

  it('answers null for a market the broker does not trade — not zero', () => {
    expect(tradeCommission(sched('interactive-israel'), trade('IL', 100, 10))).toBeNull();
    expect(tradeCommission(sched('interactive-israel'), trade('US', 100, 10))).not.toBeNull();
  });

  it('resolves bank tiers from portfolio value, boundary inclusive', () => {
    const leumi = sched('leumi');
    // ₪20k portfolio → bottom tier, 0.25% of a ₪10,000 trade = ₪25.
    expect(tradeCommission(leumi, trade('IL', 100, 100, 20_000))).toMatchObject({
      amount: 25,
      tier: { id: 'to-25k', pinned: false },
    });
    // ₪2M portfolio → top tier, 0.11% = ₪11.
    expect(tradeCommission(leumi, trade('IL', 100, 100, 2_000_000))).toMatchObject({
      amount: 11,
      tier: { id: 'over-1m', pinned: false },
    });
    // `upTo` is an inclusive bound: exactly ₪25,000 still sits in the bottom tier.
    expect(tradeCommission(leumi, trade('IL', 100, 100, 25_000))).toMatchObject({
      tier: { id: 'to-25k', pinned: false },
    });
  });

  it('honours a pinned tier over the auto resolution', () => {
    const q = tradeCommission(sched('leumi'), trade('IL', 100, 100, 20_000, 'over-1m'));
    expect(q).toMatchObject({ amount: 11, tier: { id: 'over-1m', pinned: true } });
  });
});

describe('resolveTier', () => {
  const fee = sched('leumi').taseTrade as TieredPctFee;

  it('degrades a stale pin to auto instead of throwing', () => {
    // A pin outlives the schedule that named it; the page must not 500.
    const r = resolveTier(fee, 20_000, 'gone-with-the-2025-schedule');
    expect(r).toEqual({ tier: fee.tiers[0], pinned: false });
  });

  it('lands value 0 in the lowest — most expensive — tier', () => {
    expect(resolveTier(fee, 0).tier.id).toBe('to-25k');
  });
});

describe('accountFeeFor', () => {
  const ibi = sched('ibi-trade'); // ₪15/month, offset against commissions
  const meitav = sched('meitav-trade'); // ₪15/month, not offset

  it('offsets the month’s commissions against the fee', () => {
    expect(accountFeeFor(ibi, 20)).toBe(0);
    expect(accountFeeFor(ibi, 6)).toBe(9);
    expect(accountFeeFor(ibi, 0)).toBe(15);
  });

  it('charges a non-offset fee regardless of commissions', () => {
    expect(accountFeeFor(meitav, 500)).toBe(15);
  });

  it('charges nothing where no account fee exists', () => {
    expect(accountFeeFor(sched('psagot-trade'), 0)).toBe(0);
  });
});

describe('custodyFeeFor', () => {
  const fibi = sched('fibi'); // 0.01%/yr, min ₪15, max ₪450 per quarter

  it('clamps a small quarter to the per-period minimum', () => {
    // ₪100k × 0.01% ÷ 4 = ₪2.50 → floor ₪15.
    expect(custodyFeeFor(fibi, 100_000)).toBe(15);
  });

  it('clamps a huge quarter to the per-period maximum', () => {
    // ₪100M × 0.01% ÷ 4 = ₪2,500 → cap ₪450.
    expect(custodyFeeFor(fibi, 100_000_000)).toBe(450);
  });

  it('charges the rate between the clamps', () => {
    // ₪10M × 0.01% ÷ 4 = ₪250.
    expect(custodyFeeFor(fibi, 10_000_000)).toBe(250);
  });

  it('charges nothing at an investment house', () => {
    expect(custodyFeeFor(sched('meitav-trade'), 1_000_000)).toBe(0);
  });
});

describe('registry', () => {
  it('throws on an unknown broker id', () => {
    expect(() => getBroker('bank-of-narnia')).toThrow('Unknown broker: bank-of-narnia');
  });

  it('resolves the schedule in force at a date, last-wins', () => {
    const b: BrokerDef = {
      id: 'test',
      name: 'Test',
      nameHe: 'בדיקה',
      kind: 'investment_house',
      schedules: [
        { taseTrade: { type: 'pct', pct: 0.001, currency: 'ILS' } },
        { effectiveFrom: '2026-07-01', taseTrade: { type: 'pct', pct: 0.0005, currency: 'ILS' } },
      ],
    };
    expect(scheduleFor(b, '2026-06-30').taseTrade).toMatchObject({ pct: 0.001 });
    expect(scheduleFor(b, '2026-07-01').taseTrade).toMatchObject({ pct: 0.0005 });
    expect(scheduleFor(b, '2027-01-01').taseTrade).toMatchObject({ pct: 0.0005 });
  });
});
