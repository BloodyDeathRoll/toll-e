import { describe, expect, it } from 'vitest';
import en from './messages/en.json';
import he from './messages/he.json';

// EN and HE must carry exactly the same keys: a key present in one file only
// renders as its raw dotted name in the other locale, and nothing but this
// test enforces the pair — handoff notes used to track it by hand.

function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe('message catalogue parity', () => {
  it('en and he define the identical recursive key set', () => {
    const enKeys = keyPaths(en).sort();
    const heKeys = keyPaths(he).sort();
    // Diffed both ways so a failure names the missing keys, not just a count.
    expect(heKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !heKeys.includes(k))).toEqual([]);
    expect(heKeys).toEqual(enKeys);
  });
});
