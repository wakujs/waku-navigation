import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('01_minimal');

test.describe('01_minimal', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('SSR home page', async ({ page }) => {
    const response = await page.goto(`http://localhost:${port}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
    await expect(page.locator('a', { hasText: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.locator('a', { hasText: 'About' })).toHaveAttribute(
      'href',
      '/about',
    );
  });

  test('SSR about page', async ({ page }) => {
    const response = await page.goto(`http://localhost:${port}/about`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
  });

  test('hydrates and exposes Navigation API', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    const result = await page.evaluate(() => ({
      hydrated: (globalThis as Record<string, unknown>).__WAKU_HYDRATE__,
      hasNavigation: typeof window.navigation !== 'undefined',
      currentUrl: window.navigation?.currentEntry?.url,
    }));
    expect(result.hydrated).toBe(true);
    expect(result.hasNavigation).toBe(true);
    expect(result.currentUrl).toBe(`http://localhost:${port}/`);
  });

  test('client-side navigation home → about → home preserves window state', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    // Sentinel survives only if no full reload occurred.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__sentinel = Date.now();
    });

    await page.locator('a', { hasText: 'About' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/about`);
    await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__sentinel,
      ),
    ).toBeTruthy();

    await page.locator('a', { hasText: 'Home' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/`);
    await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__sentinel,
      ),
    ).toBeTruthy();
  });

  test('browser back / forward navigates client-side', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__sentinel = Date.now();
    });

    await page.locator('a', { hasText: 'About' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/about`);

    await page.goBack();
    await expect(page).toHaveURL(`http://localhost:${port}/`);
    await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__sentinel,
      ),
    ).toBeTruthy();

    await page.goForward();
    await expect(page).toHaveURL(`http://localhost:${port}/about`);
    await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__sentinel,
      ),
    ).toBeTruthy();
  });
});
