import { relations } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { user } from './auth';

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
