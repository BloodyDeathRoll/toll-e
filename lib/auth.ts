import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/src/db';

// Vercel deployment URLs are dynamic (a fresh host per preview deploy), so
// the auth origin is derived rather than hardcoded: BETTER_AUTH_URL wins when
// set (custom domain), else the project's production URL, else this
// deployment's own URL. Every candidate is trusted so preview links can sign
// in without per-deploy configuration.
const originCandidates = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
].filter((v): v is string => Boolean(v));

export const auth = betterAuth({
  baseURL: originCandidates[0],
  trustedOrigins: originCandidates,
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
