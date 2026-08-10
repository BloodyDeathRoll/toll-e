import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/src/db';

// Vercel deployment URLs are dynamic (a fresh host per preview deploy), so
// the auth origin is derived rather than hardcoded: BETTER_AUTH_URL wins when
// set (custom domain), else the project's production URL, else this
// deployment's own URL. Every candidate is trusted so preview links can sign
// in without per-deploy configuration.
// A localhost BETTER_AUTH_URL is ignored when running on Vercel: it can only
// have come from a stray local .env.local, and letting it win sends Google's
// OAuth redirect_uri to localhost — which fails for every real user.
const configuredUrl = process.env.BETTER_AUTH_URL;
const localConfigOnVercel =
  Boolean(process.env.VERCEL) && /localhost|127\.0\.0\.1/.test(configuredUrl ?? '');

const originCandidates = [
  localConfigOnVercel ? undefined : configuredUrl,
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
].filter((v): v is string => Boolean(v));

// Extra dev origins (e.g. the LAN IP a phone browses to): comma-separated,
// honored only off-Vercel so a stray var can't widen production.
const extraTrustedOrigins = process.env.VERCEL
  ? []
  : (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Google is the only way in. Password auth exists solely so the headless
// smoke suite can sign in (real OAuth can't run in CI) — it needs an explicit
// opt-in AND a non-production environment, so a stray env var can never open
// password sign-up on the live site.
const testAuthEnabled =
  process.env.E2E_TEST_AUTH === '1' && process.env.VERCEL_ENV !== 'production';

export const auth = betterAuth({
  baseURL: originCandidates[0],
  trustedOrigins: [...originCandidates, ...extraTrustedOrigins],
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: testAuthEnabled,
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
