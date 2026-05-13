import { expect, test, type Page } from '@playwright/test';

test.use({ baseURL: `http://localhost:${process.env.E2E_PORT_02_PENDING}` });

async function waitForHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () =>
      Object.getOwnPropertyNames(document.body).some((k) =>
        k.startsWith('__reactFiber'),
      ),
    null,
    { timeout: 60_000 },
  );
}

test('navigates from home to the slow page', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.locator('h1')).toHaveText('Home');

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page).toHaveURL('/slow');
});

test("Pending wrapper shows the fallback while its <a>'s href is loading", async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // Click Slow without awaiting the navigation; the pending indicator should
  // be visible while the slow route's RSC streams in, then disappear once it
  // commits.
  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.getByTestId('pending')).toBeVisible();
  // During this wait the previous page is still rendered.
  await expect(page.locator('h1')).toHaveText('Home');

  // Once the slow route commits, the indicator goes away and the new heading
  // takes over.
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('Pending wrapper does not light up for navigations to other hrefs', async ({
  page,
}) => {
  // Start on /slow so the Home link doesn't have a Pending wrapper but the
  // Slow link does.
  await page.goto('/slow');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // Navigate Home -- this is not the destination the <Pending> around Slow
  // is watching, so the indicator must stay hidden.
  await page.locator('a', { hasText: 'Home' }).click();
  // Give any wrong-path indicator a chance to render before we assert.
  await page.waitForTimeout(100);
  await expect(page.getByTestId('pending')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Home');
});

test('previous page stays visible while the next route is loading', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  // Right after clicking, the old heading should still be visible (no flash
  // of an empty Suspense boundary -- the previous route is held).
  await expect(page.locator('h1')).toHaveText('Home');
  // ...and eventually we land on Slow Page.
  await expect(page.locator('h1')).toHaveText('Slow Page');
});

test('two <Pending>s for the same href stay independent', async ({ page }) => {
  // Both links navigate to /slow. Only the one the user actually clicked
  // should light up its spinner.
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);
  await expect(page.getByTestId('pending-alt')).toHaveCount(0);

  await page.locator('a', { hasText: 'Slow (alt)' }).click();
  await expect(page.getByTestId('pending-alt')).toBeVisible();
  // The primary spinner must NOT light up for the alt click.
  await expect(page.getByTestId('pending')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending-alt')).toHaveCount(0);
});

test('Pending lights up for programmatic navigation that matches its href', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // No event.sourceElement -- there's no click. The Pending for /slow should
  // still light up because the destination matches its wrapped <a>'s href.
  await page.evaluate(() => {
    void window.navigation.navigate('/slow').finished;
  });
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Home');
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('Pending lights up on browser back/forward to a matching href', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Slow Page');

  // Go back to /, then forward to /slow. The forward step has no source
  // element but the destination matches the Pending's href.
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('Home');

  await page.goForward();
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('pending stays true through nested client-side Suspense, not just the server response', async ({
  page,
}) => {
  // /slow waits ~500ms on the server, THEN its <SlowClientData> client
  // component suspends another ~800ms via use(promise). The indicator must
  // stay visible through both phases -- a solution that only tracked the
  // server response would clear it after ~500ms, but the new tree can't
  // actually commit until the client suspense settles too.
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  // Comfortably past the server response window; the client suspense should
  // still be in flight here.
  await page.waitForTimeout(700);
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Home');

  // Once everything settles, the new tree commits as a unit.
  await expect(page.getByTestId('slow-data')).toHaveText('client data loaded');
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});
