# Israeli mutual funds (קרנות נאמנות) — plan

Decision 2026-08-16: mutual funds are **in** for the IL market. A user searching
"אנרגיה ירוקה" or a fund classification on IBI finds funds; toll-e answered
"no results". Funds are how a large share of Israeli retail money is invested,
and the tax engine already handles them (FIFO, 25%, exempt-fund route is the
common case — no change needed).

## Source of truth

**Maya v1 API** (`https://maya.tase.co.il/api/v1/funds/...`) — TASE's own
filings site, free, keyless JSON. Verified 2026-08-16:

| Need | Endpoint | Notes |
| --- | --- | --- |
| Universe | entity feed (already used by `scripts/build-tase-catalogue.mjs`), Type 4 | 1,993 funds: id, ISIN, Hebrew + English name |
| Quote | `GET /api/v1/funds/mutual/{fundId}` | daily NAV (`purchasePrice`/`redemptionPrice`, **agorot**), `ratesAsOf`, fees, tax status, classification, day/period yields |
| History | `POST /api/v1/funds/mutual/{fundId}/history` `{pageNumber, pageSize≤30}` | **~1 month deep only**; page 2 is empty |
| Classifications | `GET /api/v1/funds/metadata/mutual` | the category tree brokers search by |

Headers: browser-ish `User-Agent` + `Referer: https://maya.tase.co.il/`.
Same stance as the Yahoo adapter: unofficial but the site's own API. The
official fallback if this fences off is TASE's paid Data Hub.

## Architecture

- **Symbol scheme**: `{fundId}.TA` (e.g. `5118674.TA`). All-digit base + `.TA`
  = mutual fund; real TASE tickers are never all digits. `marketForSymbol`
  keeps working (IL), the DB keeps storing plain strings, and the tax engine
  sees an ordinary symbol. `isTaseFund()` in the registry is the discriminator.
- **Names catalogue**: `src/markets/tase-funds.json`, built by the same
  build-time script from the entity feed (he + en names). Search over it lives
  in `src/markets/tase-funds.ts` — pure, no network, same as `tase-search.ts`.
- **Provider**: `src/market-data/maya.ts`, server-only. The facade
  (`src/market-data/index.ts`) branches on `isTaseFund` *before* Yahoo — fund
  symbols must never reach the Yahoo adapter. Agorot are converted to ₪ at the
  adapter edge ("agorot never escape the adapter", same rule as `yahoo.ts`).
- **Quotes**: NAV is daily. `price` = redemption NAV in ₪; `changePct` = Maya's
  `dayYield`; `previousClose` derived. TTL: the daily class, not the 30s class.
- **Charts**: Maya serves one month. Each chart fetch persists its daily
  closes (existing `persistDailyCloses`) and the series is then read from
  Postgres (existing `getChartFromDb`) — so ranges grow as the app accumulates
  history. Fresh installs show short 1Y charts at first; that is accepted.
- **Summary**: name, ₪, classification (major → `sector`, main → `industry`),
  management/trustee fee. No prose description; the classification is the
  story. News/analysis/financials tabs don't exist for funds — the stock page
  shows Summary + News (market news) only.
- **Search**: IL lens merges fund-name hits (type `FUND`) after
  equity/ETF hits. The market data wall applies unchanged.

## Tax

Most funds are קרן פטורה: no fund-level tax; the investor pays 25% real gain
at redemption — exactly the engine's existing model. חייבת funds differ at the
fund level, not the investor's FIFO, so v1 treats all funds alike and the
`TaxRuleSet` seam stays where §3.3 put it.

## Out of scope (this slice)

Hedge funds, fixed-dated funds, foreign ETFs via Maya, fund screener UI,
distribution/composition charts, intraday anything (funds have no intraday).
