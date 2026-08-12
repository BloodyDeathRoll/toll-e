# toll-e — Israeli Brokerage & Bank Commissions Spec

Data gathered Aug 2026 from broker.co.il's 2026 comparison table, cross-validated against Bizportal, Calcalist, TheMarker, ynet/Interactive Israel, and bank tariff pages (Leumi, Mizrahi-Tefahot, FIBI). Rates change; every number below must be user-overridable and effective-dated.

---

## 1. Commission taxonomy

Israeli trading costs decompose into six primitive fee types. Every institution is a configuration of these primitives — the engine should model the primitives, not the institutions.

| # | Fee type | Applies | Typical shape |
|---|----------|---------|---------------|
| 1 | **Trade commission — percentage** | TASE (₪) trades, per execution | `pct × trade_value`, floor `min_fee` (in trade currency) |
| 2 | **Trade commission — per share** | US trades, per execution | `cents_per_share × qty`, floor `min_fee` ($) |
| 3 | **Options — per contract** | MAOF (₪) or US options ($) | `fee_per_contract × contracts`, sometimes floor `min_fee` |
| 4 | **Account fee (דמי טיפול)** | Monthly, per account | Flat ₪/month; some brokers offset it against commissions paid that month ("מתקזז") |
| 5 | **Custody fee (דמי משמרת / דמי ניהול פיקדון)** | Banks, quarterly (billed as annual %) | `annual_pct × portfolio_value`, tiered by portfolio size, often with min/max |
| 6 | **FX conversion** | On converting ₪↔$ | `pct` fee and/or spread; recorded but **outside** the tax engine (consistent with toll-e's presentation-layer-only FX rule) |

Banks also pass through a **correspondent-broker fee** on foreign trades (0.5–1¢/share on top of their own commission) — model it as a second per-share component on the same trade.

---

## 2. Investment houses (בתי השקעות) — 2026 rates

Source: broker.co.il comparison table (promotional rates, i.e., what a new retail customer actually gets), consistent with independent reporting that investment houses charge 0.06%–0.09% on TASE.

| Broker | TASE buy/sell | US buy/sell | MAOF options | US options | Monthly fee |
|---|---|---|---|---|---|
| **Meitav Trade** | 0.08%, min ₪4.65 | 1¢/share, min $7.50 (IB route: min $5) | ₪2.2/contract | $4/contract, min $12 | ₪15 |
| **Excellence Trade** | 0.07%, min ₪3.00 | 1¢/share, min $5 | ₪2.5/contract | $3/contract, min $9 | ₪15, offset against commissions |
| **IBI Trade** | 0.08%, min ₪2.35 | 1¢/share, min $7.50 | ₪2.5/contract | $3/contract, min $9 | ₪15, offset against commissions |
| **Altshuler Shaham Trade** | 0.07%, min ₪2.90 | 1¢/share, min $6 | — | — | none |
| **Psagot Trade** | 0.06% | 1¢/share | — | — | none |
| **Interactive Israel** (IBKR white-label) | no TASE trading | 1¢/share, min $2.50 | — | $2/contract, no min | none |
| **Colmex Pro** | no TASE trading | 1¢/share, min $2.50 | — | $2/contract, no min | none |

Notes:
- "Offset" (מתקזז) means the ₪15 is charged only to the extent that the month's trade commissions fall short of ₪15 — implement as `max(0, monthly_fee − commissions_paid_this_month)`.
- Promotional waivers (e.g., "2 years free monthly fee") are common; the monthly fee needs a per-user on/off toggle and a start date, not just an amount.

## 3. Banks — 2026 picture

Banks price off a public tariff (up to 0.6%) but actual charged rates after standard discounts are what matters. Rates are **tiered by portfolio value** and negotiable. Numbers below are effective/reported actuals.

### TASE trades (₪)
| Bank | Effective rate |
|---|---|
| **Leumi** | 0.25% (portfolio ≤ ₪25k) → 0.11% (> ₪1M) |
| **Hapoalim** | ~0.35% effective across small/mid portfolios (tariff 0.6%, smallest discounts of the big five) |
| **Discount** | ~0.3–0.4% effective (deep discounts off tariff) |
| **Mizrahi-Tefahot** | ~0.3–0.4% effective |
| **FIBI (הבינלאומי)** | lowest average among banks, ~0.067% reported |

Sector-wide: banks charge roughly **0.3%–0.5%** per TASE trade vs. 0.06%–0.09% at investment houses.

### Foreign (US) trades
| Bank | Commission | Correspondent pass-through | Min |
|---|---|---|---|
| **Leumi** | 0.16% (≤₪25k) … 0.33% (₪50–75k) … 0.12% (>₪1M); also reported 0.3% min $25 flat-style pricing | 0.5¢/share | per tier |
| **Mizrahi-Tefahot** | 0.36% (≤₪25k) → 0.16% (>₪1M) | 0.5¢/share | — |
| **Discount** | tiered ~0.3% | 0.5¢/share | $5.50 |
| **Hapoalim** | tiered ~0.3–0.4% | — | $3.00 |
| **FIBI** | tiered, lowest avg | up to 1¢/share | — |

### Custody / management fee (דמי ניהול פיקדון ני"ע)
Banks only; investment houses replace it with the flat monthly fee.
- Range: **0.3%–0.5%/year** for portfolios ≤ ₪100k, sliding to **~0.1%/year** above ₪1M (Mizrahi figures; other banks similar). Some sources cite up to 0.8%/yr at the extreme.
- Billed **quarterly** on average portfolio value, usually with a per-quarter minimum.
- FIBI also lists a custodian fee: 0.01%, min ₪15, max ₪450.
- Exempt on מק"מ and money-market funds by Bank of Israel regulation.

### FX conversion
Banks: conversion fee plus spread, commonly ~0.25% each way or worse. Investment houses often waive the fee and give near-mid rates. **Per toll-e's design this never enters the tax engine** — but the fee itself is a real cost worth showing next to the recorded conversion rate.

---

## 4. How commissions enter the tax engine

This is the part that actually touches toll-e's calculation. Israeli capital-gains mechanics (and broker at-source withholding) treat trade commissions as follows:

1. **Buy commission → capitalized into the lot's cost basis.**
   `lot.cost = qty × price + buy_commission`. Since tax is never stored, this just means the commission is a field on the buy transaction and basis is derived.

2. **Sell commission → deducted from proceeds.**
   `proceeds = qty × price − sell_commission`. Realized gain per FIFO match = allocated proceeds − allocated basis.

3. **FIFO lot splitting → allocate commission pro-rata by quantity.**
   When a sell consumes part of a buy lot, the buy commission splits proportionally: a sell of 30 out of a 100-share lot carries 30% of that lot's buy commission in its basis, and the remaining 70 shares keep the rest. Same rule when one sell matches multiple lots — the sell commission splits pro-rata across matches by quantity.

4. **Currency: commission lives in the trade's currency, always.** A TASE trade's min fee is ₪; a US trade's is $. No conversion, consistent with the existing rule. This falls out naturally if commission is stored per transaction.

5. **Periodic fees (monthly account fee, custody fee) do NOT enter the gain calculation.** They are not part of any lot's basis or any sale's proceeds and are not netted at source. Track them as a separate "account costs" ledger — show them in performance/cost views, keep them out of the tax halves entirely.

6. **Withholding interaction: nothing new.** Because commissions are folded into basis and proceeds *before* matching, the within-year pool, month-end withholding, and cross-year shield all operate on already-net gains. No change to that logic.

### Recompute rule
Commission fields are transaction data, so the existing invariant holds: edit a commission (or the broker profile it was derived from) and the entire picture recomputes. Nothing commission-related is ever stored downstream.

---

## 5. Suggested data model

```jsonc
// Broker profile — a named, effective-dated fee schedule
{
  "id": "meitav-trade",
  "name": { "en": "Meitav Trade", "he": "מיטב טרייד" },
  "kind": "investment_house",            // or "bank"
  "schedules": [
    {
      "effective_from": "2026-01-01",
      "tase_trade":   { "type": "pct",       "pct": 0.0008, "min": 4.65, "currency": "ILS" },
      "us_trade":     { "type": "per_share", "per_share": 0.01, "min": 7.50, "currency": "USD" },
      "us_trade_passthrough": null,        // banks: { "per_share": 0.005 }
      "maof_option":  { "type": "per_contract", "fee": 2.2, "currency": "ILS" },
      "us_option":    { "type": "per_contract", "fee": 4.0, "min": 12.0, "currency": "USD" },
      "account_fee":  { "monthly": 15, "currency": "ILS", "offset_against_commissions": false },
      "custody_fee":  null,                // banks: { "annual_pct_tiers": [...], "billing": "quarterly", "min_per_period": ..., "max_per_period": ... }
      "fx_fee_pct":   null                 // display-only
    }
  ]
}
```

```jsonc
// Transaction — commission resolved at entry time, stored, editable
{
  "type": "buy",
  "qty": 100, "price": 12.5, "currency": "USD",
  "commission": 7.50,                      // actual charged; auto-filled from broker profile, user-overridable
  "commission_source": "profile:meitav-trade@2026-01-01"  // or "manual"
}
```

Design decisions embedded here:
- **Auto-fill, don't auto-compute silently.** The profile suggests the commission when a transaction is entered; the stored number on the transaction is authoritative. Real charged fees deviate (negotiated discounts, promos), and this keeps the recompute invariant simple.
- **Tiered bank rates** need the portfolio-value tier as an input. Since toll-e knows holdings, it can pick the tier automatically at trade date — but let the user pin a rate, because bank tiers are based on the bank's own valuation and negotiation.
- **Effective dating** on schedules handles rate changes without touching historical transactions (their commissions are already stored).
- If the user sets no broker profile, commissions default to 0 everywhere — same spirit as tax rate 0 hiding the tax UI.

---

## 6. Edge cases to test

- Min fee dominating: a ₪1,000 TASE buy at Meitav → 0.08% = ₪0.80 → charged ₪4.65. Basis must reflect 4.65.
- One sell matching three lots: sell commission split by matched quantity; each match's gain independently correct; sums reconcile to the un-split calculation.
- Partial lot sold twice: remaining basis after the first partial sale still carries the unallocated remainder of the buy commission — no double counting.
- Commission edited retroactively on a fully-consumed lot: all downstream matches, monthly pools, withholding, and shields recompute.
- Offset monthly fee: month with ₪20 of commissions at IBI → account fee ₪0; month with ₪6 → account fee ₪9.
- Custody fee accrual on a bank profile: quarterly charge computed from average portfolio value, appears in cost ledger, never in gain/withholding.
- Mixed-currency portfolio: US trade min $7.50 and TASE min ₪4.65 in the same portfolio never interact and never convert.

---

## 7. Source reliability notes

- broker.co.il table is promotional/affiliate but its investment-house numbers match independent 2026 reporting (0.06–0.09% TASE range confirmed by multiple outlets).
- Bank numbers are the softest: tariffs are public but effective rates depend on discounts and portfolio tiers, and published "actuals" vary by source and date. Treat the bank profiles as starting defaults and make every field editable — this matters more for banks than for investment houses.
- Correspondent pass-through fees (0.5–1¢/share) were reported by Calcalist in late 2025 and may not appear on official tariff pages; surface them as an optional component.
