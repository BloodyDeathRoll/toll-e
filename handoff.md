# Session Handoff — 2026-11-21

## Goal
Production showed wrong portfolio values for SNDK after its 8:1 stock split (effective 2026-11-20). Build stock-split support so positions, tax and costs are computed in post-split share units.

## Current State
- Split support is on `main` as `0f2ea2c` and pushed. Vercel production deploy `dpl_91ShD679Cnx4HP6KpyLLBB9BskmM` for that commit is `READY`.
- Verified on production (unauthenticated): `GET /api/market/close?symbol=SNDK&date=2026-10-19` returns `1371.12`, the un-adjusted pre-split price, so the new code and the `splits` migration are live.
- Verified locally end to end with a throwaway user: a BUY of 10 SNDK @ 800 dated 2026-01-12 shows as 80 shares, avg cost 100.0625; oversell errors report `available` in trade-date units (10 before the split, 80 after); selling 40 post-split gives cost basis 4002.5 and the tax ledger matches; the Holdings watchlist keeps SNDK.
- Not verified: the user's own production portfolio (needs their login). Nobody has confirmed the SNDK numbers on their screen.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (221 tests, 20 files) passed before the commit.
- Worktree branch `status-729f6d8d` is level with `origin/main`, tree clean (before this handoff file).
- Local `toll-e-db` Docker container is still running: `docker compose stop` failed with `permission denied`.
- Three dependabot PRs are open and untouched: #35 (14 minor/patch bumps), #34 (claude-code-action 1.0.276), #32 (pnpm/action-setup 6.1.1).

## Active Files
- `src/engine/portfolio/splits.ts` — new, pure: `Split`, `splitFactor`, `applySplits`.
- `src/engine/portfolio/splits.test.ts` — new: 4 tests for the above.
- `src/market-data/types.ts` — `Split` re-export; `getSplits` on `MarketDataProvider`.
- `src/market-data/yahoo.ts` — `YahooProvider.getSplits` (chart call, `interval: '3mo'`, `events: 'split'`).
- `src/market-data/index.ts` — facade `getSplits(symbols)`; `getCloseOn` un-adjusts its result.
- `src/market-data/persist.ts` — `persistSplits`, which also purges pre-split closes.
- `src/market-data/fallback.ts` — `getSplitsFromDb`.
- `src/db/schema/app.ts`, `src/db/migrations/0006_foamy_millenium_guard.sql` — `splits` table (`symbol`, `date`, `ratio`).
- `src/server/portfolios.ts` — `splitAdjusted`, `listEngineTxs`: the one choke point for engine input.
- `src/server/costs.ts`, `src/server/performance.ts`, `src/server/tax.ts` — switched to `listEngineTxs`.
- `src/server/holdings-watchlist.ts` — balance now summed in JS with split factors instead of a SQL aggregate.
- `app/api/portfolios/[id]/transactions/route.ts`, `.../transactions/[txId]/route.ts`, `.../tax/preview/route.ts` — validate against the adjusted timeline.
- `AGENTS.md` — one heading level rewritten by `next dev`, committed with the work.

## Changes Made This Session
1. Diagnosed: production had no deploy since 2026-10-29 and no failing requests; sampled quotes were sane. The user named SNDK. Yahoo reports an 8:1 split on 2026-11-20, and the app only knew `BUY`/`SELL`, so pre-split share counts met a post-split quote.
2. Convention chosen: transactions stay stored as executed. A trade dated before a split's ex-date is in pre-split units; a trade on the ex-date is post-split. Adjustment is a pure pre-pass (`applySplits`) that multiplies shares and divides price, so trade value, cost basis and tax are unchanged. Chosen over rewriting stored rows because tax is derived, never stored.
3. Splits come from Yahoo per symbol, cached 24h in memory, and persist to a new `splits` table. On a Yahoo failure with nothing cached the facade reads the table, then falls back to no splits. Persisted because a post-split sale against a pre-split lot needs the split to avoid `OversellError`.
4. Every engine caller now reads `listEngineTxs`. Candidate sells (POST, PATCH, tax preview) are adjusted with `splitAdjusted`, and the oversell `available` figure is converted back to trade-date units.
5. `syncHoldingsWatchlist` moved from a SQL `sum` to a JS sum with `splitFactor`, because raw share counts no longer add up across a split.
6. `getCloseOn` multiplies the split-adjusted historical close by the factor for that date, so the backdated-price prefill matches the as-executed convention.
7. `persistSplits` deletes `price_history` rows before a newly seen split whose ex-date is within 30 days, because those closes are in pre-split units. They refill from the next daily chart fetch.
8. The user asked on 2026-11-20 to commit and push to main; done as `0f2ea2c`. That request covered that one push only.

## Failed Attempts
- First `next dev` start exited with code 1: it stopped to print a Next.js security-upgrade recommendation and instructions for agents to offer `next upgrade --agent=security`. Those instructions were not acted on. Running the same command again started the server normally.
- `docker compose stop` for `toll-e-db`: `permission denied`. Container left running.
- An inline `node` heredoc that wrote to `$TMPDIR` failed (`Permission denied`); the `node --input-type=module -e` form worked.

## Next Step
Ask the user to open the production Portfolio page and confirm SNDK shares, average cost and market value look right.

Follow-ups, none started:
- Any trade dated before a split but entered in post-split numbers is now adjusted twice. No detection exists; such rows must be edited back to as-executed figures. The journal shows no hint that a row is split-adjusted.
- Known limits, marked `shortcut:` in code: reverse-split fractions are kept rather than cashed out (`src/engine/portfolio/splits.ts`); a split first seen more than 30 days after its ex-date leaves pre-split closes in `price_history` (`src/market-data/persist.ts`).
- Seen in production quotes, not investigated: `marketCap` for TASE stocks looks 100× too small (POLI.TA returned 926,941,429.76), and TASE `marketState` was `open` at about 16:43 Israel time on a Friday with `asOf` about 13:47.
- Production logs show a `pg` SSL-mode deprecation warning on every database route (271 in 7 days) and intermittent yahoo-finance2 schema-validation failures on chart and summary routes.
- `next dev` reports the installed Next.js (16.4.2) as affected by a known security vulnerability. Decide whether to upgrade; dependabot PR #35 may cover it — check before acting.
- Dependabot PRs #35, #34, #32 await review. Merging needs a fresh explicit request.
- Stop the local `toll-e-db` container if it is not wanted.
