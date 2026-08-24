import { relations } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import type { FeeOverrides } from '@/src/brokers/types';

// Market ids ('US', 'IL') and ISO currency codes ('USD', 'ILS') are stored as
// plain strings, never enums — the market registry (src/markets) is the source
// of truth. Money amounts always travel with their currency.

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const portfolios = pgTable(
  'portfolios',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    market: text('market').notNull(), // registry id, e.g. 'US' | 'IL'
    currency: text('currency').notNull(), // ISO 4217, e.g. 'USD' | 'ILS'
    // 0 ⇒ tax UI hidden for this portfolio. Tax is always derived from
    // transactions + this rate — never stored.
    taxRatePct: numeric('tax_rate_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('25'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('portfolios_userId_idx').on(t.userId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(), // provider symbol, e.g. 'NVDA', 'TEVA.TA'
    type: text('type', { enum: ['BUY', 'SELL'] }).notNull(), // SHORT/COVER later
    tradeDate: date('trade_date').notNull(),
    shares: numeric('shares', { precision: 20, scale: 8 }).notNull(), // fractional shares supported
    pricePerShare: numeric('price_per_share', { precision: 20, scale: 6 }).notNull(),
    commission: numeric('commission', { precision: 20, scale: 6 }).notNull().default('0'),
    // Where the commission figure came from: 'manual' or
    // 'profile:<brokerId>@<effectiveFrom>'. NULL on rows predating the
    // feature. Audit trail only — the stored commission is authoritative.
    commissionSource: text('commission_source'),
    currency: text('currency').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('transactions_portfolioId_idx').on(t.portfolioId),
    index('transactions_portfolio_symbol_date_idx').on(t.portfolioId, t.symbol, t.tradeDate),
  ],
);

export const watchlists = pgTable(
  'watchlists',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /**
     * Registry market id (string, never an enum — src/markets/registry.ts).
     * Lists are per-market: a list created while browsing TASE holds TASE
     * tickers. NULL = market-agnostic — Holdings (mirrors positions across
     * markets) and lists from before market scoping.
     */
    market: text('market'),
    sortOrder: integer('sort_order').notNull().default(0),
    displayCurrency: text('display_currency'),
    displayMode: text('display_mode', { enum: ['pct', 'price', 'mcap'] })
      .notNull()
      .default('pct'),
    sortMode: text('sort_mode', { enum: ['custom', 'price', 'changePct', 'name'] })
      .notNull()
      .default('custom'),
    isDefault: integer('is_default').notNull().default(0), // 0/1; one default per user enforced in app code
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('watchlists_userId_idx').on(t.userId)],
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    watchlistId: text('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.watchlistId, t.symbol] })],
);

// Who the user trades through — one broker per user, on the account, not the
// portfolio (nobody trades in two places, and it makes the ₪15/month account
// fee unambiguous: one account, one fee, however many portfolios). Its own
// table rather than better-auth additionalFields: those serialize into every
// session response, and the sign-in path is what the e2e suite stands on.
export const brokerProfiles = pgTable(
  'broker_profiles',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Registry id (src/brokers). NULL = answered "I'll set this later". */
    brokerId: text('broker_id'),
    /** Pinned bank tier; NULL = resolve from portfolio value. */
    tierId: text('tier_id'),
    /** Sparse field-level overrides merged over the resolved schedule. */
    overrides: jsonb('overrides').$type<FeeOverrides>(),
    // Promo waivers ("2 years free monthly fee") — spec §2.
    accountFeeWaivedUntil: date('account_fee_waived_until'),
    /**
     * When the brokerage account was opened — the monthly-fee clock starts
     * here, so backdating it populates past months with fees. NULL (rows
     * predating the field) falls back to the first trade date.
     */
    accountOpenedAt: date('account_opened_at'),
    /** Non-null even for "later" — this is what stops the re-prompt. */
    answeredAt: timestamp('answered_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex('broker_profiles_userId_idx').on(t.userId)],
);

// Cached instrument metadata from the market-data provider.
export const instruments = pgTable('instruments', {
  symbol: text('symbol').primaryKey(),
  name: text('name').notNull(),
  exchange: text('exchange'),
  market: text('market').notNull(),
  currency: text('currency').notNull(),
  type: text('type'), // EQUITY | ETF | INDEX | ...
  logoUrl: text('logo_url'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Daily closes — needed for backdated transactions and tax audit trails.
export const priceHistory = pgTable(
  'price_history',
  {
    symbol: text('symbol').notNull(),
    date: date('date').notNull(),
    open: numeric('open', { precision: 20, scale: 6 }),
    high: numeric('high', { precision: 20, scale: 6 }),
    low: numeric('low', { precision: 20, scale: 6 }),
    close: numeric('close', { precision: 20, scale: 6 }).notNull(),
    adjClose: numeric('adj_close', { precision: 20, scale: 6 }),
    volume: bigint('volume', { mode: 'number' }),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] })],
);

// Daily FX rates, e.g. pair 'USDILS'. Presentation-layer conversion only —
// the tax engine never converts currencies.
export const fxRates = pgTable(
  'fx_rates',
  {
    pair: text('pair').notNull(),
    date: date('date').notNull(),
    rate: numeric('rate', { precision: 20, scale: 8 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.pair, t.date] })],
);

// Hebrew name and About text per symbol, filled once and shared by everyone.
//
// Three sources feed it, best first: Hebrew Wikipedia, Wikidata, and the
// reader's own browser (Chrome's on-device Translator). Whichever answers
// first for a symbol is what every later reader gets — the point of the table
// is that no symbol is ever fetched, or translated, twice.
export const symbolI18n = pgTable(
  'symbol_i18n',
  {
    symbol: text('symbol').notNull(),
    lang: text('lang').notNull(), // 'he'
    field: text('field').notNull(), // 'name' | 'about'
    text: text('text').notNull(),
    origin: text('origin').notNull(), // 'wiki' | 'device'
    /** hewiki article, for the CC BY-SA credit the licence asks for. */
    sourceUrl: text('source_url'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.lang, t.field] })],
);

export const portfolioRelations = relations(portfolios, ({ one, many }) => ({
  user: one(user, { fields: [portfolios.userId], references: [user.id] }),
  transactions: many(transactions),
}));

export const transactionRelations = relations(transactions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [transactions.portfolioId],
    references: [portfolios.id],
  }),
}));

export const watchlistRelations = relations(watchlists, ({ one, many }) => ({
  user: one(user, { fields: [watchlists.userId], references: [user.id] }),
  items: many(watchlistItems),
}));

export const watchlistItemRelations = relations(watchlistItems, ({ one }) => ({
  watchlist: one(watchlists, {
    fields: [watchlistItems.watchlistId],
    references: [watchlists.id],
  }),
}));
