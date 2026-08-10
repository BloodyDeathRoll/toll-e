import { expect, test, type Page } from '@playwright/test';

// Structural smoke checks. Market data is live (Yahoo behind our cache), so
// data-dependent panels assert "content or its empty/error state" — the suite
// must stay green offline and on symbols with thin coverage.
//
// Every screen renders both the mobile and desktop layout (one is
// display:none), so text lookups always filter to the visible instance.
const seen = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

/**
 * Real Google OAuth can't run headless, so signed-in surfaces go through the
 * E2E_TEST_AUTH password path (never enabled in production — see lib/auth.ts).
 * page.request shares the browser's cookie jar, so the session lands on the
 * page; Better Auth rejects cross-origin posts, hence the explicit Origin.
 */
let accountReady = false;

async function signIn(page: Page, baseURL: string) {
  const creds = { email: 'e2e@test.dev', password: 'testpass123' };
  const opts = { headers: { Origin: baseURL }, failOnStatusCode: false };
  if (!accountReady) {
    const signUp = await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'E2E Runner', ...creds },
      ...opts,
    });
    test.skip(
      signUp.status() === 404,
      'E2E_TEST_AUTH not enabled — password sign-in is disabled here',
    );
    // 422 = the account survived a previous run, which is fine.
    expect([200, 422]).toContain(signUp.status());
    accountReady = true;
  }
  const res = await page.request.post('/api/auth/sign-in/email', { data: creds, ...opts });
  expect(res.status()).toBe(200);
}

// Signed out, the app is a sign-in wall: the only reachable screens are the
// sign-in card and the two legal documents.
test.describe('signed-out wall', () => {
  test('home is the bare sign-in card — no app chrome', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
    await expect(seen(page, 'Investment tracking with real tax clarity')).toBeVisible();
    // No nav, no search, and no credential fields on the wall itself.
    await expect(page.getByRole('link', { name: 'Transactions' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Search ticker, company, index')).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('app screens redirect to the wall', async ({ page }) => {
    for (const path of ['/en/markets', '/en/tax', '/en/watchlists']) {
      await page.goto(path);
      await page.waitForURL('**/en');
      await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
    }
  });

  test('legal documents stay public', async ({ page }) => {
    await page.goto('/en/terms');
    await expect(seen(page, 'Terms of Use')).toBeVisible();
    await page.goto('/en/privacy');
    await expect(seen(page, 'Privacy Policy')).toBeVisible();
  });
});

test.describe('stock page tabs', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await signIn(page, baseURL!);
  });
  test('summary shows key statistics', async ({ page }) => {
    await page.goto('/en/stock/NVDA');
    await expect(seen(page, 'Key statistics')).toBeVisible();
    await expect(seen(page, 'Revenue vs earnings')).toBeVisible();
  });

  test('news tab shows a feed or its empty state', async ({ page }) => {
    await page.goto('/en/stock/NVDA?tab=news');
    const feed = page.locator('main a[target="_blank"]').filter({ visible: true }).first();
    const fallback = seen(page, /No recent news|Couldn't load data/);
    await expect(feed.or(fallback).first()).toBeVisible({ timeout: 15_000 });
  });

  test('analysis tab shows recommendations or its empty state', async ({ page }) => {
    await page.goto('/en/stock/NVDA?tab=analysis');
    const content = seen(page, /Analyst recommendations|No analyst coverage|Couldn't load data/);
    await expect(content).toBeVisible({ timeout: 15_000 });
  });

  test('financials tab shows revenue vs earnings card', async ({ page }) => {
    await page.goto('/en/stock/NVDA?tab=financials');
    await expect(seen(page, 'Revenue vs earnings')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('pwa', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await signIn(page, baseURL!);
  });
  test('is installable: manifest, worker, and icons all serve', async ({ page, request }) => {
    await page.goto('/en');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    // Android mints its WebAPK from PNGs — an SVG-only set is silently
    // uninstallable there, so assert both purposes exist as PNG.
    const png = (purpose: string) =>
      manifest.icons.filter((i: { type: string; purpose: string }) =>
        i.type === 'image/png' && i.purpose === purpose);
    expect(png('any').length).toBeGreaterThan(0);
    expect(png('maskable').length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
    expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);

    // The worker is what makes Chrome offer the install at all.
    expect((await request.get('/sw.js')).status()).toBe(200);
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistration().then(Boolean)))
      .toBe(true);
    // The inline capture must exist before hydration or the offer is lost.
    expect(await page.evaluate(() => '__TOLLE_BIP' in window)).toBe(true);
  });

  test('install sheet appears on an install offer and stays gone once answered', async ({ page }) => {
    await page.goto('/en');
    const fire = () =>
      page.evaluate(() => {
        const e = new Event('beforeinstallprompt') as Event & Record<string, unknown>;
        e.preventDefault = () => {};
        e.prompt = async () => {};
        e.userChoice = Promise.resolve({ outcome: 'dismissed' });
        dispatchEvent(e);
      });

    await fire();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(sheet).toHaveCount(0);

    // Answered — a reload must not ask again this session.
    await page.reload();
    await fire();
    await page.waitForTimeout(3_200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('hebrew locale', () => {
  test('renders RTL with Hebrew copy', async ({ page }) => {
    await page.goto('/he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(seen(page, 'מעקב השקעות עם בהירות מס אמיתית')).toBeVisible();
  });
});

test.describe('auth', () => {
  test('sign-in page offers Google and nothing else', async ({ page }) => {
    await page.goto('/en/sign-in');
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
    // Password auth is gone from the UI — no credential fields to fill.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test('sign-up redirects to the single sign-in screen', async ({ page }) => {
    await page.goto('/en/sign-up');
    await page.waitForURL('**/sign-in');
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
  });

  test('signed-in dashboard renders with app chrome', async ({ page, baseURL }) => {
    await signIn(page, baseURL!);
    await page.goto('/en');
    await expect(seen(page, /Holdings|No holdings yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toHaveCount(0);
    // The tab bar is back, and Tax replaced Watchlists on it.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(seen(page, 'Transactions')).toBeVisible();
    await expect(seen(page, 'Tax')).toBeVisible();
  });
});
