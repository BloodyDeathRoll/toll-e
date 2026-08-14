# src/brokers — the Israeli broker fee catalogue

Pure TypeScript: no React, no Next, no DB. toll-e's transaction form and cost
ledger import it, and a future public "compare Israeli brokers" tool is meant
to import it unchanged — keep it that way.

- `types.ts` — the six fee primitives (docs/israeli-commissions-spec.md §1).
  Institutions are configurations of these; the maths models the primitives,
  never the institutions. All `pct` fields are **fractions**: `0.0008` = 0.08%.
- `registry.ts` — the data: 7 investment houses, 5 banks, 2026 rates.
- `fees.ts` — the arithmetic: `tradeCommission`, `resolveTier`,
  `accountFeeFor`, `custodyFeeFor`.
- `overrides.ts` — sparse user overrides merged over a resolved schedule.

## Adding an institution

Add one entry to `brokers` in `registry.ts`:

1. Id is a kebab-case string ('meitav-trade'), never an enum — ids are stored
   in the DB as text.
2. `name` + `nameHe` as siblings (the `src/demo/data.ts` idiom), `kind` is
   `'investment_house'` or `'bank'`.
3. One `FeeSchedule` in `schedules`, **without** `effectiveFrom` — the first
   schedule is simply "since we've known this broker".
4. Leave out any fee the broker does not charge. Absent `taseTrade` means
   "does not trade TASE" and `tradeCommission` answers `null` for it — null,
   not zero: "free" and "impossible" must not look alike.
5. Mark every figure you could not verify against a tariff page with
   `// TODO(verify):` and say what is soft about it. Bank rates are
   negotiated and tiered on the bank's own valuation — they are starting
   defaults for the user's override layer, not checked facts.

## Dating a rate change

Never edit an existing schedule — append:

```ts
schedules: [
  { /* the old rates, effectiveFrom omitted */ },
  { effectiveFrom: '2027-01-01', /* the new rates, complete */ },
]
```

- Oldest → newest; `scheduleFor` walks last-wins on ISO string compare,
  exactly like the market calendar's `scheduleFor`.
- A schedule is **complete**, not a diff: copy the unchanged fees forward.
- Stored commissions on old transactions are already authoritative and do
  not recompute; what the date changes is the *suggestion* for backdated
  entries, which reads the schedule in force at the trade date.
- Tier ids (`'to-25k'`) should stay stable across schedules where the tier
  survives — a user's pinned tier degrades to auto when its id disappears.
