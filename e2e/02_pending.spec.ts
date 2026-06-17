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

test('navigates from home to the slow page via <Link>', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.locator('h1')).toHaveText('Home');

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page).toHaveURL('/slow');
});

test("a <Link>'s status consumer reports pending while the route loads", async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // Click without awaiting; the pending indicator inside the <Link> shows while
  // the slow route's RSC streams in, then clears once it commits.
  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.getByTestId('pending')).toBeVisible();
  // The previous page is still rendered during the load.
  await expect(page.locator('h1')).toHaveText('Home');

  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('two <Link>s to the same route stay independent on click', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);
  await expect(page.getByTestId('pending-alt')).toHaveCount(0);

  // Only the clicked <Link> lights up -- correlated by its own element, not by
  // the destination it shares with the others.
  await page.getByRole('link', { name: 'Slow (alt)', exact: true }).click();
  await expect(page.getByTestId('pending-alt')).toBeVisible();
  await expect(page.getByTestId('pending')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending-alt')).toHaveCount(0);
});

test('a plain <a> still navigates and carries no status', async ({ page }) => {
  await page.goto('/slow');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // Home is a plain <a> -- it navigates client-side but lights no indicator.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.waitForTimeout(100);
  await expect(page.getByTestId('pending')).toHaveCount(0);
  await expect(page.getByTestId('pending-alt')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Home');
});

test('previous page stays visible while the next route is loading', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Home');
  await expect(page.locator('h1')).toHaveText('Slow Page');
});

test('pending stays true through nested client-side Suspense, not just the server response', async ({
  page,
}) => {
  // /slow waits ~500ms on the server, THEN its <SlowClientData> client
  // component suspends another ~800ms via use(promise). The indicator must
  // stay visible through both phases -- the new tree can't commit until the
  // client suspense settles too.
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await page.waitForTimeout(700);
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Home');

  await expect(page.getByTestId('slow-data')).toHaveText('client data loaded');
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('programmatic navigation lights every <Link> to the destination', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  // No source element: matched by destination, so both the plain and the
  // prefetch <Link> to /slow light up (the view-transition one is bypassed).
  await page.evaluate(() => {
    void window.navigation.navigate('/slow').finished;
  });
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.getByTestId('pending-alt')).toBeVisible();
  await expect(page.getByTestId('pending-vt')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('browser back/forward lights the matching <Link>', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);

  await page.getByRole('link', { name: 'Slow', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Slow Page');

  await page.goBack();
  await expect(page.locator('h1')).toHaveText('Home');

  await page.goForward();
  await expect(page.getByTestId('pending')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Slow Page');
  await expect(page.getByTestId('pending')).toHaveCount(0);
});

test('unstable_startTransition link navigates but bypasses status', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('pending-vt')).toHaveCount(0);

  // The view-transition <Link> wraps the commit in its own transition, so its
  // status stays dark throughout while the navigation still completes.
  await page
    .getByRole('link', { name: 'Slow (view transition)', exact: true })
    .click();
  for (let i = 0; i < 12; i++) {
    expect(await page.getByTestId('pending-vt').count()).toBe(0);
    await page.waitForTimeout(50);
  }
  await expect(page.locator('h1')).toHaveText('Slow Page');
});

test('ignores React default-transition-indicator fake navigations', async ({
  page,
}) => {
  // React >=19.2's onDefaultTransitionIndicator, on by default, fires a fake
  // same-URL navigation tagged info: 'react-transition' for every transition
  // and intercepts it to drive the browser's native spinner. The router skips
  // those (see the info guard in client.tsx) so an unrelated useTransition
  // can't turn into a route refetch. <Link> navigations are unaffected: a real
  // link click carries no such info.
  //
  // On /slow the "Slow" <Link>'s consumer (pending) is mounted and dark. A
  // mishandled fake navigation would refetch /slow and light it for the
  // duration of that slow load.
  await page.goto('/slow');
  await waitForHydration(page);
  await expect(page.getByTestId('pending')).toHaveCount(0);

  await page.evaluate(() => {
    const absorb = (e: NavigateEvent) => {
      if (e.canIntercept && e.info === 'react-transition') {
        e.intercept({ handler: () => new Promise((r) => setTimeout(r, 600)) });
      }
    };
    window.navigation.addEventListener('navigate', absorb);
    window.navigation.navigate(window.location.href, {
      history: 'replace',
      info: 'react-transition',
    });
  });

  // Poll so a transient light-up can't slip past a single retried assertion.
  for (let i = 0; i < 16; i++) {
    expect(await page.getByTestId('pending').count()).toBe(0);
    await page.waitForTimeout(50);
  }
  await expect(page).toHaveURL('/slow');
  await expect(page.locator('h1')).toHaveText('Slow Page');
});

test('native-spinner demo: a non-navigation transition swaps content without navigating', async ({
  page,
}) => {
  // The home page's NativeSpinnerDemo runs a startTransition that suspends ~1s.
  // React drives the browser's native spinner during it (the demo renders no
  // custom indicator). The router must not mistake React's fake
  // 'react-transition' navigation for a route change.
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('batch')).toHaveText('no batch yet');

  await page.getByTestId('load-batch').click();
  await expect(page.getByTestId('batch')).toHaveText('batch #1 loaded');

  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toHaveText('Home');
});
