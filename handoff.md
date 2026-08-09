# Session Handoff — 2026-08-07

## Goal
Finish Phase 4 of toll-e (stock-page depth, polish, Hebrew pass), then ship it:
deploy to Vercel with a real database, add a Yahoo-outage fallback, make the app
installable as a PWA, and replace email/password auth with Google-only sign-in.

## Current State
**Live and public at https://toll-e.vercel.app** — Neon Postgres, live Yahoo data,
auto-deploy on push to main. All local gates green: 42 vitest, 15 Playwright e2e,
typecheck, lint, production build. Working tree clean except `handoff.md`.

Working and verified in production:
- Stock page News / Analysis / Financials tabs on real Yahoo data.
- Google OAuth: Google serves a real consent screen branded "toll-e",
  `redirect_uri = https://toll-e.vercel.app/api/auth/callback/google`. Password
  sign-up correctly refused (`EMAIL_PASSWORD_SIGN_UP_DISABLED`).
  **Not end-to-end tested** — the last step needs a human typing a Google password.
- PWA: manifest, service worker, icons all serve; install sheet verified locally
  (appears, `prompt()` fires, dismissal sticks, Settings row persists, HE RTL ok).
- Yahoo works from Vercel's datacenter IPs (the main deploy risk, now cleared).

Known broken / incomplete:
- **CI does not run on push.** No Actions check suite is created since commit
  `cc33fc2`; manual `workflow_dispatch` DOES create a run. Cause unknown.
- Local Google sign-in will fail until `http://localhost:3000/api/auth/callback/google`
  is added to the same Google OAuth client (only the prod URI is registered).
- Tax export button still visual-only; TASE hours still `TODO(verify)`; holidays
  arrays empty; portfolio value history ignores intra-period transactions.
- Mobile has no overlay chart / checkboxes (desktop-only by design).

## Active Files
- `src/market-data/{types,yahoo,index}.ts` — added `getNews`/`getAnalysis`/`getFinancials`
  + per-class TTLs (news 15m, analysis 6h, financials 24h) + `yahoo()` kill-switch wrapper.
- `src/market-data/fallback.ts` — NEW. BoI → Frankfurter FX; quotes/charts replayed
  from persisted `price_history`.
- `app/api/market/{news,analysis,financials}/[symbol]/route.ts` — NEW routes.
- `app/[locale]/(app)/stock/[symbol]/stock-screen.tsx` — three tabs, `?tab=` deep links,
  EPS/recommendation/target/holders cards, watchlist star wiring.
- `components/watchlist-star.tsx` — NEW. Star + per-list dropdown picker.
- `components/{privacy-toggle,use-privacy,stale-badge}.{tsx,ts}` — NEW. Privacy blur + stale chips.
- `components/install-prompt.tsx`, `lib/install.ts` — NEW. PWA install sheet + Settings row.
- `app/manifest.ts`, `public/sw.js`, `public/icon-*.png`, `scripts/generate-icons.py` — NEW PWA assets.
- `lib/auth.ts` — Google-only; origin derived from Vercel env; localhost URL ignored on Vercel.
- `app/[locale]/(auth)/auth-form.tsx` — rewritten as a single Google button.
- `e2e/smoke.spec.ts`, `playwright.config.ts` — NEW smoke suite (15 tests).
- `.vercelignore` — NEW. Keeps local env files out of deployment bundles.
- `.env.local` / `.env.local.example` — renamed this session (was `.env` / `.env.example`).

## Changes Made This Session
1. **Phase 4 stock tabs** — News (filtered to `relatedTickers` containing the symbol;
   Yahoo search news is fuzzy and returns unrelated articles otherwise), Analysis,
   Financials with a real annual/quarterly toggle. Added `?tab=` deep-linking, mainly
   so the tabs are testable headlessly.
2. **Playwright smoke suite + CI e2e job** — `workers: 1` on purpose: parallel first-hits
   stampede Turbopack's cold compile and 500 with chunk/JSON races.
3. **Watchlist wiring** — star toggles the default list; desktop button is a per-list
   picker; "Move to list" enabled. Verified with a throwaway browser script against the
   real API, then cleaned the test data up.
4. **Polish + privacy + Hebrew** — signed-in empty states replace demo data, skeletons,
   stale badges, `.private` blur via `html[data-privacy]` restored pre-paint. EN/HE key
   parity was already 100%; verified every screen in Hebrew by screenshot.
