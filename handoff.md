# Session Handoff — 2026-08-11

## Goal
Work through a long list of UI corrections from phone review: chart session
bounds, the watchlist star sheet, transaction month labels, the tax "Detailed
view" jump — then make the market selector actually select the market (not a
display currency) and filter every screen by it, then a round of Hebrew/RTL
alignment fixes.

## Current State
Everything below is committed, pushed, CI green, and **live on
https://toll-e.vercel.app** (deployed manually — see Failed Attempts).

Verified working:
- All four language × market combinations, and they survive a reload.
  🇺🇸/🇮🇱 = language, $/₪ = market, in the header picker and on the Account page.
- Market filters everything owned: home, transactions, tax, performance,
  watchlists. A market with no portfolio shows its own empty state.
- Charts fill the axis after the close; measured 0%→100% on all marks.
- Hebrew alignment fixes on the stock page, tax screen, and holders table.

Known broken / not done:
- **Push-to-deploy is not firing.** `4ee58a4` produced no Vercel deployment
  (no GitHub deployment, commit status `pending` with zero statuses, 20+ min).
  `2612423` deployed fine two hours earlier. Undiagnosed.
- `$-0.00` still shows for zero realized losses on the tax screen.
- Search deliberately still returns both markets (so you can add a US ticker
  while browsing Israel). Flagged to the user; no objection yet.
- Two duplicate "AI bets" test lists in the dev account.
- Legal pages still need a lawyer; one human Google sign-in on production and
  localhost would close the OAuth loop; the old OAuth client in the old Google
  account is still there.

## Active Files
- `src/markets/calendar.ts` — `intradayBounds` now takes `now` and fills the
  axis once the session is over.
- `src/markets/calendar.test.ts` — 6 new `intradayBounds` cases.
- `src/markets/registry.ts` — `marketForSymbol(symbol)`, from the provider suffix.
- `components/app-shell/lang-currency.tsx` — header picker: language × market.
- `app/[locale]/(app)/settings/settings-screen.tsx` — two dropdowns (Language
  by flag, Market by `$ American` / `₪ Israeli`); display-currency row deleted.
- `components/use-portfolio.ts`, `components/use-tax.ts`,
  `app/[locale]/(app)/transactions/journal-screen.tsx`,
  `app/[locale]/(app)/performance/performance-screen.tsx` — generation guard so
  only the newest request writes state.
- `src/server/performance.ts`, `app/api/performance/route.ts` — scoped to a
  market; display currency follows that market.
- `components/watchlist-sheet.tsx` — Holdings shown selected + disabled at 40%.
- `components/watchlist-accordions.tsx`, `components/watchlist-card.tsx`,
  `app/[locale]/(app)/watchlists/watchlists-screen.tsx` — rows filtered to the
  selected market, priced by each ticker's own market.
- `app/[locale]/(app)/stock/[symbol]/stock-screen.tsx` — market from the symbol,
  not the lens; header price hugs the start; gain rows stack; holders columns
  aligned; card spacing on Financials/News/Analysis.
- `app/[locale]/(app)/tax/tax-screen.tsx` — monthly tab reports the month only;
  figures hug their column start; yearly "Detailed view" → monthly + scroll.
- `components/more-link.tsx` — added `MoreButton` (in-page, not a route).
- `src/i18n/messages/{en,he}.json` — 427 keys each, no drift.

## Changes Made This Session
1. **Five carry-over items**: after-hours charts fill the width; Holdings shown
   selected-and-disabled in the star sheet; `$`/`₪` instead of `$USD`/`₪NIS`;
   month captions in the transaction journal (date sort only — other sorts
   scramble dates and a caption would lie); yearly tax "Detailed view" jumps to
   that year's months.
2. **Market selector**. The header's $/₪ set a display-currency preference that
   had nothing to do with which portfolio you saw. It now sets the market and
   writes the same state the Account page writes, so they cannot disagree.
   Display currency is gone entirely; Performance reports in the viewed
   market's own currency, so nothing needed it.
3. **Market as a filter**. Performance was aggregating every portfolio.
   Watchlists listed both markets' tickers priced in whichever currency the
   lens happened to be. Per-symbol surfaces went the other way — the stock page
   now takes currency, number format and calendar from where the ticker trades.
4. **Account page**: two dropdowns keyed on the registry, so a third language
   or fourth market is an entry rather than a redesign.
5. **Hebrew alignment**: figures drifted left wherever a `dir="ltr"` span filled
   its column — the direction switch also decides where digits sit inside the
   box. Fixed with `self-start`/`self-end`; the holders table carries `dir` on
   an inline child so `text-end` resolves against the page instead of flipping.
6. **Monthly tax tab** now reports the month alone; year-to-date moved to the
   Yearly tab only. `withheldYtd` key removed.
7. A **concurrent Claude session** rewrote the tax engine to the
   withholding-at-source model (`due`→`owed`, `MonthLedger.tax`→`paid`, plus
   `paid`/`refundNextYear`) in the same files. Both bodies of work went into
   `2612423` because they could not be split without a broken commit.

## Failed Attempts
- **`vercel --prod` was needed because push-to-deploy silently did nothing.**
  Do not assume a green push reaches production; check
  `gh api repos/BloodyDeathRoll/toll-e/deployments`. Before any CLI deploy,
  confirm `.vercelignore` still covers `.env.*` — a past CLI deploy shipped a
  local env file and pointed OAuth at localhost.
- **Checked production with the wrong marker twice.** `Display currency` still
  exists as `perf.displayCurrency`, so grepping for it "proved" a stale build
  that was actually fresh. Grep for a string introduced by the commit.
- **`prettier --write` reformatted a whole file** against the repo's style
  (it uses single quotes; prettier here does not). Reverted and hand-applied.
- **`pnpm typecheck | tail -3` hid 25 errors** behind the route-type banner.
  Always grep the output for `error`.
- **`getByRole('button', {name: '$ US'})` clicked `$ USD`** — substring match.
  This produced a false "the Account market selector does nothing" report.
  Use `exact: true`.
- **A stale-response race**, not a filtering bug, was why ₪ showed US positions:
  the market hydrates from localStorage a beat after mount, so the previous
  market's request was often still in flight and landed last.
- Splitting the tax-engine work from the market work into separate commits was
  attempted and abandoned — the message bundles and `tax-screen.tsx` are shared,
  and any split leaves a commit that does not typecheck.

## Next Step
**Diagnose why pushes stop triggering Vercel.** Same symptom shape as the
CI-not-running mystery in the previous handoff, which turned out not to be
quota. Start with the Vercel GitHub app's connection and the project's Git
settings; compare `2612423` (deployed) with `4ee58a4` (did not):
```
gh api repos/BloodyDeathRoll/toll-e/deployments --jq '.[] | "\(.created_at) \(.sha[0:7])"'
gh api repos/BloodyDeathRoll/toll-e/commits/<sha>/status
```

Follow-ups:
- Fix `$-0.00` for zero realized losses in `app/[locale]/(app)/tax/tax-screen.tsx`.
- Desktop still uses the old star dropdown (`WatchlistMenuButton` in
  `components/watchlist-star.tsx`) rather than the bottom sheet.
- Decide whether search should filter by market (currently does not, on purpose).
- Remaining v1 gaps: tax export button is visual-only, TASE hours are
  `TODO(verify)`, holiday arrays are empty.
