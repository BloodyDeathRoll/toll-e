# Israeli broker & bank commissions

## Context

toll-e tracks what trades earn and what they cost in tax, but not what they cost in fees.
An Israeli investor pays 0.06–0.09% per TASE trade at an investment house and 0.3–0.5% at
a bank, plus a monthly account fee, plus — at banks — a quarterly custody fee on the whole
portfolio. Over a year those can exceed the tax. None of it is visible, and there is no way
to even enter a commission.

`docs/israeli-commissions-spec.md` (in the repo, currently untracked) is the authoritative
spec: six fee primitives, 2026 rate tables for 7 investment houses and 5 banks, the rules
for how commissions enter the tax engine, and seven edge cases to test.

Three goals: **record** what each action costs, **total** it per month and per year, and
**ask** each user once who they trade through so the numbers fill themselves in. A fourth
shapes the structure — the catalogue and its maths are a self-contained, framework-free
library, so a future public "compare Israeli brokers" tool imports them unchanged.

---

## What already works — do not rebuild

The engine side of the spec is **already implemented**:

| Spec | Status | Where |
|---|---|---|
| §4.1 buy commission capitalized into basis | **done** | `src/engine/portfolio/index.ts:95` — `costPerShare: price + commission / shares` |
| §4.2 sell commission off proceeds | **done** | `src/engine/portfolio/index.ts:117` |
| §4.3 pro-rata split on partial lots | **done, for free** | commission is encoded *per share*, so any partial consumption carries its share |
| §4.4 commission in the trade's currency | **done** | engine is currency-blind; `EngineTx` has no `currency` |
| §4.6 withholding unaffected | **done** | `computeTax` reads only `ev.gain` and `ev.date` |
| persistence | **done** | `transactions.commission numeric(20,6) NOT NULL DEFAULT '0'` |
| write APIs | **done** | POST + PATCH already accept and store it |

Two holes: `tx-screen.tsx` has no commission input so the column is always `0`, and
`app/api/portfolios/[id]/tax/preview/route.ts:34` hardcodes `commission: 0`.

**So this is not an engine change.** It is a catalogue, a fee-maths library, an onboarding
flow, one form field, and two report surfaces.

One deliberate divergence: §4.3 also wants the *sell* commission split per FIFO match. The
engine deducts it once at sale level and the aggregate is identical — per-match attribution
is a drill-down feature, not a correctness fix. **Not in scope.**

---

## Decisions taken

1. **All six fee types**, including the bank custody fee.
2. **Onboarding is skippable.** "I'll set this later" is recorded as a real answer so the
   user is never re-prompted; commissions then default to 0 everywhere, per spec §5.
3. **Totals appear twice**: a Costs card on Performance, and a per-month line in the P&L tab.
4. **Fix the agorot bug first** (Phase 0).
5. **One broker per user.** Nobody trades in two places, so the choice lives on the account
   and there is no per-portfolio column. This also makes the account fee unambiguous: one
   account, one ₪15/month, however many portfolios sit under it.
6. **Option fees are catalogue data only.** Options are out of v1 and toll-e has no options
   transactions, but the comparison tool will want them.
7. **Custody is derived from the catalogue**, not typed off a statement. The researched rates
   are close enough for anyone who does not know their own, and everyone else can tweak them —
   so the override layer, not data entry, is the answer to a wrong rate. The valuation behind
   it is still an estimate and is still labelled as one.
8. **Commissions in any currency count toward the monthly-fee offset.** The server converts
   them into the fee's currency before the engine sees them (below).
9. **One release**, not two.

---

## Phase 0 — TASE prices are in agorot

Yahoo returns TASE prices in **agorot**, currency `ILA`. Verified live:

```
TEVA.TA | currency: ILA | price: 10950   → ₪109.50
POLI.TA | currency: ILA | price:  7684   → ₪76.84
```

