# Session Handoff — 2026-08-11

## Goal
Fix the intraday charts that rendered the *previous* day full-width for the
first minutes after the opening bell, then work a run of phone-review
requests: app chrome on full-page flows, reorderable Holdings, chart
scrubbing, an About section with industry screens, stat tooltips, RTL
alignment, and a watchlist showing `0.00%` on rows that were not flat.

## Current State
Everything is committed and pushed; `95457d9` is head, tree clean.
Green: `pnpm lint`, `pnpm typecheck`, 101 Vitest, **13/13** `pnpm test:e2e`
(the long-standing `smoke.spec.ts:76` failure is fixed — see below).
EN/HE message files are 417 keys each, no drift.

Verified in the running app (Playwright, 412px, EN + HE unless noted):
- **Charts, two views.** Trading: axis is the bell-to-bell day, line runs
  previous close → bars → dot on the live quote, so an empty feed still
  draws. Closed: last finished session, full width, no dot. Measured live
  at 26 min in (line ends 4/90px), at a simulated bell (2 points, hard
  left), and with the clock faked to 22:00 ET (90/90px, no dot).
- **Scrubbing** the stock chart: mouse and touch both read out price,
  change-from-range-start and timestamp; releasing restores the live quote.
  1Y reads dates, 1D reads clock times.
- **Bottom nav** absent on `/transactions/new` and `/watchlists/new`,
  present on Home/Transactions/Tax. Zero console errors on five screens
  (was 2 — a hydration mismatch).
- **Holdings reorder**: drag on its edit screen, Home lays out in that
  order. API refuses rename/add/remove/delete on it (409), permits reorder.
- **About + screens**: tags open `/screen/{sector|industry}/{name}`;
  `Semiconductors` → NVDA TSM AVGO MU… "30 of 115"; `TEVA.TA` → 12 TASE
  names. Info dots 12×12 on Vol/P-E/Mkt cap/Beta.
- **Quotes**: 60 symbols asked → 60 returned (was capped at 24).

Known broken / not done:
- **Light mode: the field border is invisible.** `--border` and `--well` are
  both `#eff0f4`. Carried from two sessions ago, still unfixed.
- **`$-0.00` on the tax screen** (`tax-screen.tsx`); fixed only in
  `performance-screen.tsx`. Carried over.
- No auto-scroll while dragging past the screen edge in the reorder list.
- The **on-device translation was only exercised against a stubbed
  Translator.** Real Chrome reports `en→he` as `downloadable`, so the real
  path is plausible but unproven on a device.
- `watchlist-card.tsx:93` and `stock-screen.tsx:373` still carry
  `(x?.changePct ?? 0)`. Neither renders a misleading `0.00%` (one shows a
  blank, one only picks a colour), so both were left alone deliberately.
- TASE **election days** are unencoded — they follow no calendar and must be
  added by hand to `registry.ts` when one is called.
- The eve half-day close is **assumed** to be 13:45 (the Friday bell);
  unverified against TASE's published calendar.
- A dev server runs in the background on :3000 (restarted mid-session).

## Active Files
- `src/markets/calendar.ts` — `intradaySeries` gained `live` + `lastTradeAt`;
  new `sessionLine()` builds the drawn polyline for both views.
- `src/markets/hebrew-calendar.ts` — **new**; TASE closures derived from the
  Hebrew calendar via `Intl`. `hebrew-calendar.test.ts` — **new**, 9 tests.
- `src/markets/registry.ts` — TASE holidays/eves wired in; US 2028 added.
- `src/market-data/yahoo.ts` — `pickSession(points, cal, now, lastTradeAt)`;
  new `getScreen()` + `screenerName()`.
- `src/market-data/index.ts` — `intradayTtl()` clamps to the bell;
  `getQuotes` batches by 20 and dedupes; `getScreen` cached 5 min.
- `app/api/market/quote/route.ts` — cap is now 200 **and a 400**, not a slice.
- `app/api/market/screen/route.ts` — **new**.
- `app/[locale]/(app)/screen/**` — **new**; classification screen.
- `components/price-chart.tsx` — scrubbing (crosshair, dot, `onScrub`).
- `components/charts.tsx`, `portfolio-chart.tsx` — draw via `sessionLine`.
- `components/quote-bits.tsx` — `ChangePill` takes optional `pct`; `NO_VALUE`.
- `components/info-dot.tsx`, `use-translation.ts`, `app-content.tsx`,
  `lib/use-hydrated.ts` — **new**.
