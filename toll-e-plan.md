# toll-e — Product & Technical Plan

**An investment tracking web app with real tax clarity for Israeli investors.**
Version 1.0 · August 2026 · Prepared for implementation in the IDE

---

## 1. Vision & Problem Statement

Portfolio apps do a decent job showing you what you own and how it moved today. They do a terrible job answering the questions that actually cost you money:

- *"I sold NVDA at a profit — how much tax do I owe, and when?"*
- *"How much cash should I keep in the account as a tax reserve?"*
- *"I lost money on one position and gained on another — what's my net position with the tax authority?"*
- *"Last year ended at a loss — what's my carryforward shield worth this year?"*

Israeli investors typically discover the answers once a year, sitting across from an accountant with a stack of broker reports. toll-e's core promise: **every sale immediately updates a clear, running picture of tax owed — monthly and yearly — alongside a Yahoo-Finance-grade portfolio tracker.**

The tracking experience is deliberately modeled on the Yahoo Finance app (our 22 reference screens), which does portfolio UX better than the competition. toll-e = that experience, dual-market (US + TASE), dual-language (EN + HE), with a tax engine underneath.

---

## 2. Product Scope

### 2.1 Core loop

1. User searches a ticker (US or Israeli, per active market tab) → opens a stock page.
2. User records transactions: **Buy / Sell** (quantity, price, date, commission, note). Short/Cover deferred to a later phase.
3. Holdings, portfolio performance, and cost basis update instantly.
4. Every **Sell** is a tax event: the engine matches sold shares to open lots (FIFO), computes realized profit, and rolls it into the monthly and yearly tax ledgers.
5. The **Tax view** always shows: realized gains/losses this month & year, tax withheld at source, what the year actually owes, the refund expected next year, and the registered loss shield.

### 2.2 The market system — two tabs now, N markets by design

The UI ships with two tabs — **US Market ($)** ↔ **Israeli Market (₪)** — but markets are *data, not code*. A **market registry** defines each market once, and everything renders from it:

```ts
// src/markets/registry.ts
type MarketDef = {
  id: string;                 // 'US', 'IL', later 'UK', 'EU', 'JP'...
  currency: string;           // 'USD', 'ILS' — ISO 4217
  currencySymbol: string;     // '$', '₪'
  indexes: string[];          // ['^GSPC','^DJI','^IXIC'] / ['TA35.TA','TA125.TA','TA90.TA']
  calendar: TradingCalendar;  // days, hours, holidays, timezone
  symbolSuffix?: string;      // '.TA' for TASE (Yahoo convention); UI shows clean symbol
  numberLocale: string;       // formatting defaults
}
```

- The tab bar, homepage index strip, search-universe priority, market-state badges, and default formatting are all registry-driven. Adding a market = adding a registry entry + calendar + verifying provider symbol coverage; zero changes to portfolio, tax, or UI code.
- DB columns store market ids and ISO currency codes as strings (no enums to migrate). Money is always stored as `(amount, currency)` — never a bare number.
- The tab switch is a *lens*, not a data wall: it controls which indexes/portfolios/search results are surfaced first. Each portfolio belongs to one market and its native currency.
- FX is a first-class service (`fx_rates` per currency pair, daily) so any future currency slots in.

### 2.3 Feature map by screen (from the Yahoo reference)

**Homepage**
- Market strip: 3 index cards with mini sparklines and % change (market-tab dependent), "markets close in Xh Ym" status line computed from exchange calendars (NYSE/Nasdaq hours; TASE Sun–Thu hours).
- Search bar for tickers/news (typeahead: symbol, name, exchange badge).
- **Portfolio Performance card**: total value, Today's gain (₪/$ and %), All-time gain, privacy-eye toggle to blur amounts.
- **Holdings section**: per-position rows — symbol, name, sparkline, last price, % change badge (green/red), expandable. "Add tickers" / "View details."
- **Watchlist section** (separate from holdings).
- Optional "Daily brief" bottom sheet (news digest) — later phase.

