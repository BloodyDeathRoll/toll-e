import { expect, test, type Page } from '@playwright/test';

// Structural smoke checks. Market data is live (Yahoo behind our cache), so
// data-dependent panels assert "content or its empty/error state" — the suite
// must stay green offline and on symbols with thin coverage.
//
// Every screen renders both the mobile and desktop layout (one is
// display:none), so text lookups always filter to the visible instance.
const seen = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

test.describe('signed-out demo', () => {
  test('portfolio dashboard renders demo holdings', async ({ page }) => {
    await page.goto('/en');
    await expect(seen(page, 'Sign in')).toBeVisible();
    await expect(seen(page, /Holdings · USD|Portfolio value/)).toBeVisible();
    await expect(seen(page, 'NVDA')).toBeVisible();
  });

  test('markets page renders', async ({ page }) => {
    await page.goto('/en/markets');
    await expect(seen(page, 'Leading indexes')).toBeVisible();
  });

  test('tax page renders demo showcase', async ({ page }) => {
    await page.goto('/en/tax');
    await expect(seen(page, 'What you owe so far')).toBeVisible();
  });

  test('watchlists page renders sample lists', async ({ page }) => {
    await page.goto('/en/watchlists');
    await expect(seen(page, 'Sample lists')).toBeVisible();
  });

  test('mobile layout shows the bottom tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');
    await expect(seen(page, 'Markets')).toBeVisible();
    await expect(seen(page, 'Tax')).toBeVisible();
  });
});

test.describe('stock page tabs', () => {
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

test.describe('hebrew locale', () => {
  test('renders RTL with Hebrew navigation', async ({ page }) => {
    await page.goto('/he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(seen(page, 'תיק')).toBeVisible();
  });
});

test.describe('auth', () => {
  test('signs in with the test account', async ({ page, request }) => {
    // Ensure the account exists (fresh CI database); 422 "already exists"
    // locally is fine and ignored.
    await request.post('/api/auth/sign-up/email', {
      data: { name: 'Shahar Naor', email: 'shahar@test.dev', password: 'testpass123' },
    });

    await page.goto('/en/sign-in');
    await page.getByLabel('Email').fill('shahar@test.dev');
    await page.getByLabel('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/en', { timeout: 15_000 });
    // Signed-in chrome replaces the sign-in CTA with the user menu.
    await expect(seen(page, /Holdings · USD|Portfolio value/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  });
});
