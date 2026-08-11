# Session Handoff — 2026-08-11

## Goal
Fix the intraday charts that kept rendering as a sliver off hours, then work
through a run of mobile UI requests: whole-row taps with a loading spinner, one
shared watchlist menu, a swipeable index strip, bigger type, drag-to-reorder,
and a single control height.

## Current State
Everything is committed and pushed; `fe13569` is head. Only `handoff.md` (this
file, from the *previous* session) was dirty going in.

Verified in the running app (Playwright, 412px viewport, EN + HE):
- **Charts.** Off hours every 1D chart spans the full width (portfolio chart,
  holdings/watchlist/index sparklines, stock page). Replayed mid-session with a
  faked clock + truncated feed: lines stop at ~⅓ width with the rest of the
  session reserved. Feed now returns the last *regular* session (79 bars,
  09:30–16:00) for stocks and indexes alike.
- **Rows.** Home holdings, home watchlists and the Watchlists page rows are
  full-row links; the tapped row dims with a spinner overlay while pending
  (only that row; measured opacity 0 → 1 → gone). Star on the Watchlists page
  does not navigate.
- **List menu.** Edit watchlist / Add tickers / Delete (red) / — / Create new
  list, identical on home and Watchlists. On Holdings all four show, first
  three disabled. Info dot beside the Holdings title pops "Locked. Only reflect
  your transactions".
- **Index strip** swipes: 5 US indexes, 3 cards a screen, 2 page dots, correct
  active dot at both ends in LTR and RTL.
- **Type.** Root font-size 18px; ticker 18 / price 16 / pill 16 / after-hours 14
  in ticker rows. No horizontal overflow on Home, Stock, Markets, Tax,
  Watchlists.
- **Drag reorder** (edit watchlist) works by finger/mouse and by arrow keys, and
  persists across reload.
- **Controls** are all 48px with `border border-border`.

Known broken / not done:
- **Light mode: the new field border is invisible.** `--border` and `--well` are
  both `#eff0f4`, so a field's border is its own fill colour. Reads fine in dark
  (`--well` black, border `#1b291f`). Fields need their own border token.
- **`e2e/smoke.spec.ts:76`** — carried over from the previous session, not
  touched or re-run this session. It expects "Revenue vs earnings" on the stock
  summary, which only the mobile Financials tab renders.
- `$-0.00` still on the tax screen (`tax-screen.tsx`), fixed only in
  `performance-screen.tsx`.
- No auto-scroll while dragging past the screen edge in the reorder list.
- TASE holidays still unencoded (Hebrew calendar); the "no prints today → show
  the last finished session" fallback covers it.
- A dev server is running in the background on :3000 (restarted mid-session).

## Active Files
- `src/markets/calendar.ts` — `hoursFor()`, `specialHours`, rewritten
  `intradayBounds`, new `intradaySeries`.
- `src/markets/registry.ts` — NYSE holidays 2026–27 + 13:00 half-days.
- `src/market-data/yahoo.ts` — `pickSession(points, calendar)`: regular-hours
  bars only, newest day that actually traded.
- `components/charts.tsx`, `price-chart.tsx`, `portfolio-chart.tsx` — draw
  through `intradaySeries`.
- `components/row-link.tsx` — **new**; link + pending overlay.
- `components/list-menu.tsx` — **new**; `ListMenu` + `ListInfo`.
- `components/swipe-row.tsx` — **new**; snapping carousel with page dots.
- `components/reorder-list.tsx` — **new**; pointer-event drag reordering.
- `app/[locale]/(app)/watchlists/[id]/{edit,add}/page.tsx` — **new** routes.
- `app/[locale]/(app)/home-screen.tsx`, `watchlists/watchlists-screen.tsx`,
  `components/watchlist-accordions.tsx` — rows, menus, info dot, type sizes.
- `components/app-shell/{app-header,lang-currency,search-box}.tsx`,
  `components/dropdown.tsx`, `components/watchlist-sheet.tsx`,
  `transactions/new/tx-screen.tsx`, `stock/[symbol]/stock-screen.tsx` — 48px.
- `app/globals.css` — 18px root; the user's own darker dark palette.
- `src/i18n/messages/{en,he}.json` — 429 keys each, no drift.

## Changes Made This Session
1. **Charts (8a56ebe).** Two bugs: `pickSession` treated three pre-market prints
   as a session, and `intradayBounds` read the session off the *last data
   point's* day and reserved room to 20:00. Now one rule tested against the
   clock: regular session running *and* the series belongs to it → bell-to-bell
   axis; everything else → data extent, full width. Extended-hours bars are no
   longer plotted on 1D.
2. **Rows + menu (1d89189, 6e6eb09).** Whole-row links, `useLinkStatus` spinner,
   shared `ListMenu`, `ListInfo`, edit/add routes, ticker search added to the
   edit screen, header plus 43 → 40px.
3. **Index carousel (e866f60).** All registry indexes (not demo data, which
   carries an untracked TASE index), page dots not per-card dots.
4. **Type (98dc8aa).** Root 18px + exact px sizes in ticker rows.
5. **Reorder (82a9d05).** HTML5 DnD → pointer events; `GripHorizontal`.
6. **Dark palette (60f4033)** — the user's own edit, committed as-is.
7. **Controls (dd55268)** — 48px + card border everywhere.
8. **Watchlist rows (7d71d03, fe13569)** — added the sparkline, removed the
   company name, then put the name back on request.

## Failed Attempts
- **The spinner as an in-flow 16px slot broke row alignment.** It was added
  always-present-at-zero-opacity to avoid layout shift, but a column at the row
  end is width the numbers lose, and the graph+numbers block stopped meeting the
  margin (mirrored in HE). Overlay, not column.
- **A dot per card** in the carousel left the last two cards unreachable with a
  3-up view. Dots must count screens.
- **New i18n keys need a dev-server restart.** `t('reorder')` rendered as the
  literal `lists.reorder` until `next dev` was restarted; Turbopack did not pick
  the JSON up.
- **Seeding transactions with `type='buy'`** throws `OversellError` and the home
  screen falls back to the sign-in wall. The column is uppercase `BUY`/`SELL`.
- **`psql` is not installed**; use `docker compose exec -T db psql -U toll-e -d toll-e`.
- **Playwright**: import from
  `node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs`, and
  after signing in via `page.request.post`, `page.goto` to a URL already visited
  serves the cached signed-out page — call `page.reload()`.
- **RTL `scrollLeft` counts down from zero** (negative); read it with `Math.abs`.
- The header plus already measured exactly the search bar's 43px; "make it the
  same height" was about perceived weight, not geometry. Measure before
  believing a size complaint.
- Carried over and still true: never `| tail` typecheck output (grep for
  `error`); `exact: true` in Playwright role queries; inject
  `nextjs-portal{display:none!important}` before screenshots.

## Next Step
**Decide the light-mode field border.** Add a token (e.g. `--field-border`,
a shade darker than `#eff0f4`) in `app/globals.css` and swap the field classes
onto it, or accept that the border is dark-mode-only.

Follow-ups:
- `e2e/smoke.spec.ts:76`: drop the "Revenue vs earnings" assertion or render
  `financialsCard` on the mobile summary tab.
- `$-0.00` on `app/[locale]/(app)/tax/tax-screen.tsx` (copy `neg()` from
  `performance-screen.tsx`).
- Edge auto-scroll in `components/reorder-list.tsx` for lists taller than the
  screen.
- Encode TASE holidays in `src/markets/registry.ts`.
- Dead code: `WatchlistMenuButton` in `components/watchlist-star.tsx`.
