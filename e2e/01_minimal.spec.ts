import { expect, test, type Page } from '@playwright/test';

test.use({ baseURL: `http://localhost:${process.env.E2E_PORT_01_MINIMAL}` });

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

test('SSR home page', async ({ page }) => {
  const response = await page.goto('/');
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
  const response = await page.goto('/about');
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
});

test('hydrates and exposes Navigation API', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const result = await page.evaluate(() => ({
    hydrated: (globalThis as Record<string, unknown>).__WAKU_HYDRATE__,
    hasNavigation: typeof window.navigation !== 'undefined',
    currentPath: new URL(window.navigation!.currentEntry!.url!).pathname,
  }));
  expect(result).toEqual({
    hydrated: true,
    hasNavigation: true,
    currentPath: '/',
  });
});

test('client-side navigation home ↔ about preserves window state', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  // Sentinel survives only if no full reload occurred.
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__sentinel = Date.now();
  });

  await page.locator('a', { hasText: 'About' }).click();
  await expect(page).toHaveURL('/about');
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__sentinel,
    ),
  ).toBeTruthy();

  await page.locator('a', { hasText: 'Home' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__sentinel,
    ),
  ).toBeTruthy();
});

test('browser back / forward navigates client-side', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__sentinel = Date.now();
  });

  await page.locator('a', { hasText: 'About' }).click();
  await expect(page).toHaveURL('/about');

  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');

  await page.goForward();
  await expect(page).toHaveURL('/about');
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');

  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__sentinel,
    ),
  ).toBeTruthy();
});

test('external-nav guard: hash-only navigation does not trigger an RSC refetch', async ({
  page,
}) => {
  const rscRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/RSC/')) rscRequests.push(req.url());
  });

  await page.goto('/');
  await waitForHydration(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__sentinel = Date.now();
  });

  const before = rscRequests.length;
  await page.evaluate(() => window.navigation.navigate('#section').finished);
  await page.waitForTimeout(200);

  expect(rscRequests.length).toBe(before);
  await expect(page).toHaveURL('/#section');
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__sentinel,
    ),
  ).toBeTruthy();
  await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
});

test('external-nav guard: cross-origin link does not trigger intercept', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  // navigation.navigate() to a cross-origin URL fires a `navigate` event with
  // canIntercept=false; our guard returns early. We cancel synchronously here
  // so the browser never actually leaves the page.
  const observed = await page.evaluate(() => {
    return new Promise<{ canIntercept: boolean }>((resolve) => {
      const listener = (event: NavigateEvent) => {
        window.navigation.removeEventListener('navigate', listener);
        event.preventDefault();
        resolve({ canIntercept: event.canIntercept });
      };
      window.navigation.addEventListener('navigate', listener);
      window.navigation
        .navigate('https://example.invalid/')
        .finished?.catch(() => {});
    });
  });
  expect(observed.canIntercept).toBe(false);
});

test('useRouter exposes path, query, and hash; query is passed to refetch', async ({
  page,
}) => {
  const rscRequestUrls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/RSC/')) rscRequestUrls.push(req.url());
  });
  await page.goto('/?foo=bar');
  await waitForHydration(page);
  await expect(page.getByTestId('route-info')).toHaveText(
    'path=/;query=foo=bar;hash=',
  );

  // Navigate to /about?baz=qux -- refetch should fire with query=baz%3Dqux
  // appended to the RSC URL.
  await page.evaluate(
    () => window.navigation.navigate('/about?baz=qux').finished,
  );
  await expect(page).toHaveURL('/about?baz=qux');
  await expect(page.getByTestId('route-info')).toHaveText(
    'path=/about;query=baz=qux;hash=',
  );
  expect(rscRequestUrls.some((u) => u.includes('query=baz%3Dqux'))).toBe(true);

  // Hash-only nav: not intercepted, but the state should still sync.
  await page.evaluate(() => window.navigation.navigate('#section').finished);
  await expect(page.getByTestId('route-info')).toHaveText(
    'path=/about;query=baz=qux;hash=#section',
  );
});

test('static routes skip the refetch on revisit', async ({ page }) => {
  const rscRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/RSC/')) rscRequests.push(req.url());
  });
  await page.goto('/');
  await waitForHydration(page);

  // First click: /about isn't cached client-side yet, expect a refetch.
  await page.locator('a', { hasText: 'About' }).click();
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
  await page.waitForTimeout(100);
  expect(rscRequests.length).toBeGreaterThan(0);

  // Second click: / was marked IS_STATIC by the initial SSR payload, so the
  // router should NOT refetch -- the element is still in Waku's store.
  const before = rscRequests.length;
  await page.locator('a', { hasText: 'Home' }).click();
  await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
  await page.waitForTimeout(100);
  expect(rscRequests.length).toBe(before);
});