`src/market-data/yahoo.ts:114` passes both through untouched while `ensurePortfolio` labels
IL portfolios `ILS` with a `₪`. TASE values already render 100× too large — a pre-existing
bug. It blocks this work because commission floors are quoted in **real shekels** (₪4.65),
so `0.08% × value_in_agorot` against a ₪4.65 floor mixes units by 100× and the floor would
never bind.

**Fix at the provider boundary** so nothing downstream needs to know: in
`src/market-data/yahoo.ts`, when the provider reports `ILA`, divide price-like fields by 100
and report `ILS`. Touches `toQuote`, the chart mapper and the summary mapper. Unit test for
the conversion.

Every TASE number on screen changes by 100× in this release. That is the correction, but it
is visible — worth its own commit so it can be reverted independently.

---

## Phase 1 — the fee library (pure, framework-free)

`src/brokers/` — no React, no Next, no DB. This is what the comparison tool imports.

### `src/brokers/types.ts` + `registry.ts`

Mirrors `src/markets/registry.ts` in shape and tone ("brokers are data, not code"): plain
object keyed by id, `getBroker(id)` that **throws**, `brokerIds`, ids as strings never enums.
Effective dating copies `scheduleFor` from `src/markets/calendar.ts:93-99` verbatim — oldest
→ newest, first entry omits `effectiveFrom`, last-wins on ISO string compare.

```ts
export interface PctFee       { type: 'pct';       pct: number; min?: number; max?: number; currency: string }
export interface PerShareFee  { type: 'per_share'; perShare: number; min?: number; currency: string }
export interface PerContractFee { type: 'per_contract'; fee: number; min?: number; currency: string }

export interface Tier { id: string; /** inclusive upper bound; omitted on the top tier */ upTo?: number; pct: number; min?: number }
export interface TieredPctFee {
  type: 'tiered_pct';
  /** Tiers are read against portfolio value in THIS currency — banks tier on ₪ even for a $ trade. */
  tierCurrency: string;
  tiers: Tier[];
  currency: string;
}
export type TradeFee = PctFee | PerShareFee | TieredPctFee;

export interface AccountFee { monthly: number; currency: string; offsetAgainstCommissions: boolean }
export interface CustodyFee { annual: TieredPctFee; billing: 'quarterly'; minPerPeriod?: number; maxPerPeriod?: number }

export interface FeeSchedule {
  effectiveFrom?: string;
  taseTrade?: TradeFee;
  usTrade?: TradeFee;                  // houses: per_share. banks: tiered_pct.
  usTradePassthrough?: PerShareFee;    // bank correspondent, on the same trade
  maofOption?: PerContractFee;         // catalogue only — no code path
  usOption?: PerContractFee;           // catalogue only
  accountFee?: AccountFee;
  custodyFee?: CustodyFee;
  fxFeePct?: number;                   // display only, never in tax
}

export interface BrokerDef {
  id: string;                          // 'meitav-trade', 'leumi'
  name: string;
  nameHe: string;
  kind: 'investment_house' | 'bank';
  schedules: FeeSchedule[];            // oldest → newest
}
```

**Two deliberate deviations from spec §5**, both forced by the spec's own §3 tables: `usTrade`
must allow a percentage (banks charge 0.16–0.36% on US trades, not cents per share), and
percentage fees need tiers (Leumi TASE 0.25% ≤₪25k → 0.11% >₪1M). The spec's JSON model has
neither.

Hebrew names as a sibling `nameHe`, matching the `src/demo/data.ts` idiom rather than the
spec's nested `{en, he}` — one convention per repo. Every bank rate carries a
`// TODO(verify):` marker, the idiom already used in `registry.ts` for uncertain calendar
data; spec §7 calls bank numbers "the softest".

### `src/brokers/fees.ts`

