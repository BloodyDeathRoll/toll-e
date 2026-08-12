// Money always travels as (amount, currency) — never a bare number.
//
// The shape only. Formatting lives in `lib/format.ts` (`fmtMoney`, `fmtPct`),
// which is what the app actually calls; the formatters that used to live here
// were a second, unreachable layer, and one of them read percent units the
// other way round — `style: 'percent'` multiplies by 100, while every producer
// in this codebase (`positionView`'s `totalGainPct`, `Quote.changePct`) already
// emits percent, so the first caller to reach for it would have rendered 368%
// for a 3.68% day.

export interface Money {
  amount: number;
  currency: string; // ISO 4217
}