test('refetch sends X-Waku-Router-Skip mapping cached element ids to etags', async ({
  page,
}) => {
  const skipHeaders: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/RSC/')) {
      const h = req.headers()['x-waku-router-skip'];
      if (h !== undefined) skipHeaders.push(h);
    }
  });
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('a', { hasText: 'About' }).click();
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
  await page.waitForTimeout(100);

  expect(skipHeaders.length).toBeGreaterThan(0);
  // The header should be a JSON object mapping slot ids to etags; not just
  // "{}" (we had initial elements from SSR before this navigation).
  const parsed: unknown = JSON.parse(skipHeaders[0]!);
  expect(Array.isArray(parsed)).toBe(false);
  expect(typeof parsed).toBe('object');
  const entries = Object.entries(parsed as Record<string, unknown>);
  expect(entries.length).toBeGreaterThan(0);
  // Each etag is either a string (dynamic slot) or waku's numeric static
  // sentinel 1 (static slot); /'s slots are static, so they come back as 1.
  for (const [, etag] of entries) {
    expect(['string', 'number']).toContain(typeof etag);
  }
});

test('<Slice> renders a server-defined slice inside a page', async ({
  page,
}) => {
  // /about lists `slices: ['clock']` in its getConfig; the clock slice is
  // declared at src/pages/_slices/clock.tsx and rendered via <Slice id="clock">.
  await page.goto('/about');
  await expect(page.getByTestId('clock')).toContainText(
    'The time on the server when this slice was rendered',
  );
  // The slice's text contains an ISO timestamp; just sanity-check it parses.
  const text = (await page.getByTestId('clock').textContent()) ?? '';
  const match = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.exec(text);
  expect(match).not.toBeNull();
});

test('non-404 refetch failure propagates to the user ErrorBoundary', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  // Force the next /RSC/* fetch to reject with a non-404 error. The Router's
  // catch path should setRenderError(err) and rethrow during render so the
  // example's ErrorBoundary catches it.
  await page.evaluate(() => {
    const origFetch = window.fetch;
    let used = false;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (!used && url.includes('/RSC/')) {
        used = true;
        return Promise.reject(new Error('Forced network failure'));
      }
      return origFetch.call(window, input, init);
    } as typeof fetch;
  });

  // /about isn't in our static set yet, so this triggers a refetch -> fails.
  await page.locator('a', { hasText: 'About' }).click();
  await expect(page.getByTestId('error-fallback')).toBeVisible();
  await expect(page.getByTestId('error-fallback')).toContainText(
    'Forced network failure',
  );
});

test('useRouter().prefetch warms the RSC cache so subsequent navigation skips the network', async ({
  page,
}) => {
  const aboutRscUrls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/RSC/R/about')) {
      aboutRscUrls.push(req.url());
    }
  });
  await page.goto('/');
  await waitForHydration(page);

  // Click "Prefetch /about" -- should fire exactly one RSC request for /about.
  // The response promise must be registered before the click so a fast CI
  // response isn't missed in the window between click and listener attach.
  const aboutResponse = page.waitForResponse((res) =>
    res.url().includes('/RSC/R/about'),
  );
  await page.getByTestId('prefetch').click();
  await aboutResponse;
  expect(aboutRscUrls.length).toBe(1);

  // Now actually navigate. The prefetch already populated Waku's RSC store,
  // so no additional network request should fire.
  await page.locator('a', { hasText: 'About' }).click();
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
  await page.waitForTimeout(100);
  expect(aboutRscUrls.length).toBe(1);
});

test('useRouter().push with scroll: false preserves the current scroll position', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  // Scroll down on the home page (which has a 2000px spacer to make this possible).
  await page.evaluate(() => window.scrollTo(0, 500));
  expect(await page.evaluate(() => window.scrollY)).toBe(500);

  // push('/about', { scroll: false }) -- after the navigation completes, the
  // scroll position should be unchanged. With default scroll behavior the
  // browser would scroll to top.
  await page.getByTestId('push-no-scroll').click();
  await expect(page).toHaveURL('/about');
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
  expect(await page.evaluate(() => window.scrollY)).toBe(500);
});

test('useRouter().unstable_events emits start and complete on route change', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByTestId('event-log')).toHaveText('');

  await page.locator('a', { hasText: 'About' }).click();
  await expect(page.locator('h1')).toHaveText('Welcome to the About Page');
  await expect(page.getByTestId('event-log')).toHaveText(
    'start:/about|complete:/about',
  );

  await page.locator('a', { hasText: 'Home' }).click();
  await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
  await expect(page.getByTestId('event-log')).toHaveText(
    'start:/about|complete:/about|start:/|complete:/',
  );
});

