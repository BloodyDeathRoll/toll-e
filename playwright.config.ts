import { defineConfig } from '@playwright/test';

// Smoke suite (toll-e-plan.md §9 Phase 4). Uses the system Chrome channel so
// no browser download is needed (GitHub's ubuntu runners ship Chrome too).
// Locally it reuses a running `pnpm dev` on :3000 (which needs the local
// Postgres up for the signed-in spec); CI builds first and runs `pnpm start`.
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  forbidOnly: CI,
  // Serial on purpose: parallel first-hits stampede Turbopack's cold compile
  // in dev and it 500s with chunk/JSON races unrelated to app code.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000/en',
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
