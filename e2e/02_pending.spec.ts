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

test("nav-status indicator shows while its <a>'s href is loading", async ({
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

test('nav-status indicator does not light up for navigations to other hrefs', async ({
  page,
}) => {
  // Start on /slow. Home is a plain <a> with no data-nav-key; the Slow links
  // carry one.
  await page.goto('/slow');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // Navigate Home -- not the destination any Slow nav-key watches, so the
  // indicator must stay hidden.
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

test('two same-href anchors with distinct nav-keys stay independent', async ({
  page,
}) => {
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

test('nav-status indicator lights up for programmatic navigation that matches its href', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // No event.sourceElement -- there's no click. The first nav-key anchor whose
  // href resolves to /slow (the "slow" one) lights up.
  await page.evaluate(() => {
    void window.navigation.navigate('/slow').finished;
  });
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Home');
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('nav-status indicator lights up on browser back/forward to a matching href', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Slow Page');

  // Go back to /, then forward to /slow. The forward step has no source
  // element but the destination matches the "slow" anchor's href.
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('Home');

  await page.goForward();
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('useNavigationStatus: a consumer inside the clicked <a> reports pending through client suspense', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('nav-status')).toHaveCount(0);

  await page.locator('a', { hasText: 'Slow (status)' }).click();
  await expect(page.getByTestId('nav-status')).toBeVisible();
  // Matched by the clicked anchor's nav-key, so the indicators for the other
  // /slow links (different nav-keys) must stay dark.
  await expect(page.getByTestId('pending')).toHaveCount(0);
  await expect(page.getByTestId('pending-alt')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Home');

  // Comfortably past the ~500ms server response; the client suspense keeps
  // the transition (and therefore the pending state) alive.
  await page.waitForTimeout(700);
  await expect(page.getByTestId('nav-status')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Home');

  // pending reverts in the same commit that reveals the new route.
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('nav-status')).toHaveCount(0);
});

test('useNavigationStatus: stays dark when a sibling link to the same href is clicked', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.getByTestId('nav-status')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('nav-status')).toHaveCount(0);
});

test('useNavigationStatus: a consumer whose navKey matches no <a> never reports pending', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('nav-status-outside')).toHaveCount(0);

  // Drive an actual navigation; the matching consumer lights up, the one with
  // an unused navKey must stay empty throughout.
  await page.locator('a', { hasText: 'Slow (status)' }).click();
  await expect(page.getByTestId('nav-status')).toBeVisible();
  await expect(page.getByTestId('nav-status-outside')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('nav-status-outside')).toHaveCount(0);
});

test('useNavigationStatus: { href } matching lights up from a plain <a> with no data-nav-key', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('status-href')).toHaveCount(0);

  // The "Slow (href)" anchor carries no data-nav-key; the consumer matches by
  // destination alone.
  await page.getByRole('link', { name: 'Slow (href)', exact: true }).click();
  await expect(page.getByTestId('status-href')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('status-href')).toHaveCount(0);
});

test('useNavigationStatus: { href } matching also fires for a different anchor to the same href', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  // Click the data-nav-key="slow" anchor. The href-matched consumer (href
  // /slow) lights up too -- it keys off the destination, not the anchor --
  // while the dataNavKey consumers for the OTHER anchors stay dark.
  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.getByTestId('status-href')).toBeVisible();
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.getByTestId('pending-alt')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('status-href')).toHaveCount(0);
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