```ts
export interface TradeInput {
  market: string;          // registry id
  shares: number;
  pricePerShare: number;
  /** Portfolio value already expressed in the fee's `tierCurrency`. Banks only. */
  tierValue?: number;
  /** User-pinned tier; falls back to auto when stale. */
  tierId?: string;
}
export interface FeeQuote {
  amount: number;
  currency: string;
  /** True when the floor, not the rate, set the price — spec §6 case 1. */
  minApplied: boolean;
  /** Correspondent component, already included in `amount`. */
  passthrough?: number;
  tier?: { id: string; pinned: boolean };
}
/** null = this broker does not trade this market (Interactive Israel has no TASE). */
export function tradeCommission(s: FeeSchedule, t: TradeInput): FeeQuote | null;
export function resolveTier(f: TieredPctFee, value: number, pinnedId?: string): { tier: Tier; pinned: boolean };
export function accountFeeFor(s: FeeSchedule, commissionsSameCurrency: number): number;
export function custodyFeeFor(s: FeeSchedule, avgValue: number): number;
```

`resolveTier` **degrades rather than throws** on an unknown pinned id — a pin goes stale when
a schedule is superseded, and a stale pin must not 500 a page. That diverges from `getBroker`'s
throw; comment it.

### Tests — `src/brokers/fees.test.ts`

Existing fixture style (module-level counter, positional factory). Min fee dominating (₪1,000
TASE at Meitav → **₪4.65**, `minApplied: true`; ₪100,000 → ₪80.00, false); per-share floor
($7.50 not $1.00); bank US trade reporting **two** components; tier resolution at ₪20k vs ₪2M
plus the exact ₪25,000 boundary; stale pin falling back to auto; offset fee (₪20 → **₪0**,
₪6 → **₪9**, ₪0 → ₪15); custody tier with min and max binding; effective dating; unknown
broker throwing; unserved market returning `null`.

---

## Phase 2 — the broker profile: storage, API, hook

**No `lib/auth.ts` change.** `additionalFields` serialize into every session response on every
request, and the sign-in path is what 13 e2e tests stand on. The profile gets its own table.

```ts
export const brokerProfiles = pgTable('broker_profiles', {
  id: id(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  /** Registry id. NULL = answered "I'll set this later". */
  brokerId: text('broker_id'),
  /** Pinned bank tier; NULL = resolve from portfolio value. */
  tierId: text('tier_id'),
  /** Sparse field-level overrides merged over the resolved schedule. */
  overrides: jsonb('overrides').$type<FeeOverrides>(),
  accountFeeWaivedUntil: date('account_fee_waived_until'),   // spec §2 promo waivers
  /** Non-null even for "later" — this is what stops the re-prompt. */
  answeredAt: timestamp('answered_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [uniqueIndex('broker_profiles_userId_idx').on(t.userId)]);
```

Also `transactions.commissionSource text` (nullable) — spec §5's audit field.

Migrations via `pnpm db:generate` (never hand-written): `0001` adds `commission_source`,
`0002` adds `broker_profiles`.

- `src/server/broker-profile.ts` (`server-only`): `getBrokerProfile(userId)`,
  `upsertBrokerProfile(userId, patch)`, and `resolveSchedule(profile, isoDate)` returning the
  registry schedule with sparse overrides merged on top — the same layered precedence
  `hoursFor` already uses (holiday → schedule → per-date override).
- `app/api/broker-profile/route.ts` — GET/PUT, house conventions: inline `getSession()` → 401,
  module-scope zod, `{ error: string }`, `{ ok: true }`.
- `components/use-broker-profile.ts` — the `use-watchlists.ts` state machine, with
  **`'unset'` as a first-class state** distinct from `'data'` with `brokerId: null`
  (answered "later"). No optimistic updates.
- `src/brokers/overrides.test.ts` — merging is sparse: an override on `taseTrade.min` leaves
  `pct` untouched, and an override on a field the schedule lacks does not invent one.

---

## Phase 3 — onboarding

You asked for a gate: the first thing users see, existing users prompted too. Building that.

