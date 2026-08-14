import type { BrokerDef, FeeSchedule } from './types';

// Brokers are data, not code — the sibling of src/markets/registry.ts.
// Adding an institution = adding an entry here; a rate change = appending an
// effective-dated schedule, never editing history (stored commissions on old
// transactions are already authoritative, but backdated *suggestions* read
// the schedule in force at the trade date).
//
// Rates: docs/israeli-commissions-spec.md §2–§3, gathered Aug 2026 from
// broker.co.il cross-checked against Bizportal/Calcalist/TheMarker and bank
// tariff pages. Investment-house numbers match independent reporting; bank
// numbers are the softest — negotiated, tiered on the bank's own valuation,
// and disagreeing between sources. Every bank figure marked TODO(verify) is
// a starting default the user is expected to override, not a checked fact.

export const brokers: Record<string, BrokerDef> = {
  'meitav-trade': {
    id: 'meitav-trade',
    name: 'Meitav Trade',
    nameHe: 'מיטב טרייד',
    kind: 'investment_house',
    schedules: [
      {
        taseTrade: { type: 'pct', pct: 0.0008, min: 4.65, currency: 'ILS' },
        usTrade: { type: 'per_share', perShare: 0.01, min: 7.5, currency: 'USD' },
        maofOption: { type: 'per_contract', fee: 2.2, currency: 'ILS' },
        usOption: { type: 'per_contract', fee: 4, min: 12, currency: 'USD' },
        accountFee: { monthly: 15, currency: 'ILS', offsetAgainstCommissions: false },
      },
    ],
  },
  'excellence-trade': {
    id: 'excellence-trade',
    name: 'Excellence Trade',
    nameHe: 'אקסלנס טרייד',
    kind: 'investment_house',
    schedules: [
      {
        taseTrade: { type: 'pct', pct: 0.0007, min: 3, currency: 'ILS' },
        usTrade: { type: 'per_share', perShare: 0.01, min: 5, currency: 'USD' },
        maofOption: { type: 'per_contract', fee: 2.5, currency: 'ILS' },
        usOption: { type: 'per_contract', fee: 3, min: 9, currency: 'USD' },
        accountFee: { monthly: 15, currency: 'ILS', offsetAgainstCommissions: true },
      },
    ],
  },
  'ibi-trade': {
    id: 'ibi-trade',
    name: 'IBI Trade',
    nameHe: 'אי.בי.אי טרייד',
    kind: 'investment_house',
    schedules: [
      {
        taseTrade: { type: 'pct', pct: 0.0008, min: 2.35, currency: 'ILS' },
        usTrade: { type: 'per_share', perShare: 0.01, min: 7.5, currency: 'USD' },
        maofOption: { type: 'per_contract', fee: 2.5, currency: 'ILS' },
        usOption: { type: 'per_contract', fee: 3, min: 9, currency: 'USD' },
        accountFee: { monthly: 15, currency: 'ILS', offsetAgainstCommissions: true },
      },
    ],
  },
  'altshuler-shaham-trade': {
    id: 'altshuler-shaham-trade',
    name: 'Altshuler Shaham Trade',
    nameHe: 'אלטשולר שחם טרייד',
    kind: 'investment_house',
    schedules: [
      {
        taseTrade: { type: 'pct', pct: 0.0007, min: 2.9, currency: 'ILS' },
        usTrade: { type: 'per_share', perShare: 0.01, min: 6, currency: 'USD' },
      },
    ],
  },
  'psagot-trade': {
    id: 'psagot-trade',
    name: 'Psagot Trade',
    nameHe: 'פסגות טרייד',
    kind: 'investment_house',
    schedules: [
      {
        taseTrade: { type: 'pct', pct: 0.0006, currency: 'ILS' },
        usTrade: { type: 'per_share', perShare: 0.01, currency: 'USD' },
      },
    ],
  },
  'interactive-israel': {
    id: 'interactive-israel',
    name: 'Interactive Israel',
    nameHe: 'אינטראקטיב ישראל',
    kind: 'investment_house',
    schedules: [
      {
        // IBKR white-label: no TASE trading at all — taseTrade stays absent
        // and tradeCommission answers null for the IL market.
        usTrade: { type: 'per_share', perShare: 0.01, min: 2.5, currency: 'USD' },
        usOption: { type: 'per_contract', fee: 2, currency: 'USD' },
      },
    ],
  },
  'colmex-pro': {
    id: 'colmex-pro',
    name: 'Colmex Pro',
    nameHe: 'קולמקס פרו',
    kind: 'investment_house',
    schedules: [
      {
        usTrade: { type: 'per_share', perShare: 0.01, min: 2.5, currency: 'USD' },
        usOption: { type: 'per_contract', fee: 2, currency: 'USD' },
      },
    ],
  },
  leumi: {
    id: 'leumi',
    name: 'Bank Leumi',
    nameHe: 'בנק לאומי',
    kind: 'bank',
    schedules: [
      {
        taseTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          tiers: [
            { id: 'to-25k', upTo: 25_000, pct: 0.0025 },
            { id: 'to-1m', upTo: 1_000_000, pct: 0.0018 }, // TODO(verify): interpolated between published endpoints
            { id: 'over-1m', pct: 0.0011 },
          ],
          currency: 'ILS',
        },
        usTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): Leumi's published US tiers are non-monotonic
          // (0.16% ≤₪25k but 0.33% at ₪50–75k) and one source reports flat
          // 0.3% min $25 instead — the softest table in the file.
          tiers: [
            { id: 'to-25k', upTo: 25_000, pct: 0.0016, min: 25 },
            { id: 'to-75k', upTo: 75_000, pct: 0.0033, min: 25 },
            { id: 'to-1m', upTo: 1_000_000, pct: 0.0025, min: 25 }, // TODO(verify): interpolated
            { id: 'over-1m', pct: 0.0012, min: 25 },
          ],
          currency: 'USD',
        },
        usTradePassthrough: { type: 'per_share', perShare: 0.005, currency: 'USD' },
        custodyFee: {
          // TODO(verify): sector-wide shape (0.4%/yr small → 0.1%/yr >₪1M);
          // Leumi does not publish effective custody tiers.
          annual: {
            type: 'tiered_pct',
            tierCurrency: 'ILS',
            tiers: [
              { id: 'to-100k', upTo: 100_000, pct: 0.004 },
              { id: 'to-1m', upTo: 1_000_000, pct: 0.0025 },
              { id: 'over-1m', pct: 0.001 },
            ],
            currency: 'ILS',
          },
          billing: 'quarterly',
          minPerPeriod: 15, // TODO(verify)
        },
        fxFeePct: 0.0025, // TODO(verify): ~0.25% each way, display only
      },
    ],
  },
  hapoalim: {
    id: 'hapoalim',
    name: 'Bank Hapoalim',
    nameHe: 'בנק הפועלים',
    kind: 'bank',
    schedules: [
      {
        taseTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): ~0.35% effective across small/mid portfolios
          // (tariff 0.6%, smallest discounts of the big five).
          tiers: [
            { id: 'to-1m', upTo: 1_000_000, pct: 0.0035 },
            { id: 'over-1m', pct: 0.003 }, // TODO(verify): interpolated
          ],
          currency: 'ILS',
        },
        usTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): tiered ~0.3–0.4%, min $3.
          tiers: [
            { id: 'to-1m', upTo: 1_000_000, pct: 0.0035, min: 3 },
            { id: 'over-1m', pct: 0.003, min: 3 },
          ],
          currency: 'USD',
        },
        custodyFee: {
          annual: {
            type: 'tiered_pct',
            tierCurrency: 'ILS',
            // TODO(verify): sector-wide shape, not a Hapoalim tariff read.
            tiers: [
              { id: 'to-100k', upTo: 100_000, pct: 0.004 },
              { id: 'to-1m', upTo: 1_000_000, pct: 0.0025 },
              { id: 'over-1m', pct: 0.001 },
            ],
            currency: 'ILS',
          },
          billing: 'quarterly',
          minPerPeriod: 15, // TODO(verify)
        },
        fxFeePct: 0.0025, // TODO(verify)
      },
    ],
  },
  discount: {
    id: 'discount',
    name: 'Discount Bank',
    nameHe: 'בנק דיסקונט',
    kind: 'bank',
    schedules: [
      {
        taseTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): ~0.3–0.4% effective, deep discounts off tariff.
          tiers: [
            { id: 'to-1m', upTo: 1_000_000, pct: 0.0035 },
            { id: 'over-1m', pct: 0.003 },
          ],
          currency: 'ILS',
        },
        usTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): tiered ~0.3%, min $5.50.
          tiers: [
            { id: 'to-1m', upTo: 1_000_000, pct: 0.003, min: 5.5 },
            { id: 'over-1m', pct: 0.0025, min: 5.5 },
          ],
          currency: 'USD',
        },
        usTradePassthrough: { type: 'per_share', perShare: 0.005, currency: 'USD' },
        custodyFee: {
          annual: {
            type: 'tiered_pct',
            tierCurrency: 'ILS',
            // TODO(verify): sector-wide shape, not a Discount tariff read.
            tiers: [
              { id: 'to-100k', upTo: 100_000, pct: 0.004 },
              { id: 'to-1m', upTo: 1_000_000, pct: 0.0025 },
              { id: 'over-1m', pct: 0.001 },
            ],
            currency: 'ILS',
          },
          billing: 'quarterly',
          minPerPeriod: 15, // TODO(verify)
        },
        fxFeePct: 0.0025, // TODO(verify)
      },
    ],
  },
  'mizrahi-tefahot': {
    id: 'mizrahi-tefahot',
    name: 'Mizrahi-Tefahot',
    nameHe: 'מזרחי טפחות',
    kind: 'bank',
    schedules: [
      {
        taseTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): ~0.3–0.4% effective.
          tiers: [
            { id: 'to-1m', upTo: 1_000_000, pct: 0.0035 },
            { id: 'over-1m', pct: 0.003 },
          ],
          currency: 'ILS',
        },
        usTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          tiers: [
            { id: 'to-25k', upTo: 25_000, pct: 0.0036 },
            { id: 'to-1m', upTo: 1_000_000, pct: 0.0026 }, // TODO(verify): interpolated between published endpoints
            { id: 'over-1m', pct: 0.0016 },
          ],
          currency: 'USD',
        },
        usTradePassthrough: { type: 'per_share', perShare: 0.005, currency: 'USD' },
        custodyFee: {
          // The one bank the sector-wide custody shape is actually sourced
          // from (spec §3: "Mizrahi figures; other banks similar").
          annual: {
            type: 'tiered_pct',
            tierCurrency: 'ILS',
            tiers: [
              { id: 'to-100k', upTo: 100_000, pct: 0.004 }, // TODO(verify): 0.3–0.5% range, midpoint taken
              { id: 'to-1m', upTo: 1_000_000, pct: 0.0025 }, // TODO(verify): interpolated
              { id: 'over-1m', pct: 0.001 },
            ],
            currency: 'ILS',
          },
          billing: 'quarterly',
          minPerPeriod: 15, // TODO(verify)
        },
        fxFeePct: 0.0025, // TODO(verify)
      },
    ],
  },
  fibi: {
    id: 'fibi',
    name: 'FIBI',
    nameHe: 'הבינלאומי',
    kind: 'bank',
    schedules: [
      {
        taseTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): lowest bank average, ~0.067% reported — a single
          // figure, so one tier until a real table surfaces.
          tiers: [{ id: 'all', pct: 0.00067 }],
          currency: 'ILS',
        },
        usTrade: {
          type: 'tiered_pct',
          tierCurrency: 'ILS',
          // TODO(verify): "tiered, lowest avg" is all the sources give.
          tiers: [
            { id: 'to-1m', upTo: 1_000_000, pct: 0.002 },
            { id: 'over-1m', pct: 0.0015 },
          ],
          currency: 'USD',
        },
        usTradePassthrough: { type: 'per_share', perShare: 0.01, currency: 'USD' }, // TODO(verify): "up to 1¢/share"
        custodyFee: {
          // FIBI publishes an actual custodian fee: 0.01%, min ₪15, max ₪450.
          annual: {
            type: 'tiered_pct',
            tierCurrency: 'ILS',
            tiers: [{ id: 'all', pct: 0.0001 }],
            currency: 'ILS',
          },
          billing: 'quarterly',
          minPerPeriod: 15,
          maxPerPeriod: 450,
        },
        fxFeePct: 0.0025, // TODO(verify)
      },
    ],
  },
};

export const brokerIds = Object.keys(brokers);

export function getBroker(id: string): BrokerDef {
  const b = brokers[id];
  if (!b) throw new Error(`Unknown broker: ${id}`);
  return b;
}

/**
 * The fee schedule in force on a date — the same last-wins walk as
 * scheduleFor in src/markets/calendar.ts: oldest → newest, first entry
 * omits effectiveFrom, ISO string compare.
 */
export function scheduleFor(broker: BrokerDef, isoDate: string): FeeSchedule {
  let active = broker.schedules[0];
  for (const s of broker.schedules) {
    if (!s.effectiveFrom || s.effectiveFrom <= isoDate) active = s;
  }
  return active;
}
