# waku-navigation

A client router built on the [Navigation API](https://developer.mozilla.org/docs/Web/API/Navigation_API) and Waku's router core (`waku/router/client-core`).

It provides navigation, prefetching, typed params and search, lazy slices, and per-link pending status. See the caveats below for differences from Waku's built-in router.

Because the Navigation API intercepts plain `<a>` clicks, **every `<a>` already navigates client-side — no `<Link>` required.** `<Link>` is still here, as an _enhancement_: it adds a type-safe `to`, prefetching, and per-link navigation status. Reach for `<Link>` when you want those; use a plain `<a>` when you don't.

> **Browser support**: the Navigation API ships in Chromium 102+ and Safari 26 / Firefox 145 (behind/with caveats on some older versions). Check [caniuse](https://caniuse.com/mdn-api_navigation) for current coverage.

## Install

```bash
npm install waku-navigation
```

Requires Waku 1.0.0-rc.4 or later and its React 19.3.1 peers.

## Quick start

Create `./src/waku.client.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku-navigation';

const rootElement = (
  <StrictMode>
    <Router />
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document).render(rootElement);
}
```

Pages and `pages/_slices/*` work exactly as in any Waku app — `waku-navigation` only replaces the client-side router.

## Examples

- `examples/01_minimal` — `useRouter`, `<Slice>`, 404, prefetch, scroll option, typed params & search, HMR ([StackBlitz](https://stackblitz.com/github/wakujs/waku-navigation/tree/main/examples/01_minimal))
- `examples/02_pending` — `<Link>` with per-link `useNavigationStatus_UNSTABLE` pending indicators, two same-route links staying independent on click, and a non-navigation transition that leans on the browser's native spinner

---

## API reference

### `<Router>`

```tsx
import { Router } from 'waku-navigation';

<Router />;
```

No props. It reads the initial route from `window.navigation.currentEntry.url` (preferring the route recorded in the RSC payload, so a server-rendered 404 page resolves to `/404`), sets up the navigate-event listener, and renders the page slot. It provides the same `RouterHost` (from `waku/router/client-core`) that Waku's `INTERNAL_ServerRouter` provides during SSR, so server-rendered markup hydrates without a flicker.

### `useRouter()`

Same shape as `waku/router/client`'s `useRouter`:

```tsx
import { useRouter } from 'waku-navigation';

function Nav() {
  const router = useRouter();
  // router.path     -- current pathname (no leading base)
  // router.query    -- query string (no leading '?')
  // router.hash     -- '#section' or ''
  // router.push(to, { scroll? })       -- to: href string or constructed href
  // router.replace(to, { scroll? })    -- to: href string or constructed href
  // router.reload()
  // router.back()
  // router.forward()
  // router.prefetch(to)                -- to: href string or constructed href
}
```

Notes:

- `push` / `replace` / `prefetch` accept the same type-safe hrefs as Waku's built-in router. Construct parameterized routes with `unstable_createRouteHref`:

  ```tsx
  import { unstable_createRouteHref as createRouteHref } from 'waku/router';

  const userRoute = createRouteHref({ path: '/user/[id]' });

  push('/about');
  push(userRoute({ params: { id: 'alice' } }));
  ```

- `push`/`replace` resolve when the navigation commits (and reject on abort).
- `scroll: false` is forwarded to the navigate event via the Navigation API's `info` channel, which is not persisted in history. The internal handler then intercepts with `scroll: 'manual'` so the browser skips its default after-transition scroll.
- `prefetch(to)` warms Waku's router cache (`useRouterCache_UNSTABLE`), skipping a static route that is already loaded, and, if the build publishes a `__WAKU_ROUTER_PREFETCH__` helper, preloads the route's JS chunks via `react-dom`'s `preloadModule`.

### `<Link>`

A plain `<a>` already navigates client-side, so `<Link>` is an _enhancement_, not a requirement. It adds the three things a bare `<a>` can't express:

- a **type-safe `to`** — checked against your generated routes, like `waku/router`'s `<Link>`;
- **prefetching** — `unstable_prefetchOnEnter` / `unstable_prefetchOnView`;
- **navigation status** — readable by any descendant via `useNavigationStatus_UNSTABLE()`.

```tsx
import { Link } from 'waku-navigation';
import { unstable_createRouteHref as createRouteHref } from 'waku/router';

const userRoute = createRouteHref({ path: '/user/[id]' });

<Link to="/slow">
  Slow <NavSpinner />
</Link>;

<Link to={userRoute({ params: { id: 'alice' } })}>User alice</Link>;
```

```ts
import type { LinkProps as WakuLinkProps } from 'waku/router/client';

export type LinkProps = {
  to: WakuLinkProps['to'];
  scroll?: boolean; // false keeps scroll position; otherwise browser default
  unstable_prefetchOnEnter?: boolean; // prefetch on pointer enter
  unstable_prefetchOnView?: boolean; // prefetch when scrolled into view
  ref?: Ref<HTMLAnchorElement>;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;
```

`<Link>` does not intercept the click itself — the browser fires the navigate event and the router correlates it back to this instance. So modifier-clicks, `target`, `download`, and cross-origin `to` all keep their native behavior (use a plain `<a>` for those anyway). It accepts native anchor attributes alongside the routing props above.

To animate navigations with the View Transitions API, wrap the part of the tree you want animated in React's `<ViewTransition>`. The router commits every navigation inside a transition, so React drives the animation — no router prop needed, as in `waku/router`.

### `useNavigationStatus_UNSTABLE()`

Returns the navigation status of the enclosing `<Link>`, like React's `useFormStatus`. No arguments — it reads the `<Link>` by context.

```tsx
'use client';
import { useNavigationStatus_UNSTABLE } from 'waku-navigation';

function NavSpinner() {
  const { pending } = useNavigationStatus_UNSTABLE();
  return pending ? <span>…</span> : null;
}
```

```tsx
<Link to="/slow">
  Slow <NavSpinner />
</Link>
```

`pending` is `true` while the link's navigation is in flight and clears in the same commit that reveals the new route — after the destination's client-side `<Suspense>` boundaries settle, and also on abort or error. Two `<Link>`s to the same route stay **independent on click** (the router correlates the clicked one by its own element); programmatic and back/forward navigations have no source element, so every `<Link>` to the destination lights up together. Outside a `<Link>`, the hook returns `{}`.

Internally each `<Link>` holds a `useOptimistic` state that the router flips inside the navigation transition; React reverts it automatically when the transition settles, so there's no subscription or cleanup to manage.

> **You often don't need a custom spinner at all.** React already drives the browser's native spinner for transitions — during a navigation the Navigation API holds the request pending until the new route commits, and for non-navigation transitions React (≥19.2) fires a fake navigation via `onDefaultTransitionIndicator` to spin that same native indicator. Reach for `useNavigationStatus_UNSTABLE` when you want an _in-page_, per-link indicator on top of the browser-level one. `examples/02_pending` includes a transition (the home page's "Load batch" button) that relies on the native spinner alone.

### Typed params & search

These are Waku's own typed hooks from `waku/router/client-core`, re-exported; they read the route through the `RouterHost` that `<Router>` provides. `useParams_UNSTABLE` reads the current route's path params (decoded), typed from the `from` route:

```tsx
'use client';
import { useParams_UNSTABLE } from 'waku-navigation';

function UserId() {
  const params = useParams_UNSTABLE({ from: '/user/[id]' });
  return <span>{params?.id}</span>; // null when the path doesn't match `from`
}
```

`useSearch_UNSTABLE` / `useSetSearch_UNSTABLE` read and write typed query params through a local route descriptor. Bind the route pattern and search codec in a shared module:

```tsx
import { unstable_createRouteHref as createRouteHref } from 'waku/router';
import { tabCodec } from './search-codecs.js';

export const searchRoute = createRouteHref({
  path: '/search',
  search: tabCodec,
});
```

Pass that descriptor to the client hooks:

```tsx
'use client';
import { useSearch_UNSTABLE, useSetSearch_UNSTABLE } from 'waku-navigation';
import { searchRoute } from '../routes.js';

function Tabs() {
  const search = useSearch_UNSTABLE(searchRoute);
  const setSearch = useSetSearch_UNSTABLE(searchRoute);
  return (
    <button onClick={() => setSearch({ tab: 'faq' })}>{search?.tab}</button>
  );
}
```

Declare `unstable_searchCodec: searchRoute.searchCodec` in the page's `getConfig` to validate incoming server queries. Codecs implement `parse` and `serialize`; they have no `id` field. `setSearch` accepts a partial or an updater of the current search and navigates with push by default, or `{ history: 'replace' }`. It keeps the scroll position unless `{ scroll: true }` is supplied. For a different path, reading returns `null` and setting is a no-op. See `examples/01_minimal` for a complete example.

### `<Slice>`

```tsx
import { Slice } from 'waku-navigation';

<Slice id="clock" />
<Slice id="banner" lazy fallback={<div>Loading…</div>} />
```

`Slice` is Waku's own (`Slice_UNSTABLE` from `waku/router/client-core`), re-exported unchanged. It fetches lazy slices through the enclosing root's router cache, so it needs nothing router-specific.

---

## Migration from 0.0.6

Upgrade Waku to 1.0.0-rc.4 and React, React DOM, and React Server DOM Webpack to 19.3.1. Replace object destinations with hrefs constructed by `unstable_createRouteHref`. Pass local route descriptors to the search hooks, and remove `SearchCodecsProvider_UNSTABLE` or its deprecated `Unstable_SearchCodecsProvider` alias. Both exports have been removed with Waku's codec registry.

## Migration from `waku/router/client`

### `<Router>` and `useRouter`

```diff
- import { Router, useRouter } from 'waku/router/client';
+ import { Router, useRouter } from 'waku-navigation';
```

`<Router>` takes no props in `waku-navigation` — there is no `initialRoute` or `unstable_routeInterceptor`. The initial route comes from `window.navigation`.

### `<Link>` or plain `<a>`

`<Link>` accepts `to` as an href string or constructed href, `scroll`, boolean `unstable_prefetchOnEnter` / `unstable_prefetchOnView` triggers, `ref`, and native anchor attributes:

```diff
- import { Link } from 'waku/router/client';
+ import { Link } from 'waku-navigation';
  <Link to="/about">About</Link>
```

Waku's prefetch option objects and `unstable_instant` navigation aren't supported. Use boolean prefetch triggers; `unstable_instant` is absent from `<Link>` and `useRouter().push`/`replace` options.

Or drop `<Link>` entirely where you don't need type-safety, prefetching, or status — a plain `<a>` navigates client-side on its own:

```diff
- <Link to="/about">About</Link>
+ <a href="/about">About</a>
```

Cross-origin links, hash-only links, download links, and modifier-keyed clicks all behave correctly with a plain `<a>` — the Navigation API passes them through.

### `<Link>…<Consumer/></Link>` (navigation status)

Unchanged — a descendant reads the enclosing `<Link>`'s status via the no-arg hook, exactly as in `waku/router`:

```diff
- import { Link, useNavigationStatus_UNSTABLE } from 'waku/router/client';
+ import { Link, useNavigationStatus_UNSTABLE } from 'waku-navigation';

  function NavSpinner() {
    const { pending } = useNavigationStatus_UNSTABLE();
    return pending ? <span>…</span> : null;
  }

  <Link to="/slow">Slow <NavSpinner /></Link>
```

### `<Slice>`

Same import path change as `useRouter`. All props (`id`, `lazy`, `fallback`, children) are unchanged.

### Typed params & search (drop-in)

`useParams_UNSTABLE`, `useSearch_UNSTABLE`, and `useSetSearch_UNSTABLE` are the same import-path swap — they are the same functions `waku/router/client` exports:

```diff
- import { useParams_UNSTABLE, useSearch_UNSTABLE } from 'waku/router/client';
+ import { useParams_UNSTABLE, useSearch_UNSTABLE } from 'waku-navigation';
```

### `ErrorBoundary` → your own

`waku-navigation` does not ship an error boundary; any standard React error boundary works, including Waku's `ErrorBoundary_UNSTABLE` from `waku/router/client-core` (the `ErrorBoundary` that `waku/router/client` exports). Place it around `<Router>`:

```tsx
<ErrorBoundary>
  <Router />
</ErrorBoundary>
```

Non-404 refetch failures (network errors, server 5xx) are rethrown during render and bubble to the nearest boundary. 404s are handled internally — the router renders the `/404` route's tree, so you keep using your `pages/404.tsx` (with `getConfig` returning a `404` http status) the same as before.

### Lower-level `unstable_*` exports

Import low-level helpers from `waku/router/client-core` and `waku/minimal/client`:

```ts
import {
  unstable_HAS404_ID,
  unstable_IS_STATIC_ID,
  unstable_ROUTE_ID,
  unstable_encodeRoutePath,
  unstable_encodeSliceId,
  unstable_getRouteSlotId,
  unstable_getSliceSlotId,
  unstable_parseRoute,
} from 'waku/router/client-core';
import { unstable_getErrorInfo } from 'waku/minimal/client';
```

`unstable_RouterContext` is private to Waku's History API router, and `waku-navigation` doesn't provide it. Read the current route with `useRouter()`, or with `useRouterHost_UNSTABLE` from `waku/router/client-core`.

Internally `waku-navigation` builds on `waku/router/client-core` (`unstable_load`, `useRouterCache_UNSTABLE`, `RouterHostContext_UNSTABLE`, …) to interop with Waku's RSC store, slot IDs, and error metadata.

---

## What the router does for you

These are all handled inside the navigate-event listener so apps usually don't need to think about them:

- **Same-origin guard** — cross-origin navigations have `canIntercept: false` and are passed through to the browser.
- **Download guard** — `<a download>` clicks (`event.downloadRequest !== null`) are passed through, so the browser issues the download instead of an RSC fetch.
- **Form submission guard** — `<form method="POST">` submissions (`event.formData != null`) are passed through to the server.
- **Hash-only navigations** — not intercepted by default (the browser scrolls to the anchor natively), but state is synced so `useRouter().hash` reflects the new fragment. If `useRouter().push('#x', { scroll: false })` is used, the handler intercepts with `scroll: 'manual'` to honor that.
- **Abort during transition** — `event.signal` is passed to the fetch, so a fast-clicked second navigation cleanly cancels the first without committing stale state.
- **React's default transition indicator** — React (≥19.2) fires a fake same-URL navigation tagged `info: 'react-transition'` for every transition, intercepting it to show the browser's native spinner. The router skips these (they aren't route changes), so an unrelated `useTransition` anywhere in your app never triggers a refetch.
- **404 on the client** — Waku answers a missing route with your `/404` page, and the router renders the route the response names (`ROUTE_ID`), so the slot points at `/404` while the URL still reflects the user's request. A fetch that fails with a 404 is followed to `/404` by Waku's `unstable_load`, and a redirect off the app replaces the document.
- **Static route cache** — routes with `getConfig({ render: 'static' })` are recorded in Waku's router cache (`useRouterCache_UNSTABLE`) after their first fetch; revisits skip the refetch entirely (the RSC payload is already in Waku's store).
- **`X-Waku-Etags` header** — every refetch sends the etags of elements already in the store so the server can skip re-rendering shared layouts/slices whose etag still matches. Waku's `unstable_load` fetches with the current elements as its base and sets the header itself, so the router gets this for free.
- **HMR cache invalidation** — on a Vite RSC update, Waku's `useHmrRefetch_UNSTABLE` clears the router cache and refetches the current route (not the route the page first loaded). Dev only.

---

## Caveats / not yet implemented

- `<Link>` is an enhancement over plain `<a>`, not a requirement: a plain `<a>` navigates client-side on its own; `<Link>` adds a type-safe `to`, prefetching, and per-link navigation status via `useNavigationStatus_UNSTABLE()`.
- `unstable_routeInterceptor` (Waku's hook for rewriting back/forward navigations) is not supported.
- A redirect thrown while a page renders (`unstable_redirect` in a page component) is not followed; it reaches the nearest error boundary.
- `unstable_rerenderRoute()` without arguments in a server action throws, because it needs the action-origin header that Waku's History API router sends. Pass the path explicitly: `unstable_rerenderRoute('/path')`. See [wakujs/waku#2306](https://github.com/wakujs/waku/issues/2306).
- Requires a browser with the Navigation API. There is currently no fallback for older browsers.

## Testing

```sh
pnpm compile
pnpm test
pnpm e2e
E2E_MODE=production pnpm e2e
```