- `app/[locale]/(app)/stock/[symbol]/stock-screen.tsx` — scrub state, About
  card, info dots, `StatCell` alignment.

## Changes Made This Session
1. **Charts (e024f4b).** Three faults stacked: `pickSession` needed two 5m
   bars before calling today a session; the intraday TTL straddled the bell;
   and `intradaySeries` fell back to the whole finished day when the live
   session had no bars. The provider's last-trade stamp now separates "the
   bell just rang" from "this exchange is shut and the calendar is wrong".
2. **Chrome (65baff3).** better-auth resolves `useSession` from a client
   cache synchronously, so the nav appeared a render before the HTML said
   so. `useHydrated()` (via `useSyncExternalStore`) gates both navs.
   `/transactions/new` joins `/watchlists/new` as a full-page flow.
3. **Calendars (e356531).** TASE had *no* holidays at all. Named in the
   Hebrew calendar rather than transcribed, so it cannot rot; handles leap
   years (Purim → Adar II) and the Yom HaAtzmaut postponement.
4. **Holdings (9c90ce0).** Reorder-only edit screen, enforced in the API too.
5. **Scrubbing (8bc1492).** The dot is HTML, not SVG — the viewBox stretches
   horizontally, so a circle renders as an ellipse. Surface is `pan-y`.
6. **About + screens (d0efa1b).** Yahoo's classification filters live on a
   POST screener the library does not model; routed through its own `_fetch`
   for the crumb. Taxonomy mismatch: profiles say `Software - Infrastructure`,
   the screener only answers to `Software—Infrastructure`.
7. **RTL + translation (254e316).** `StatCell` children were stretched to the
   label's width; a `dir="ltr"` value then sat at the *left* of that box.
8. **Quotes (95457d9).** Route sliced at 25 and dropped the tail; rows
   laundered the silence into a green `0.00%` via `?? 0`.

## Failed Attempts
- **Hand-rolled Yahoo crumb** (`fc.yahoo.com` → `/v1/test/getcrumb` → POST
  screener): got **429 Too Many Requests** on the crumb endpoint, twice,
  minutes apart. Do not go back to this; use `yf._fetch(..., needsCrumb)`.
- **`yf._fetch` with a POST straight away**: 405 Method Not Allowed — the
  `fetchOptions` are applied to the *crumb* request too. A priming `yf.quote`
  call first leaves a cached crumb and fixes it.
- **`yf.screener`** is predefined-only (15 canned screens); no industry filter.
- **`yf.search('Semiconductors')`** returns name matches, not sector members;
  `'Software - Infrastructure'` returned nothing at all.
- **`recommendationsBySymbol`** is co-viewing ("people also watch"), not
  industry: NVDA → TSLA, AMZN, AAPL.
- **`lang=he-IL` on quoteSummary** returns the *same English* description;
  Yahoo does not localise `longBusinessSummary`. Verified he/fr/en.
- **Measuring RTL drift by bounding box** reports 0 for every cell — a
  stretched child's box matches its sibling's exactly. Measure the text
  (`Range.getBoundingClientRect`), which showed 39px on מכפיל רווח.
- **`p-2` on a `size-3` button** collapsed the info glyph to 0 width
  (border-box). Grow the tap target with `before:-inset-2` instead.
- **Tailwind `size-3` is 13.5px here**, not 12 — root font-size is 18px.
  The spec-literal 12px needs `size-[12px]`.
- **Playwright's `synthesizeScrollGesture` scrolls nothing** on this page,
  chart or not; it cannot test that `pan-y` lets the page scroll. Assert the
  computed `touch-action` instead.
- **The dev server served stale i18n JSON**, rendering raw keys like
  `stock.showOriginal`. Restart `pnpm dev` after adding message keys.

## Next Step
Fix the light-mode field border: give fields their own token instead of
`--border`, which equals `--well` (`#eff0f4`) in `app/globals.css`, so a
field's border is currently its own fill colour. Then the `$-0.00` in
`app/[locale]/(app)/tax/tax-screen.tsx` — copy the guard already in
`performance-screen.tsx`.

Worth confirming on a real phone: tap **תרגם** on a stock page's About
section and check Chrome actually downloads the en→he model and translates.