- **Route**: `app/[locale]/(app)/onboarding/page.tsx` + `onboarding-screen.tsx`, inside `(app)`
  so it inherits the shell, with `'/onboarding'` added to `OWN_ACTION` in `bottom-nav.tsx` so
  the tab bar yields to an `ActionBar` — the established full-page flow, reference
  implementation `CreateList` in `watchlists-screen.tsx:453-565`. Kind → institution → review
  the resolved rates. No back arrow; a first-run gate has nowhere to go back to. "I'll set this
  later" is a plain link, not a disabled-looking afterthought.
- **Gate**: `components/app-shell/onboarding-guard.tsx`, sibling of `AuthGuard` in `AppShell`,
  same shape — client, renders nothing, redirects when the hook reports `'unset'` and the path
  is not `/onboarding`. It must respect `useHydrated()` (`lib/use-hydrated.ts`) or it trips the
  hydration mismatch that file exists to prevent, and it must not redirect while the hook is
  `'loading'` or the app flashes onboarding on every cold load.
- `/onboarding` also joins `AuthGuard`'s `PUBLIC_PATHS` — it matches with exact `includes`, so
  a signed-out user mid-flow would otherwise bounce to `/`.

**The e2e risk, handled deliberately.** `e2e/smoke.spec.ts` signs in on 9 of 13 tests then
navigates straight to a deep route; a redirect breaks all of them. Fix inside the existing
`accountReady` guard in the shared `signIn()` helper: once per run, navigate to the flow and
click Skip. That is test setup mirroring what a real user does once — not a weakening of the
gate. Plus two new tests: the gate appears for a fresh account, and never again after an answer.

---

## Phase 4 — commission on the transaction form

`app/api/portfolios/[id]/tax/preview/route.ts` first: add `commission` to the zod schema and
pass it to the candidate instead of the hardcoded `0`. Two lines.

`tx-screen.tsx`:
- A `stepper(t('commission'), ...)` between the price stepper and the Total row — the last
  per-trade money field, above the total it feeds. Total becomes `shares × price + commission`
  on a buy, `−` on a sell, matching engine semantics.
- Under it, one line naming the source: `Meitav Trade · 0.08% · min ₪4.65 applied`, or
  `No broker set — Set one` when there is no profile.

**Auto-fill is an ownership flag, not a claim key.** The existing prefill-claim idiom
(`prefilledFor === \`${symbol}@${tradeDate}\``) is the wrong tool and the divergence must be
commented. Price and shares are *one-shot* fills keyed on what they depend on; a commission is
a *continuous function* of symbol, market, date, shares and price — a claim key containing
`shares` would be invalidated by every keystroke in the shares field and clobber a hand-typed
commission.

```ts
const [commission, setCommission] = useState(0);
/** 'profile' = tracks the schedule; 'manual' = the user owns this number. */
const [commissionSource, setCommissionSource] = useState<'profile' | 'manual'>('profile');
```

While `'profile'`, an effect recomputes from `tradeCommission(...)` on every input change —
bump the quantity and the suggestion follows. The first manual edit flips to `'manual'` and the
effect never writes again. **Edit mode loads the stored value and sets `'manual'` immediately**,
so a historical, possibly negotiated number is never overwritten. A "reset to suggested"
affordance flips back — the only way out of a typo. This is exactly spec §5's "auto-fill, don't
auto-compute silently", and `commissionSource` is persisted as `manual` or
`profile:<brokerId>@<effectiveFrom>`.

The suggestion is computed **client-side from static registry data** — `src/brokers/fees.ts` has
no DB or framework imports, so the form imports it as it already imports `getMarket`. No round
trip.

**Tier resolution**: pinned tier wins; else auto from `state.data.totals.marketValue`, which the
screen already has via `usePortfolioPositions` (no new fetch); else the lowest, most expensive
tier, said plainly in the source line — pessimism is the safe default for a cost.

**Tests**: the two §6 cases the existing suites lack — one sell matching three lots with
commissions on every leg (per-match gains sum to the un-split calculation), and a commission
edited retroactively on a fully-consumed lot moving *all* downstream artifacts: matched-lot
costs, the month pool, the withholding, and the registered shield.

