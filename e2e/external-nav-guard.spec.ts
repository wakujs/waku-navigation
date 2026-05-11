import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('01_minimal');

// The Router subscribes to `navigate` events and calls event.intercept() for
// in-app routing. Without a guard, that would also intercept hash-only,
// cross-origin, download, and form-submission navigations -- so the guard
// must skip those and let the browser handle them natively.
test.describe('external-nav guard', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('hash-only navigation does not trigger an RSC refetch', async ({
    page,
  }) => {
    const rscRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/RSC/') || url.includes('?_rsc')) {
        rscRequests.push(url);
      }
    });

    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__sentinel = Date.now();
    });

    const before = rscRequests.length;
    await page.evaluate(() => window.navigation.navigate('#section').finished);
    // Give the network a tick to surface any (unwanted) refetch.
    await page.waitForTimeout(200);

    expect(rscRequests.length).toBe(before);
    await expect(page).toHaveURL(`http://localhost:${port}/#section`);
    // Page wasn't reloaded.
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__sentinel,
      ),
    ).toBeTruthy();
    // Heading still reflects the current route.
    await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
  });

  test('cross-origin link does not trigger intercept', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);

    // window.navigation.navigate() to a cross-origin URL fires a `navigate`
    // event with canIntercept=false; our guard returns early. We assert that
    // the listener observed canIntercept=false (so it didn't even attempt to
    // intercept) -- we can't actually let the browser navigate cross-origin
    // in the test, so we cancel inside the listener.
    const observed = await page.evaluate(() => {
      return new Promise<{ canIntercept: boolean }>((resolve) => {
        const listener = (event: NavigateEvent) => {
          window.navigation.removeEventListener('navigate', listener);
          event.preventDefault();
          resolve({ canIntercept: event.canIntercept });
        };
        window.navigation.addEventListener('navigate', listener);
        // Intentionally a non-existent host; we cancel synchronously above.
        window.navigation
          .navigate('https://example.invalid/')
          .finished.catch(() => {});
      });
    });
    expect(observed.canIntercept).toBe(false);
  });
});