5. **Yahoo fallback** (`src/market-data/fallback.ts`) — FX falls back to Bank of Israel
   (the plan's tax-grade source) then ECB/Frankfurter; quotes and daily charts replay from
   `price_history`. News/analysis/financials have no free fallback and degrade to empty
   states. `MARKET_DATA_DISABLE_YAHOO=1` simulates an outage; drill passed.
6. **Vercel deploy** — Neon via marketplace integration, migrations applied,
   `BETTER_AUTH_SECRET` generated per environment, SSO protection disabled (user chose
   "make it public").
7. **Google-only auth** — password auth survives ONLY behind `E2E_TEST_AUTH=1` AND
   `VERCEL_ENV !== 'production'`, so a stray env var cannot reopen sign-up on the live site.
8. **PWA** — ported from `~/Projects/rosa` (which is Vite/Preact, so only the install
   logic transferred; manifest/SW were rewritten Next-native). The service worker
   deliberately caches NOTHING — a stale portfolio value is worse than an offline message.
9. **Env rename** to `.env.local` / `.env.local.example` with ignore rules updated.

## Failed Attempts
- **`.env` was being uploaded by `vercel deploy`.** Next loads it at runtime, so
  `BETTER_AUTH_URL=http://localhost:3000` beat the real URL and Google's OAuth
  `redirect_uri` pointed at localhost — would have broken sign-in for every user.
  Fixed by `.vercelignore` + ignoring a localhost URL when `process.env.VERCEL` is set.
  Git-based deploys never had this problem.
- **A test account leaked into the production database.** The Neon integration overwrote
  `.env.local`, so a local Playwright run wrote `shahar@test.dev`/`testpass123` to Neon.
  Purged; all user tables are at 0. Watch for this: any local command run while
  `.env.local` holds Neon credentials hits production.
- **Better Auth rejected every production request** ("Invalid origin") because Vercel
  deployment hosts are dynamic. Fixed by deriving `baseURL`/`trustedOrigins`. Note the
  canonical production URL is `toll-e.vercel.app`, NOT the longer
  `toll-e-bloodydeathroll-…` alias — testing the alias produces a false origin failure.
- **Quota was the WRONG diagnosis for CI not running.** Manual dispatch works, and ~12
  runs at ~2 min is nowhere near the 2000-minute free tier. `/timing` reports 0 billable
  ms for every run (inconclusive). Not `[skip ci]` either — no markers in the messages.
- **Stooq is dead as a fallback source** — quote CSV 404s and history is behind a
  JavaScript proof-of-work wall. Do not retry it.
- Playwright's `request` fixture sends no `Origin` header (Better Auth CSRF rejects it)
  and its cookies don't reach the page — use `page.request` with an explicit `Origin`.
- Both mobile and desktop layouts render simultaneously (one is `display:none`), so every
  e2e text lookup must filter to `{ visible: true }` or it hits a strict-mode violation.
- The install sheet's scrim and its "Not now" button shared an accessible name — gave the
  scrim its own `close` label.

## Next Step
**Finish diagnosing why pushes stop triggering CI.** A run was dispatched manually
(`gh run view 31128119882`) but never checked; the immediate question is whether a
dispatched run *executes* or hangs queued:
```
gh run view 31128119882 --json status,conclusion,jobs
gh api repos/BloodyDeathRoll/toll-e/commits/$(git rev-parse HEAD)/check-suites \
  --jq '.check_suites[] | "\(.app.slug) \(.status)"'
```
If dispatch executes fine, the push event itself is the problem — check repo Settings →
Actions, and whether the Vercel/Claude/Render GitHub apps interfere. Reading billing needs
`! gh auth refresh -h github.com -s user` (interactive, must be run by the user).

Follow-ups:
- Add `http://localhost:3000/api/auth/callback/google` to the Google OAuth client so local
  sign-in works; then sign in once on production to confirm the round-trip.
- Consider rotating the Google client secret — earlier CLI deploys shipped `.env` into
  deployment bundles (private to the Vercel account, not a public leak).
- Remaining Phase 4/v1 gaps: tax export button, TASE hours `TODO(verify)`, true portfolio
  value history (positions × `price_history` replay).