---

## Phase 5 — the cost ledger

Split three ways, and the split is what makes custody testable — vitest runs `node` env, so
anything importing `@/src/db` cannot be unit-tested.

1. **`src/engine/costs/valuation.ts`** (pure) — sampling dates, nearest-close selection from a
   supplied map, the mean, and the basis classification.
2. **`src/engine/costs/index.ts`** (pure) — the ledger. Takes `PeriodValuation[]` as an *input*,
   exactly as `computeTax` takes `TaxRuleSet`.
3. **`src/server/costs.ts`** — the one SQL query, and nothing else.

**Custody valuation.** Banks bill quarterly on portfolio value, which we do not store but can
derive: `computePortfolio(txs ≤ date)` gives holdings at any date, `price_history` gives closes.
Sample the last calendar day of each of a quarter's three months and take the mean — a daily
mean would need ~90 lookups per symbol per quarter and is no more defensible given source data
that is itself opportunistic.

Price lookup per (symbol, date): the last close on or before it **only if the gap is ≤ 7 days**
— a close from three months back is a guess, not a valuation; else that symbol's lot cost basis
at the date. **Never call the provider inline**: a cost figure must not be able to make a page
slow or fail. `price_history` is populated opportunistically (`persistDailyCloses` fires only
when someone views a daily chart, `src/market-data/index.ts:108`), so misses are normal.

Each period carries `basis: 'market' | 'partial' | 'cost'`, and the label is derived from it —
"Custody fee (estimated)", or "2 of 6 quarters valued at cost". **The word "paid" never appears
on that row**: it is an estimate of a charge, not a record of one. Backfill is explicit, never
automatic — a "Improve this estimate" action that calls `getChart(symbol, '5y')` per holding
(which already persists closes) and reports coverage.

**Multi-currency.** The ledger returns totals **grouped by currency and never summed across
them**; conversion happens once at the presentation layer with the rate already in the payload,
per `AGENTS.md`. Extract `convert()` out of `performance.ts` into `src/server/fx-convert.ts`
rather than copying it — two FX closures will drift.

**The offset counts every currency.** "₪15 offset against commissions paid that month" applies
to dollar commissions too, so a US-only month still earns the waiver. That needs a conversion —
but the no-FX rule binds the **tax** engine, and this is the cost ledger, which is presentation.
So the split is: `src/server/costs.ts` converts the month's commissions into the fee's currency
using the same rate the Performance payload already carries, and hands the engine one plain
number. `accountFeeFor(schedule, commissionsInFeeCurrency)` stays pure and FX-free, and the
converted figure is auditable because the rate travels in the payload.

In practice this rarely swings the answer — one US trade at $7.50 is already worth more than
₪15 — but it matters for a month of small TASE trades, where two ₪4.65 minimums come to ₪9.30
and the offset is genuinely partial (fee ₪5.70, not ₪0).

**The account fee is per account, not per portfolio.** A user with a US and an IL portfolio at
Meitav owes ₪15/month **once**. So trade commissions compute per portfolio, but account and
custody fees compute **once at user level** over the union of months and holdings — and on a
market-scoped screen they are labelled *"Account-level · all portfolios"* and never summed into
a per-market total.

**Tests** → spec §6: offset and non-offset fees; waiver dates; quarterly custody with min/max
clamping; **custody never touches tax** (run `computeTax` with and without a custody fee
configured and assert the two computations are deeply equal); mixed-currency totals holding both
keys and no cross-sum; a quarter with no priced symbols still producing a line with
`basis: 'cost'`; a 30-day-old close rejected and a 3-day-old one accepted.

---

## Phase 6 — the two surfaces

- `src/server/performance.ts` — `costs` on `PerformancePayload`, `costs` + `costsNative` on
  `PerformanceMonth`. One extra `price_history` read inside the existing `Promise.all`.