**Portfolio page** (`holdings` list in reference)
- Header: portfolio name + switcher dropdown, edit (pencil), add (+).
- Summary card: total value, Today, All-time, with expand/collapse.
- Tabs: **Basic / Details / Holdings** (Basic = price view, Details = day change columns, Holdings = position economics).
- Position rows: market value, +X% Today, +Y% Total; expanded card shows **Avg Cost/Share, Total Cost, Day's Gain, Total Gain, Market Value, Shares, Transactions count, Total Dividend Income, + Add a new transaction**.
- Filter (All / by type), Sort by (Market Value, Day %, Total %, Name, Custom).
- **All Transactions** screen: full journal, filterable by symbol/type/date.
- Portfolio management: create/rename/delete portfolios, set market/currency, custom ordering. (Reference's "Link Broker" — out of scope v1.)
- **New for toll-e: Tax panel** on every portfolio (see §3).

**Performance / Profile page** (new, toll-e-specific — see §3.4)
- The single "how am I actually doing?" page: combined totals plus per-portfolio breakdowns, YTD and month-by-month, with tax paid alongside gains.

**Watchlists** (full Yahoo-style management)
- A user can create **multiple watchlists**, each named, each holding any mix of tickers from any market.
- Per-list operations: rename, delete, set display currency, **reorder tickers by drag** (custom order) or sort by price/change/name, add tickers (from search, from a stock page's star, or in-list "+ Add tickers"), remove tickers (checkbox multi-select + trash, like the reference Edit List screen).
- Lists themselves are orderable; the homepage Watch section shows the user's chosen default list with a switcher.
- Display Data toggle per list: % change / price change / market cap (reference parity).
- Watchlists are pure views — no transactions, no tax; adding a ticker you own is fine.

**Stock page** — tabs mirroring the reference:
- **Summary**: price header (live-ish quote, change, currency, market state, "as of" line), interactive chart (1D/5D/1M/6M/YTD/1Y/5Y/Max) with prev-close dashed line and volume band, **My Holdings card** when the user owns it (Day's/Total gain, shares, avg cost, market value → links to portfolio), Key Statistics grid (day range, 52-wk range slider, prev close, open, volume, avg volume, P/E TTM, market cap, beta, dividend & yield, earnings date, 1y target).
- **News**: headline feed for the symbol.
- **Analysis**: recommendation trend bars (Strong Buy → Underperform), analyst price target range (low/avg/high vs current), upgrades/downgrades feed, fair-value teaser.
- **Financials**: EPS beats chart (estimate vs actual, last 4 quarters), Revenue vs Earnings bar chart (annual/quarterly toggle), historical prices (52-week line), corporate events & filings feed, top holders table.
- Star = add to watchlist; bell = price alert (later phase).

**Add Transaction** (modal on desktop, full page on mobile)
- Fields: Ticker (with search), Portfolio, Type (Buy/Sell), Date (picker, no future dates), Shares, Cost/Share (pre-filled with live or historical close for the chosen date), Commission (optional), Comment (optional).
- Validation: required fields inline ("This field cannot be empty."); Sell quantity cannot exceed held shares at that date; date-aware price hint.
- On Sell: immediate "tax preview" strip — matched lots, realized P&L, estimated tax at portfolio rate.

**Settings**
- Language (EN/HE), theme (dark default, light later), default market tab, number privacy.
- **Tax settings** per portfolio: rate (default 25%), see §3.

### 2.4 Explicitly out of v1 (parked)

Short selling & cover, options/derivatives, **cash/wallet tracking (decided: v1 tracks active holdings and historical realized gains/losses only — no cash balances, deposits, or dual-currency wallet)**, dividends *tax* treatment (dividend income display is v1; its tax in v1.5), broker linking/imports (CSV import lands v1.5), price alerts & push notifications, community/social feed, portfolio analytics (allocation charts — v1.5), real-time streaming quotes (we poll), Hebrew financial news sources.

---

## 3. The Tax Engine (the differentiator)

### 3.1 Model (as specified)

- **Per-portfolio tax profile**: a single rate, default **25%** (Israel's real capital-gains rate). User may set any rate; **0% hides all tax UI** for that portfolio. Changing the rate **recomputes everything retroactively** — trivial because tax is always *derived*, never stored as source of truth.
- **Tax event**: every Sell. Realized profit = proceeds − cost basis of matched lots − allocated commissions.
- **Lot matching: FIFO** (the Israeli banking-system convention). The engine keeps per-buy open lots; a sell consumes them oldest-first, splitting lots when partial.
- **Monthly ledger — withholding at source.** Israeli brokers settle monthly, and **order matters**. A running loss pool carries *forward within the year only*: a loss month adds to it, a gain month draws it down first, and only the remainder is withheld at that month's end. A gain in February is withheld even if a loss follows in November — the pool never reaches backwards.
- **Yearly ledger — the shield is a refund, not a discount.** At year end the year is computed standalone: net = gains − losses. A year that nets to a **loss registers `|net| × rate` with the government** as shield — a *money* amount, locked at the rate in force when that year closed, carried indefinitely and consumed oldest-layer-first. A year that nets to a **gain owes `net × rate`, and prior-year shield offsets that liability** — but nothing is applied at source, so the tax is withheld in full during the year and the difference (`paid − owed`) comes back as a **refund in the following year's filing**. Over-withholding caused purely by month ordering refunds through the same channel.
- **Two figures, never conflated**: `paid` (cash withheld at source) and `owed` (the year's true liability after the shield). The gap is `refundNextYear`. The shield displays as **money primary, underlying loss secondary**.

**Computation is pure & deterministic**: `f(transactions, taxProfile) → {lots, realizedEvents, monthlyLedger, yearlyLedger, shield}`. Recompute on any transaction change (edit/delete/backdate) or rate change. This makes retroactive edits, imports, and rate switches free of migration pain.

### 3.2 Currency handling for tax — localized, not combined

**Decision: tax is computed and displayed per portfolio in its native currency.** A US portfolio's ledgers, tax accrual, shield, and reserve are all in **$**; an Israeli portfolio's in **₪**. No cross-currency merging inside the tax engine — each portfolio is its own closed tax world (rate, ledgers, shield).

Cross-currency conversion happens only at the **presentation layer**, on the Performance page (§3.4): native amounts are converted to the user's display currency for the combined totals, with the native figure primary and the converted figure in brackets. Store the FX rate used for any converted display snapshot; keep daily FX history so month rows convert at month-end rates.

(True ITA reporting converts to ₪ with exchange-rate indexation — that lives in the future `TaxRuleSet` refinements (§3.3) and the Form 867 view, not in v1's day-to-day UX.)

### 3.3 Roadmap refinements (architected-for, not built in v1)

The engine takes a pluggable `TaxRuleSet`, so these slot in later without schema surgery — verified against current Israeli rules:

1. **Real (inflation-adjusted) gain**: Israeli securities index cost basis to CPI; foreign-currency securities treat **the exchange rate as the index** (so the taxable gain is the ILS-measured real gain). V1's nominal-with-FX-at-sale is a close, defensible approximation.
2. **High-income surtax**: +3% general surtax, and an additional +2% on capital-source income above the threshold (₪721,560 in 2025) → up to 30% marginal on large gains.
3. **Loss offset breadth**: losses can also offset dividend/interest income taxed ≤25% (same-year), foreign-loss-against-foreign-gain ordering.
4. **Form 867 reconciliation view**: year-end statement matching what banks/brokers report, for the accountant conversation.
5. Dividend withholding (25%) and US 25% treaty withholding credit interplay.

### 3.4 Tax UI & the Performance page

- **Portfolio tax panel** (in the portfolio's native currency): "Withheld this month $X · YTD realized $Y · Withheld YTD $Z · Owed for the year $W · Refund expected $Z−W · Shield balance $V".
- **Per-portfolio Tax page**: monthly table (realized gains, losses, net, tax), yearly summary cards, shield history (created/consumed), per-sale drill-down showing matched lots — the "show your work" view that builds trust. All native currency.
- Every Sell confirmation shows its tax impact immediately, in the portfolio's currency.

**Performance / Profile page** (`/performance`) — the combined picture:

- **Header totals** in the user's **display currency** (setting; defaults by locale: Hebrew → ₪, English → $): total combined gains/losses (realized + unrealized) and total tax accrued/paid, YTD.
- **Per-portfolio breakdown**: one card/row per portfolio showing YTD realized P&L, unrealized P&L, tax accrued, shield — in the portfolio's **native currency, with the display-currency conversion in brackets**, e.g. `+$4,120 (₪15,340)`.
- **Month-by-month table/chart** for the selected year: per month — realized gains, losses, net, tax accrued — combined (display currency) and expandable per portfolio (native). Year selector for past years.
- This page is also the "profile" surface: display-currency setting, language, default market tab live here alongside the numbers.

---

## 4. Architecture & Stack (decision)

**Next.js 15 (App Router) full-stack TypeScript monolith.** One codebase, SSR for fast first paint of data-heavy pages, API route handlers as our backend, first-class i18n/RTL, deploys anywhere (Vercel/Docker). A separate backend adds ceremony we don't need; the tax engine lives as a pure TS package we can later extract if ever needed.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 + TypeScript | SSR + API in one, RSC for data-heavy pages |
| DB | PostgreSQL + **Drizzle ORM** | Relational fits lots/ledgers; Drizzle = typed SQL, light migrations |
| Auth | **Better Auth** (email/password + Google) | Multi-user day one, session-based, simple |
| Data fetching | TanStack Query (client) + RSC (server) | Polling quotes, cache invalidation |
| UI | Tailwind CSS + shadcn/ui (Radix) | Fast, accessible, themeable dark-first |
| Charts | **TradingView lightweight-charts** (price/candles) + Recharts (bars/EPS) | The finance-chart look from the reference, tiny bundle |
| i18n | next-intl, `en` + `he` with full RTL | Route-aware, server-safe |
| Validation | Zod (shared client/server schemas) | One source of truth |
| Market data | **Adapter layer** over unofficial Yahoo endpoints (covers US + `.TA`) | $0 for MVP; swappable per §5 |
| Cache | In-process LRU + Postgres price cache (Redis only if/when needed) | Keep ops simple |
| Testing | Vitest (tax engine gets exhaustive unit tests) + Playwright smoke | The tax engine must be provably correct |
| Deploy | Vercel or single Docker image + managed Postgres (Neon/Supabase) | Decide at ship time |

**Monorepo shape** (single Next app, clean internal packages):

```
toll-e/
├── app/                    # routes: (marketing), (app)/home, /portfolio/[id],
│   │                       #   /stock/[symbol], /tax, /transactions, /settings, /api/*
├── src/
│   ├── engine/tax/         # PURE tax engine: lots.ts, fifo.ts, ledger.ts,
│   │   │                   #   shield.ts, rulesets/{flat-rate}.ts  ← unit-test heaven
│   │   └── portfolio/      # cost basis, P&L, performance calcs (pure)
│   ├── market-data/        # provider adapter: types.ts, yahoo.ts, tase.ts(later),
│   │                       #   fx.ts, cache.ts, calendars.ts
│   ├── db/                 # drizzle schema, queries
│   ├── i18n/               # en.json, he.json
│   └── components/         # ui/, charts/, portfolio/, stock/, tax/
└── tests/
```

---

## 5. Market Data Strategy

**V1: unofficial Yahoo Finance endpoints** behind a `MarketDataProvider` interface — they cover quotes, OHLCV history, search, fundamentals summaries, and most TASE tickers via `.TA`, at $0.

- `getQuote(symbols[])`, `getChart(symbol, range, interval)`, `search(query, market)`, `getSummary(symbol)` (stats/analysis/financial blocks), `getFx(pair, date?)`.
- **Server-side only** (route handlers) — never from the browser: avoids CORS, hides the provider, lets us cache.
- Caching per data class: quotes ~15–60s during market hours; charts 5min (intraday) / 1day (historical, immutable once closed); fundamentals 24h; FX daily. Historical closes + daily FX persist to Postgres (needed anyway for backdated transactions and tax audit trails).
- Politeness: request coalescing, batch quotes, jittered polling, graceful "stale data" badges on failure.
- **Known risks, accepted for MVP**: unofficial API can break (adapter isolates the blast radius); TASE fundamentals via Yahoo are thin (prices are fine; deep TASE financials → TASE DataHub API later); 15–20min delayed quotes are acceptable and labeled ("As of HH:MM, delayed").
- **Exchange calendars**: NYSE/Nasdaq (Mon–Fri, 16:30–23:00 IL time) and TASE (Sun–Thu) schedules with holidays, powering the "closes in Xh Ym" strip and market-state badges.

Upgrade path (v2): EODHD or Polygon for US + TASE DataHub for Israeli securities — swap adapters, no product code changes.

---

## 6. Data Model (Drizzle/Postgres)

```
users            id, email, name, locale('en'|'he'), defaultMarket text,   -- registry id
                 displayCurrency text,               -- for Performance page combined totals
                 createdAt
portfolios       id, userId, name, market text, currency text,  -- registry-driven strings, no enums
                 taxRatePct numeric default 25.0,   -- 0 ⇒ tax UI hidden
                 sortOrder, createdAt
transactions     id, portfolioId, symbol, type('BUY'|'SELL'),      -- SHORT/COVER later
                 tradeDate date, shares numeric, pricePerShare numeric,
                 commission numeric default 0, currency, note, createdAt, updatedAt
watchlists       id, userId, name, sortOrder, displayCurrency?, displayMode('pct'|'price'|'mcap'),
                 sortMode('custom'|'price'|'changePct'|'name'), isDefault bool
watchlist_items  watchlistId, symbol, sortOrder      -- drag-reorder = sortOrder rewrite
instruments      symbol PK, name, exchange, market, currency, type, logoUrl?   -- cached metadata
price_history    symbol, date, open, high, low, close, adjClose, volume        -- daily closes
fx_rates         pair('USDILS'), date, rate                                    -- BoI/Yahoo daily
alerts (v2)      id, userId, symbol, condition, threshold
```

**Derived (recomputed, optionally snapshotted for perf):** open lots, realized events (saleTxId, matched lots[], realizedPnL in native currency, taxYear, taxMonth), monthly/yearly tax ledgers, shield balance. Start by computing on-read per portfolio (transactions per user are small — thousands, not millions); add a `tax_snapshots` cache table only if profiling demands it.

Position & performance math: avg cost, total cost, day's gain (vs prev close), total gain, market value — all pure functions in `engine/portfolio`, shared by portfolio rows, stock-page "My Holdings" card, and the homepage card.

---

## 7. UX, Layout & Design System

### 7.1 Responsive: two deliberate layouts (like Yahoo Finance web)

Not just fluid CSS — two designed experiences:

- **Mobile (<768px)** mirrors the reference screenshots: bottom tab bar (**Home · Markets · Portfolio · Tax**), stacked cards, full-page flows (Add Transaction as a page), bottom sheets for pickers, horizontal scroll for index cards.
- **Desktop (≥1024px)** follows finance.yahoo.com: top navbar (logo, global search, market tab switch, language, avatar), dense multi-column grids — portfolio as a **data table** (sortable columns: Symbol, Price, Change, Change%, Shares, Avg Cost, Mkt Value, Day Gain, Total Gain, Tax impact) with an expandable side panel; stock page with wide chart + right sidebar (key stats, holdings card); tax dashboard with side-by-side monthly table and yearly cards; Add Transaction as a modal.
- Tablet interpolates (2-col grids, bottom bar → top tabs).

### 7.2 Visual language

Dark-first (the reference aesthetic): near-black background, elevated card surfaces, green/red for gain/loss (with shape/sign redundancy for color-blind users), Yahoo-like typographic hierarchy (big portfolio number, quiet labels). Design tokens from day one — light theme is a v1.5 toggle, not a rewrite.

### 7.3 Bilingual & RTL

- `next-intl` with locale routing (`/en/...`, `/he/...`), user preference persisted.
- Hebrew = full RTL: `dir="rtl"`, logical CSS properties throughout (`ms-`/`me-`, `start`/`end`), mirrored navigation and chevrons; charts and numbers stay LTR inside RTL text (standard bidi practice, `dir="ltr"` islands).
- Numbers/currency via `Intl.NumberFormat` per locale; ₪ and $ placement correct per language; dates localized (and IL week starts Sunday).
- All strings externalized from the first commit — retrofitting i18n is misery.

---

## 8. API Surface (route handlers)

```
Auth        POST /api/auth/*                        (Better Auth)
Market      GET  /api/market/search?q=&market=
            GET  /api/market/quote?symbols=
            GET  /api/market/chart/:symbol?range=&interval=
            GET  /api/market/summary/:symbol        (stats|analysis|financials blocks)
            GET  /api/market/indexes?market=US|IL
Portfolio   CRUD /api/portfolios, /api/portfolios/:id
            GET  /api/portfolios/:id/positions      (computed holdings + performance)
            PATCH /api/portfolios/:id/tax-profile   (rate change ⇒ derived data just recomputes)
Transactions CRUD /api/portfolios/:id/transactions  (validation: sell ≤ held-at-date)
Tax         GET  /api/portfolios/:id/tax?year=      (monthly ledger, yearly, shield, reserve — native currency)
Performance GET  /api/performance?year=&currency=   (combined totals in display currency +
                                                     per-portfolio native breakdowns, YTD + monthly)
Watchlist   CRUD /api/watchlists, /api/watchlists/:id
            POST /api/watchlists/:id/items          (add ticker)
            DELETE /api/watchlists/:id/items/:symbol
            PATCH /api/watchlists/:id/reorder       (items or list ordering)
```

Server components fetch directly (skipping HTTP) where possible; these routes serve client-side polling and mutations.

---

## 9. Build Roadmap (IDE phases)

Each phase ends runnable and demoable.

**Phase 0 — Foundation (scaffold)**
Next.js + TS + Tailwind + shadcn + Drizzle + Postgres + Better Auth + next-intl(RTL) wiring; dark theme tokens; app shell with responsive nav (bottom bar / top bar); locale switch; CI (typecheck, lint, vitest).

**Phase 1 — Market data & stock pages**
Yahoo adapter (quote/chart/search/summary) + caching + calendars; **market registry** (US + IL entries) driving the tab switch, index strip, and formatting; global search with typeahead; stock page Summary tab (chart with ranges, key stats); homepage market strip with index cards.

**Phase 2 — Portfolios & transactions**
Portfolio CRUD; Add Transaction flow (both layouts, validation, date-aware price prefill); FIFO lot engine + position math (unit-tested); portfolio page (summary card, Basic/Details/Holdings tabs, expandable rows, sort/filter); All Transactions journal; homepage portfolio card + holdings; **watchlists in full** (multiple named lists, add/remove tickers, drag reorder, list management screen, homepage watch section).

**Phase 3 — Tax engine & tax UI  ← the differentiator**
Pure engine: FIFO realized events, monthly/yearly ledgers per portfolio in native currency, loss-carryforward shield, configurable rate + retroactive recompute, 0%-hides-UI; exhaustive unit tests (partial lots, backdated edits, cross-year losses, rate changes); per-portfolio Tax page (monthly table, yearly cards, shield, reserve); sell-time tax preview; per-sale drill-down; **Performance/Profile page** (combined totals in display currency, per-portfolio native breakdowns with bracketed conversion, YTD + month-by-month, year selector).

**Phase 4 — Stock page depth & polish**
News, Analysis, Financials tabs (EPS beats, revenue vs earnings, events, holders); "My Holdings" card on stock pages; privacy blur; empty states; loading skeletons; error/stale badges; Hebrew translation pass; Playwright smoke suite; deploy.

**v1.5 candidates**: CSV broker import (Israeli bank/IBKR formats), dividend tax, portfolio analytics (allocation), light theme, price alerts, real-gain indexation ruleset, Form 867 view, surtax.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Unofficial Yahoo API breaks/blocks | Adapter isolation; server-side caching keeps app usable with stale data; paid-API swap path (§5) |
| TASE coverage gaps (fundamentals) | Prices/history suffice for v1 tracking+tax; TASE DataHub adapter later |
| Tax correctness = product trust | Pure, deterministic, exhaustively unit-tested engine; "show your work" lot drill-down; explicit disclaimer that toll-e is not tax advice and the accountant remains the authority |
| RTL/bidi bugs everywhere | Logical properties + `dir` islands from day one; Hebrew QA pass each phase |
| Scope creep toward full Yahoo clone | Phases 0–3 are the product; stock-page depth is Phase 4 polish |
| FX accuracy for combined display | Tax itself stays native-currency (no FX in the engine); persist daily FX history and the rate used per converted display figure (auditable) |

---

## 11. Resolved Decisions

1. **Tax display is localized, not combined**: each portfolio's tax lives in its native currency ($ for US, ₪ for IL). The combined picture lives on the **Performance/Profile page**: totals (gains/losses + tax paid) in the user's display currency, per-portfolio breakdowns in native currency with the converted figure in brackets, YTD + month-by-month. (§3.2, §3.4)
2. **No cash/wallet tracking in v1**: active holdings + historical realized gains/losses only. Dual-currency wallet parked. (§2.4)
3. **Fractional shares supported** (numeric shares columns).
4. **FX source v1**: Yahoo `ILS=X` daily closes; Bank of Israel official rates as a later swap for tax-grade reporting.

---

*Sources for tax rules: [PwC Tax Summaries — Israel, Income determination](https://taxsummaries.pwc.com/israel/individual/income-determination) (25% real-gain rate, exchange-rate-as-index for foreign securities, indefinite loss carryforward, 2%+3% surtax above ₪721,560). Market data: [TASE DataHub](https://datahub.tase.co.il/en/about/), [TASE API price list](https://content.tase.co.il/media/4imn13pz/2001_api_pricelist_2026_eng.pdf).*
