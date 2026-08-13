# Session Handoff — 2026-08-13

## Goal
Diagnose a reported bug — a buy of 21 SNDK showed as 210 shares at 124.90 on the
stock page — and wire that page's position card to the real portfolio.

## Current State
Done and pushed: `06cf85b` is head, tree clean except `handoff.md`.
Green: `pnpm lint`, `pnpm typecheck`, 107 Vitest, **13/13** `pnpm test:e2e`.

The stock page's "YOUR POSITION" card now reads the real book. Verified in the
running app with a throwaway Playwright spec (signed in as the e2e user, booked
21 SNDK @ 1250 on 07/27, read the rendered card, deleted the transaction):

```
Day's gain +2,359.56 (+8.84%) | Total gain +2,801.61 (+10.67%)
Shares 21 | Avg cost 1,250.00 | Market value 29,051.61 | Tax if sold $700.40
```

Internally consistent: 21 × 1,383.41 = 29,051.61; gain = that − 26,250; tax =
25% of gain; day's gain = 21 × the live change. `/stock/TSLA` (not held) renders
no card at all.

Known broken / not done (all carried forward, none touched this session):
- **TASE prices are in agorot.** Yahoo returns `currency: ILA`, e.g. `TEVA.TA`
  = 10950 meaning ₪109.50. Nothing handles `ILA`; IL portfolios are labelled
  `ILS` with `₪`. **Every TASE figure on screen is 100× too large.** Phase 0 of
  the commissions plan; blocks any percentage fee with a shekel floor.
- **No commission input exists** and `app/api/portfolios/[id]/tax/preview/route.ts:34`
  hardcodes `commission: 0`, so the sell preview understates cost.
- `taxIfSold` on the stock card is a **flat-rate estimate** — it ignores the
  loss-carryforward shield, same as Home. A true figure needs the tax preview
  endpoint.
- The rest of the stock page (key stats fallbacks, next event, the `stock`
  fixture from `getDemoStock`) is still demo-backed where live data is missing.
- Custody-fee valuation will be an estimate — `price_history` is only populated
  when someone views a daily chart (`src/market-data/index.ts:108`).
- 320px viewports overflow (Home 14px, stock 25px). Left alone deliberately;
  360/390/412 measure 0px.
- `docs/israeli-commissions-plan.md` is a plan only — **nothing in it is built**.
- EN/HE message files are 457 keys each, no drift, but there is still **no
  parity test**.
- A dev server runs on :3000 (LAN: 192.168.1.133:3000).

## Active Files
- `app/[locale]/(app)/stock/[symbol]/stock-screen.tsx` — the only file changed.
  Position card + day's gain now come from `/api/positions`.

Read but unchanged, and the references that mattered:
- `components/use-portfolio.ts` — `usePortfolioPositions(marketId)`; states are
  `loading | signed-out | empty | data`.
- `src/server/portfolios.ts` — `getPositions`, the `PositionsPayload` shape.
- `src/engine/portfolio/index.ts:190` — `positionView`, the shared position math.
- `components/holdings-table.tsx:240` — `positionRows`, the established
  `taxIfSold = max(0, gain) × rate` convention this reused.
- `src/demo/data.ts:113` — the SNDK fixture row that was being displayed.

## Changes Made This Session
1. **Diagnosis.** The card was sourced entirely from `getDemoHolding(marketId,
   symbol)` with a fallback to the *other* market's row (`stock-screen.tsx:60`).
   Every figure on screen matched `src/demo/data.ts:113` byte-for-byte —
   210 · 124.90 · 29,218.98 · +2,989.98 (+11.31%). The 210 was never the user's
   21 scaled; it is a hardcoded design value that happens to sit near it.
   One number was a hybrid, which is what made it look like a scaling bug:
   `daysGain = holding.shares * change` — demo shares × the *live* quote change,
   210 × 99.005 = 20,791.05, exactly what was shown.
2. **Wiring (06cf85b).** `usePortfolioPositions(market.id)` — the portfolio of
   the market the *instrument* trades in, not the browsed lens, which answers
   from the wrong book for a US symbol viewed under the IL tab.
3. **Market value struck at the page's own price** (`live ? shares * price :
   position.marketValue`) so the card cannot disagree with the headline above
   it; the server's figure stands in when there is no live quote.
4. **Demo only when signed out.** Someone signed in who does not hold the symbol
   now gets no card, rather than someone else's shares. Deliberately *not* the
   house convention — Home falls back to demo on `loading` too — because a flash
   of a fake position is the very bug being fixed.
5. **Tax rate is the portfolio's.** `taxIfSoldNote` hardcoded `rate: 25`; it
   reads `portfolio.taxRatePct` now, and the whole tax block hides at 0% per the
   plan's invariant. Both the desktop grid and the mobile card.
6. **Total cost** reads the engine's `totalCost` instead of `shares × avgCost` —
   they diverge once commissions land.

## Failed Attempts
- **Chasing a 10× scaling bug.** 21 → 210 and 1250 → 124.90 both looked like a
  factor of ten, and `'21' + 0 === '210'` is a real JS trap with Drizzle numeric
  columns (they come back as strings). It was a coincidence — the demo row is
  just those numbers. Check the fixtures before theorising about arithmetic.
- **`npx playwright test --testDir <path>`** — not a valid flag. Copy the
  throwaway spec into `e2e/` and delete it after.
- Carried forward from the previous session, still hard constraints:
  - **`scrollIntoView` on every focus event** in the tx form — a field owns
    several focusable things, so the page jumps under a finger that never left.
    Key the scroll to a *change of field*.
  - **The prefill-claim-key idiom for commission** — a commission depends on
    shares, so a claim key containing `shares` is invalidated by every keystroke
    and clobbers a hand-typed value. Use a `'profile' | 'manual'` ownership flag.
  - **Measuring layout with a bare `document.querySelector`** — both the mobile
    and desktop branches render (one `display:none`). Filter on
    `offsetParent !== null` and measure the specific element.
  - **Testing the Tax screen with no sales** — it renders the empty state, not
    the shield card. Create a buy/sell pair via the API first.

## Next Step
Unchanged from last session — start the commissions work at **Phase 0** of
`docs/israeli-commissions-plan.md`: normalize `ILA` → `ILS` at the provider
boundary in `src/market-data/yahoo.ts` (`toQuote` ~line 114, plus the chart and
summary mappers) — divide price-like fields by 100 and report `ILS`. Add a
Vitest for the conversion. Ship it as its own commit; every TASE figure on
screen changes by 100×.

Then Phase 1: `src/brokers/registry.ts` + `fees.ts` (pure, framework-free —
`src/markets/registry.ts` and `scheduleFor` at `src/markets/calendar.ts:93-99`
are the templates), with the 12 institutions from
`docs/israeli-commissions-spec.md`.

Smaller, independent: the `commission: 0` in
`app/api/portfolios/[id]/tax/preview/route.ts:34` is a two-line fix, worth doing
whenever the form gains its commission field.