- **Costs card** on `performance-screen.tsx`, between Sectors and the realized card: trade
  commissions · account fees · custody (estimated) · total, with InfoDots carrying the honesty
  copy and the existing `fxNote` string when more than one currency is present.
- **Per-month line** in `pnl-pane.tsx` — with a trap to avoid.

**The double-count trap.** Trade commissions are **already inside** `m.gains`/`m.losses`: they
were folded into basis and proceeds before matching. Periodic fees are in nothing. So the month
expansion needs two visually distinct rows: *Trade commissions*, marked "already reflected
above" and **outside** the footing; and *Account fees*, a genuine extra cost. **Do not add a new
bottom line in v1** — `afterTax = m.net - m.tax` means one thing across the whole app, and
redefining it changes every number the user has ever seen. This needs a load-bearing comment or
someone will "fix" it later.

- `src/i18n/parity.test.ts` — **new**. There is no automated EN/HE key-parity test today;
  `handoff.md` tracks it by hand, and this work adds ~50 keys to two files. Assert identical
  recursive key sets.

---

## Phase 7 — settings and docs

- `settings-screen.tsx` gains a Broker row linking to the flow, showing the current choice or
  "Not set" — following the `defaultMarket` precedent, including its rule that a preference
  surfaced in two places writes the same state from both, so onboarding's review step and the
  settings editor are one component.
- `AGENTS.md`: a scope note in the shape of the allocation-analytics one — commission tracking
  is in; **broker linking/CSV import remains out**. A fee profile is static data, not a
  credential.
- `git add docs/israeli-commissions-spec.md` — it is untracked and is now the source of truth.
- `src/brokers/README.md` — how to add an institution, how to date a rate change. The first file
  the comparison tool's author reads.

---

## Verification

- `pnpm test` — new `fees.test.ts`, `overrides.test.ts`, `costs` suites, the ILA conversion, the
  parity test, and the two added FIFO/tax cases, on top of the existing 107.
- `pnpm test:e2e` — the 13 existing green with the gate in place, plus the two gate tests and
  the broker-profile round trip.
- `pnpm lint`, `pnpm typecheck`, EN/HE parity (now enforced by test).
- In the browser at 402px in **both locales**: fresh user hits onboarding → picks Meitav → a
  ₪1,000 TASE buy suggests **₪4.65** (floor, not ₪0.80) → the Total reflects it → basis is
  ₪1,004.65 → the Costs card shows the year → the P&L month line shows the month. Then as a bank
  user to exercise the tier and the custody estimate.

---

## Risks

All four open questions are now decided (Decisions 7–9 above). What remains is risk, not choice.

**1. Bank rates will be wrong for some users.** Spec §7 says so plainly — bank tiers are
negotiable and published actuals disagree between sources. The answer is the override layer, not
better research: every rate is editable, and each bank default carries `TODO(verify)` in the
registry so nobody mistakes it for a checked figure.

**2. The custody *valuation* stays an estimate even with the rate corrected.** Editing the rate
fixes the multiplier; the thing it multiplies is still our reconstruction of what the portfolio
was worth at each quarter end, from price history that is only saved when someone happens to
view a chart. Hence the `basis: 'market' | 'partial' | 'cost'` marker on every period, the
label derived from it, and the rule that the word "paid" never appears on that row.

**3. The 100× TASE correction is visible.** Phase 0 changes every TASE figure on screen in the
same release. It is the fix, but it lands in its own commit so it can be reverted alone.

**4. `tx-screen.tsx` gains a fourth state machine.** It already carries three prefill machines
and heavy explanatory comments. The commission one deliberately breaks the established
claim-key idiom, so it needs a comment saying why or someone will "simplify" it back into a bug.

**5. The P&L double-count is a trap for a future reader**, not for this change. The commission
row sits outside the month's footing on purpose; that needs a load-bearing comment.

**6. Migration ordering.** Two generated migrations land in one release. They must be generated
with `pnpm db:generate` and applied in order — never hand-edited, since `_journal.json` and the
snapshot regenerate with them.
