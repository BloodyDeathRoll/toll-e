import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/src/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
    },
  },
  user: {
    additionalFields: {
      // Registry-driven strings, never enums (see AGENTS.md).
      locale: { type: 'string', defaultValue: 'en' },
      defaultMarket: { type: 'string', defaultValue: 'US' },
      displayCurrency: { type: 'string', defaultValue: 'USD' },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