test('HMR reload listener clears the static cache and refetches the current route', async ({
  page,
}) => {
  const homeRscUrls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/RSC/R/_root')) homeRscUrls.push(req.url());
  });
  await page.goto('/');
  await waitForHydration(page);

  // Confirm our HMR listener is registered.
  const listenerCount = await page.evaluate(
    () =>
      (
        globalThis as {
          __WAKU_RSC_RELOAD_LISTENERS__?: Array<() => void>;
        }
      ).__WAKU_RSC_RELOAD_LISTENERS__?.length ?? 0,
  );
  expect(listenerCount).toBeGreaterThan(0);

  // Sanity: a same-route revisit doesn't refetch (/ is static after SSR).
  const before = homeRscUrls.length;
  await page.locator('a', { hasText: 'About' }).click();
  await page.locator('a', { hasText: 'Home' }).click();
  await page.waitForTimeout(100);
  expect(homeRscUrls.length).toBe(before);

  // Simulate Waku's dev runtime firing the HMR reload callbacks: cache
  // should be cleared and a new RSC request issued for the current route.
  await page.evaluate(() => {
    for (const fn of (
      globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: Array<() => void> }
    ).__WAKU_RSC_RELOAD_LISTENERS__!)
      fn();
  });
  await page.waitForResponse((res) => res.url().includes('/RSC/R/_root'));
  expect(homeRscUrls.length).toBeGreaterThan(before);
});

test('navigate guard: download links are not intercepted', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '/about';
    a.setAttribute('download', 'about.html');
    a.id = 'dl';
    a.textContent = 'Download';
    document.body.appendChild(a);
    (window as unknown as Record<string, unknown>).__sentinel = 'set';
  });

  // event.downloadRequest is non-null for download-attribute clicks, so the
  // navigate handler must return early instead of intercepting. The proof:
  // a browser-level download is dispatched, the URL stays on /, and our
  // SPA sentinel survives (no full reload either).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#dl').click(),
  ]);
  expect(download.suggestedFilename()).toBe('about.html');
  await expect(page).toHaveURL('/');
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__sentinel,
    ),
  ).toBe('set');
});

test('navigate guard: POST form submissions are not intercepted', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__sentinel = 'set';
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/about';
    form.id = 'test-form';
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.id = 'submit-btn';
    btn.textContent = 'Submit';
    form.appendChild(btn);
    document.body.appendChild(form);
  });

  // event.formData is non-null for POST form submissions, so our guard
  // returns early -- the browser does a full document navigation, which
  // destroys the sentinel we set above.
  await Promise.all([
    page.waitForNavigation(),
    page.locator('#submit-btn').click(),
  ]);
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__sentinel,
    ),
  ).toBeUndefined();
});

test('SSR 404: unknown route returns 404 with the 404 page', async ({
  page,
}) => {
  const response = await page.goto('/nonexistent');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Not Found');
});

test('client-side 404: navigating to an unknown route renders the 404 page', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__sentinel = Date.now();
  });

  await page.evaluate(
    () => window.navigation.navigate('/nonexistent').finished,
  );
  await expect(page).toHaveURL('/nonexistent');
  await expect(page.locator('h1')).toHaveText('Not Found');
  // No full reload.
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__sentinel,
    ),
  ).toBeTruthy();

  // And we can navigate back to a real route.
  await page.locator('a', { hasText: 'Home' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toHaveText('Welcome to the Home Page');
});

test('<Link> object form navigates to a parameterized route', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  // to={{ to: '/user/[id]', params: { id: 'alice' } }} builds /user/alice.
  await page.getByTestId('user-link').click();
  await expect(page).toHaveURL('/user/alice');
  await expect(page.getByTestId('user-heading')).toHaveText('User: alice');
});

test('useRouter().push object form navigates to a parameterized route', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);

  await page.getByTestId('user-push').click();
  await expect(page).toHaveURL('/user/bob');
  await expect(page.getByTestId('user-heading')).toHaveText('User: bob');
});

test('object form URL-encodes param values', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);

  // params: { id: 'a b' } -> buildRouteHref percent-encodes the space into the
  // URL. (waku passes the raw path segment to the page, so it renders encoded.)
  await page.getByTestId('user-push-encoded').click();
  await expect(page).toHaveURL('/user/a%20b');
  await expect(page.getByTestId('user-heading')).toHaveText('User: a%20b');
});

test('useParams_UNSTABLE reads the typed, decoded route params', async ({
  page,
}) => {
  await page.goto('/user/alice');
  await waitForHydration(page);
  await expect(page.getByTestId('user-params-id')).toHaveText(
    'params.id: alice',
  );

  // Unlike the raw page prop, useParams_UNSTABLE decodes the segment: %20 -> ' '.
  await page.goto('/user/a%20b');
  await waitForHydration(page);
  await expect(page.getByTestId('user-params-id')).toHaveText('params.id: a b');
});

test('useSearch_UNSTABLE / useSetSearch_UNSTABLE read and write typed search', async ({
  page,
}) => {
  await page.goto('/search');
  await waitForHydration(page);
  // codec parses an empty query to the default tab.
  await expect(page.getByTestId('search-tab')).toHaveText('tab: home');

  // setSearch serializes via the codec and navigates to the same path.
  await page.getByTestId('set-tab-faq').click();
  await expect(page).toHaveURL('/search?tab=faq');
  await expect(page.getByTestId('search-tab')).toHaveText('tab: faq');

  // The updater form receives the current parsed search.
  await page.getByTestId('set-tab-updater').click();
  await expect(page).toHaveURL('/search?tab=faq-x');
  await expect(page.getByTestId('search-tab')).toHaveText('tab: faq-x');
});
