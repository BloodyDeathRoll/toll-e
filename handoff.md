# Session Handoff — 2026-08-05

## Goal
Build toll-e (investment tracker + Israeli tax engine, see `toll-e-plan.md`) from
an empty repo. This session: audit the plan against current tooling and
complete **Phase 0 (foundation scaffold)** of the roadmap in `toll-e-plan.md` §9.

## Current State
Phase 0 is **complete and committed** (`2ec5985`, the only commit; working
tree clean). All verified green: `pnpm typecheck`, `pnpm lint`, `pnpm test`
(10/10), `pnpm build`, and all routes 200 on the dev server.

- Postgres 17 running via `docker compose up -d` (container `toll-e-db`,
  volume `toll-e-pgdata`); all 11 tables migrated.
- A dev server may still be running on :3000 (log at scratchpad `dev.log`).
- Auth endpoints exist but no sign-in/sign-up UI yet; Google OAuth env vars
  are empty in `.env` (email/password works without them).
- Markets/Portfolio/Tax pages are "Coming soon" placeholders.
- Desktop navbar search input is `disabled` — wired in Phase 1.
- CI workflow exists but has never run (no GitHub remote configured).

## Active Files
- `AGENTS.md` — project guidance (CLAUDE.md is just `@AGENTS.md`); commands,
  architecture invariants, scope discipline. Next dev auto-regenerates its
  top block.
- `toll-e-plan.md` — authoritative plan. `ref/` — 22 Yahoo Finance UX screenshots.
- `app/[locale]/layout.tsx` — root layout: html lang/dir, fonts (Geist +
  Rubik for Hebrew glyphs), `dark` class hardcoded (dark-first).
- `app/[locale]/(app)/` — shell route group: home, markets, portfolio, tax.
- `app/api/auth/[...all]/route.ts` — Better Auth handler.
- `proxy.ts` — next-intl middleware (Next 16 renamed middleware → proxy).
- `src/i18n/` — routing (`en`/`he`, prefix always), request config, messages.
- `src/db/schema/auth.ts` — Better Auth tables, CLI-generated (user has
  locale/defaultMarket/displayCurrency extras). `app.ts` — portfolios,
  transactions, watchlists(+items), instruments, price_history, fx_rates.
- `src/db/migrations/0000_deep_raza.sql` — applied.
- `src/markets/registry.ts` — US + IL market defs. `calendar.ts` — pure
  tz-aware calendar engine. `calendar.test.ts` — 10 tests. `money.ts` —
  Money type + formatters.
- `lib/auth.ts`, `lib/auth-client.ts`, `lib/session.ts` — auth plumbing.
- `components/app-shell/` — TopNav, BottomNav, MarketTabs, MarketProvider
  (localStorage-persisted lens). `components/ui/` — shadcn primitives.
- `docker-compose.yml`, `drizzle.config.ts`, `vitest.config.mts`,
  `.github/workflows/ci.yml`, `.env` (gitignored) / `.env.example`.

## Changes Made This Session
1. Wrote CLAUDE.md; create-next-app later generated AGENTS.md and CLAUDE.md
   became `@AGENTS.md` — toll-e guidance now lives in AGENTS.md.
2. Audited plan vs. Aug-2026 reality: Next 16 (not 15), Tailwind 4
   (CSS-first), Zod 4, Better Auth 1.6, next-intl 4 — no blockers.
   **Key finding: TASE moved Sun–Thu → Mon–Fri trading in Jan 2026**;
   plan said Sun–Thu.
3. Scaffolded in scratchpad, copied into repo, `git init -b main`.
4. Drizzle: schema per plan §6 (strings-not-enums, numeric shares/prices,
   money always with currency column), generated + applied migration.
5. Better Auth: config-first, then `@better-auth/cli generate` produced the
   drizzle schema (needed a placeholder `src/db/schema/index.ts` first —
   chicken-and-egg with the db client import).
6. next-intl: `defineRouting`, `proxy.ts` (not middleware.ts), messages,
   locale layout with `dir` + `generateStaticParams`. Verified `/he` renders
   `dir="rtl"` + Hebrew.
7. Market registry + calendar with **effective-dated schedules** (TASE week
   change encoded as two schedules, switch `2026-01-05`); `getMarketState`
   computes open/closed + minutes-to-change via Intl timezone projection.
8. shadcn init: new CLI — `-b` means base library now (radix), preset `nova`,
   native `--rtl` flag used. Consolidated: shadcn owns root `components/` +
   `lib/`; `src/` keeps domain code (engine/db/markets/i18n). This deviates
   from plan §4's `src/components` — recorded in AGENTS.md.
9. Dark theme: near-black oklch tokens, `--color-gain`/`--color-loss` (with
   sign redundancy policy), font-sans stack Geist→Rubik.
10. App shell: mobile bottom tabs / desktop top navbar (two layouts per plan
    §7.1), registry-driven MarketTabs, locale switcher.
11. Vitest (`vitest.config.mts` — `.ts` triggered a Vite CJS warning, `.mts`
    still warns but tests pass), GitHub Actions CI, production build, commit.

## Failed Attempts
- `pnpm approve-builds` crashes non-interactively → use
  `pnpm-workspace.yaml` `onlyBuiltDependencies`/`ignoredBuiltDependencies`
  instead (already configured).
- `@better-auth/cli generate` failed with MODULE_NOT_FOUND until
  `src/db/schema/index.ts` existed (db client imports it).
- shadcn init: `-b neutral` and `--no-src-dir` are invalid in the current
  CLI; `-p base-nova` also invalid — correct form is
  `init -y -b radix --rtl --css-variables -p nova`.
- Typecheck failed on stale `.next/types` after moving app files — fix is
  `pnpm exec next typegen`.
- ESLint `react-hooks/set-state-in-effect` fired on localStorage rehydration
  in `market-context.tsx` — legit pattern, suppressed with inline disable.
- Renaming vitest config `.ts` → `.mts` did NOT fully silence the Vite
  configLoader warning; harmless, ignore or set
  `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`.

## Next Step
**Phase 1 — Market data & stock pages** (`toll-e-plan.md` §9): create
`src/market-data/` with a `MarketDataProvider` interface (`getQuote`,
`getChart`, `search`, `getSummary`, `getFx`) and a Yahoo adapter
(`yahoo-finance2` v4 is current), server-side only, with per-class caching
(quotes 15–60s, intraday 5m, daily 1d, fundamentals 24h, FX daily) persisting
closes/FX to `price_history`/`fx_rates`.

Then: `/api/market/*` route handlers (§8), enable the navbar search
(typeahead), homepage index strip from `markets[id].indexes`, stock page
Summary tab (TradingView `lightweight-charts` v5 + key stats).

Follow-ups / open items:
- Verify TASE Mon–Fri switch date (`2026-01-05`?) and Friday close (13:45
  guessed) in `src/markets/registry.ts` — marked `TODO(verify)`; also fill
  `holidays` arrays (empty).
- No GitHub remote yet — CI never exercised.
- No sign-in/sign-up pages yet (auth backend ready).
