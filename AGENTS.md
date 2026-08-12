<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# toll-e

Investment tracking web app for Israeli investors: Yahoo-Finance-grade portfolio tracker (dual-market US + TASE, EN + HE with RTL) with a tax engine underneath. `toll-e-plan.md` is the authoritative product & technical plan — read it before non-trivial work. `docs/` holds the specs and plans for work in flight.

## Commands

- `pnpm dev` — dev server (Turbopack)
- `pnpm build` / `pnpm start`
- `pnpm lint` — ESLint
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` — Vitest (watch: `pnpm test:watch`; single file: `pnpm test src/engine/tax/fifo.test.ts`)
- `docker compose up -d` — local Postgres
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` — Drizzle

## Architecture invariants (expensive to retrofit — honor from the first commit)

- **Markets are data, not code.** `src/markets/registry.ts` defines each market (`id`, `currency`, `currencySymbol`, `indexes`, `calendar`, `symbolSuffix`, `numberLocale`); tab bar, index strip, search priority, badges, formatting all render from it. DB stores market ids and ISO currency codes as **strings, never enums**.
- **Money is always `(amount, currency)`, never a bare number.**
- **Tax is derived, never stored.** Pure deterministic engine: `f(transactions, taxProfile) → {lots, realizedEvents, monthlyLedger, yearlyLedger, shield}`. FIFO lot matching, lots split on partial sells, indefinite loss-carryforward shield, rate default 25%, 0% hides all tax UI. Recompute on any edit/backdate/rate change.
- **Tax is per-portfolio and native-currency.** No FX inside the engine; conversion only at the presentation layer (Performance page), native primary + converted in brackets. Persist the FX rate used for any converted display.
- **Market data behind a `MarketDataProvider` adapter, server-side only** — never called from the browser. Cache per data class (quotes 15–60s, intraday 5m, historical 1d, fundamentals 24h, FX daily); historical closes + daily FX persist to Postgres.
- **`src/engine/tax/` and `src/engine/portfolio/` are pure TS** — no framework or DB imports. Position math is computed in one place and shared. Tax engine gets exhaustive Vitest coverage (partial lots, backdated edits, cross-year losses, rate changes).
- **i18n from the first commit.** next-intl, `en` + `he`; full RTL via logical CSS properties (`ms-`/`me-`, `start`/`end`); charts/numbers are `dir="ltr"` islands.
- **Two deliberate layouts.** Mobile (<768px): bottom tab bar (Home · Markets · Portfolio · Tax), stacked cards, full-page flows. Desktop (≥1024px): top navbar, dense sortable tables, modals.

## Scope discipline

Out of v1 (`toll-e-plan.md` §2.4): short selling, options, cash/wallet tracking, dividend *tax*, broker linking/CSV import, price alerts, social, streaming quotes. §3.3 tax refinements (indexation, surtax, Form 867) are architected-for via `TaxRuleSet`, not built.

**Allocation analytics is in**, against §2.4's original "v1.5" — pulled forward 2026-08-12 and shipped as the donut at the top of the Activity card (`components/allocation-donut.tsx`, `allocation` on the performance payload). Holdings by provider industry, weighted by market value. Read that as the ceiling, not a licence: a breakdown of what is held is v1, while the analytics §2.4 still defers — performance attribution, benchmark comparison, risk or correlation measures — is not.
