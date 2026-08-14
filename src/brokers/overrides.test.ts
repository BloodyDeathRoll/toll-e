import { describe, expect, it } from 'vitest';
import { applyOverrides } from './overrides';
import { getBroker, scheduleFor } from './registry';
import type { PctFee, TieredPctFee } from './types';

const sched = (id: string) => scheduleFor(getBroker(id), '2026-08-01');

describe('applyOverrides', () => {
  it('returns the schedule untouched with no overrides', () => {
    const s = sched('meitav-trade');
    expect(applyOverrides(s, null)).toBe(s);
    expect(applyOverrides(s, {})).toEqual(s);
  });

  it('merges a single leaf and leaves its siblings alone', () => {
    // A negotiated min on the TASE fee must not disturb the rate.
    const merged = applyOverrides(sched('meitav-trade'), { taseTrade: { min: 3.1 } });
    expect(merged.taseTrade).toEqual({ type: 'pct', pct: 0.0008, min: 3.1, currency: 'ILS' });
    // …and the untouched fees are still the catalogue's.
    expect(merged.usTrade).toEqual(sched('meitav-trade').usTrade);
  });

  it('does not invent a fee the schedule lacks', () => {
    // Interactive Israel has no TASE desk; an override cannot open one.
    const merged = applyOverrides(sched('interactive-israel'), { taseTrade: { pct: 0.0005 } });
    expect(merged.taseTrade).toBeUndefined();
    // Meitav has no custody fee; a bank-shaped override cannot add one.
    const meitav = applyOverrides(sched('meitav-trade'), { custodyFee: { minPerPeriod: 20 } });
    expect(meitav.custodyFee).toBeUndefined();
  });

  it('never lets an undefined override key clobber a value', () => {
    const merged = applyOverrides(sched('meitav-trade'), { taseTrade: { pct: undefined, min: 4 } });
    expect((merged.taseTrade as PctFee).pct).toBe(0.0008);
    expect((merged.taseTrade as PctFee).min).toBe(4);
  });

  it('ignores keys the fee type does not read', () => {
    // A stray perShare cannot corrupt a pct fee.
    const merged = applyOverrides(sched('meitav-trade'), { taseTrade: { perShare: 0.02 } });
    expect(merged.taseTrade).toEqual(sched('meitav-trade').taseTrade);
  });

  it('replaces bank tiers wholesale and clamps custody per-period bounds', () => {
    const tiers = [{ id: 'negotiated', pct: 0.001 }];
    const merged = applyOverrides(sched('leumi'), {
      taseTrade: { tiers },
      custodyFee: { minPerPeriod: 0 },
    });
    expect((merged.taseTrade as TieredPctFee).tiers).toEqual(tiers);
    expect((merged.taseTrade as TieredPctFee).tierCurrency).toBe('ILS');
    expect(merged.custodyFee?.minPerPeriod).toBe(0);
    expect(merged.custodyFee?.annual).toEqual(sched('leumi').custodyFee?.annual);
  });

  it('merges the account fee sparsely', () => {
    const merged = applyOverrides(sched('meitav-trade'), { accountFee: { monthly: 0 } });
    expect(merged.accountFee).toEqual({ monthly: 0, currency: 'ILS', offsetAgainstCommissions: false });
  });
});
