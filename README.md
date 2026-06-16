# waku-navigation

A drop-in replacement for `waku/router/client` built on the [Navigation API](https://developer.mozilla.org/docs/Web/API/Navigation_API) instead of the History API.

The entire public surface of `waku/router/client` — including every `unstable_*` feature — has a path to the same behavior with `waku-navigation`. This README walks through every feature and shows what the migration looks like.

> **Browser support**: the Navigation API ships in Chromium 102+ and Safari 26 / Firefox 145 (behind/with caveats on some older versions). Check [caniuse](https://caniuse.com/mdn-api_navigation) for current coverage.

## Install

```bash
npm install waku-navigation
```

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

- `examples/01_minimal` — `useRouter`, `<Slice>`, 404, prefetch, scroll option, events, HMR ([StackBlitz](https://stackblitz.com/github/wakujs/waku-navigation/tree/main/examples/01_minimal))
- `examples/02_pending` — `useNavigationStatus_UNSTABLE` pending indicators on plain `<a>` for slow routes, client-suspense settling

---

## API reference

### `<Router>`

```tsx
import { Router } from 'waku-navigation';

<Router />;
```

No props. It reads the initial route from `window.navigation.currentEntry.url` (preferring the route recorded in the RSC payload, so a server-rendered 404 page resolves to `/404`), sets up the navigate-event listener, and renders the page slot. It mirrors the shape Waku's `INTERNAL_ServerRouter` provides during SSR, so server-rendered markup hydrates without a flicker.

### `useRouter()`

Same shape as `waku/router/client`'s `useRouter`:

```tsx
import { useRouter } from 'waku-navigation';

function Nav() {
  const router = useRouter();
  // router.path     -- current pathname (no leading base)
  // router.query    -- query string (no leading '?')
  // router.hash     -- '#section' or ''
  // router.push(to, { scroll? })
  // router.replace(to, { scroll? })
  // router.reload()
  // router.back()
  // router.forward()
  // router.prefetch(to)
  // router.unstable_events.on('start' | 'complete', handler)
  // router.unstable_events.off('start' | 'complete', handler)
}
```

Notes:

- `push`/`replace` return `navigation.navigate(...).finished` (a promise that resolves when the navigation commits or rejects on abort).
- `scroll: false` is forwarded to the navigate event via the Navigation API's `info` channel, which is not persisted in history. The internal handler then intercepts with `scroll: 'manual'` so the browser skips its default after-transition scroll.
- `prefetch(to)` calls `unstable_prefetchRsc` and, if the build publishes a `__WAKU_ROUTER_PREFETCH__` helper, preloads the route's JS chunks via `react-dom`'s `preloadModule`.

### `useNavigationStatus_UNSTABLE({ href?, dataNavKey? })`

There is no `<Link>` — plain `<a>` navigates (the Navigation API intercepts same-origin clicks; see [`<Link>` → plain `<a>`](#link--plain-a)). The one thing a bare `<a>` can't express is per-link _pending_ state, because the indicator needs to bind a DOM anchor to React state. This hook supplies that binding, two ways:

```tsx
'use client';
import { useNavigationStatus_UNSTABLE } from 'waku-navigation';

// (a) by destination href — nothing extra on the <a>:
function NavSpinner({ href }: { href: string }) {
  const { pending } = useNavigationStatus_UNSTABLE({ href });
  return pending ? <span>…</span> : null;
}

// (b) by data-nav-key — distinguishes two same-href anchors:
function IdSpinner({ dataNavKey }: { dataNavKey: string }) {
  const { pending } = useNavigationStatus_UNSTABLE({ dataNavKey });
  return pending ? <span>…</span> : null;
}
```

```tsx
<a href="/slow">Slow <NavSpinner href="/slow" /></a>

<a href="/slow" data-nav-key="slow">Slow <IdSpinner dataNavKey="slow" /></a>
```

`pending` is `true` while a matching navigation is in flight and clears in the same commit that reveals the new route — after the destination's client-side `<Suspense>` boundaries settle, and also on abort or error.

The two match modes:

- **`{ href }`** matches any navigation whose destination is that href — the consumer just names the destination, and the `<a>` needs no attribute. Matching is same-origin and compares path **and query** (not bare pathname), so `{ href: '/search?q=a' }` does not light for `/search?q=b`. The trade-off: it keys off the destination, so every anchor to the same path+query shares it (no per-anchor independence). Think `<label htmlFor>` pointing at a route rather than an element.
- **`{ dataNavKey }`** matches the navigation from the `<a data-nav-key="…">` with that id. This is what keeps two same-href anchors independent — give them different ids. For repeated or list-rendered links, generate the id with `useId()` in the client component that renders the `<a>` and pass it to both sides:

  ```tsx
  'use client';
  function SlowLink() {
    const dataNavKey = useId();
    return (
      <a href="/slow" data-nav-key={dataNavKey}>
        Slow <IdSpinner dataNavKey={dataNavKey} />
      </a>
    );
  }
  ```

Pass both (`{ href, dataNavKey }`) to match either. The consumer can live anywhere — inside the `<a>`, beside it, or in a distant component (e.g. a global loading bar) — since the match is by value, not DOM position. A match that nothing satisfies simply never goes `pending` (the empty-state equivalent of calling upstream's hook outside a `<Link>`).

The counterpart of `waku/router/client`'s `useNavigationStatus_UNSTABLE`. A click matches the clicked anchor (its `data-nav-key` and/or the destination href); programmatic and back-forward navigations (no `sourceElement`) match by destination href, and resolve a `data-nav-key` from the first matching anchor in the DOM. Hash-only navigations complete instantly and never set `pending`.

Internally the hook holds a `useOptimistic` state that the router flips inside the navigation transition; React reverts it automatically when the transition settles, so there's no subscription or cleanup to manage.

### `<Slice>`

```tsx
import { Slice } from 'waku-navigation';

<Slice id="clock" />
<Slice id="banner" lazy fallback={<div>Loading…</div>} />
```

`Slice` is re-exported from `waku/router/client` unchanged. It works because our `<Router>` provides the same `unstable_RouterContext` shape Waku's `<Slice>` expects (the `fetchingSlices` set and `useElementsPromise`).

---

## Migration from `waku/router/client`

### Drop-in: `<Router>` and `useRouter`

```diff
- import { Router, useRouter } from 'waku/router/client';
+ import { Router, useRouter } from 'waku-navigation';
```

`<Router>` takes no props in `waku-navigation` — there is no `initialRoute`, `unstable_fetchRscStore`, or `unstable_routeInterceptor`. The initial route comes from `window.navigation`. If you used `unstable_routeInterceptor` to rewrite a path before refetch, do it in your `useRouter().push` call site instead.

### `<Link>` → plain `<a>`

There is no `<Link>` — drop it and use a plain `<a>`. The Navigation API intercepts same-origin `<a>` clicks for you, and cross-origin links, hash-only links, download links, and modifier-keyed clicks all behave correctly:

```diff
- import { Link } from 'waku/router/client';
- <Link to="/about">About</Link>
+ <a href="/about">About</a>
```

Specific `<Link>` props translate as follows:

| `<Link>` prop                | `waku-navigation` equivalent                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `to="/x"`                    | `<a href="/x">`                                                                                               |
| `scroll={false}`             | Click handler that calls `useRouter().push(href, { scroll: false })`                                          |
| `unstable_pending={node}`    | A consumer using `useNavigationStatus_UNSTABLE({ href })` (or `{ dataNavKey }`) to render `node` when pending |
| `unstable_notPending={node}` | Same, rendering `node` when `!pending`                                                                        |
| `unstable_prefetchOnEnter`   | `onMouseEnter={() => useRouter().prefetch(href)}` in a client component                                       |
| `unstable_prefetchOnView`    | `IntersectionObserver` + `useRouter().prefetch(href)`                                                         |
| `unstable_startTransition`   | Not needed — the router runs every navigation in a transition internally                                      |

Example for prefetch-on-hover:

```tsx
'use client';
import { useRouter } from 'waku-navigation';

export function PrefetchLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  const { prefetch } = useRouter();
  return (
    <a href={to} onMouseEnter={() => prefetch(to)}>
      {children}
    </a>
  );
}
```

### `<Link>…<Consumer/></Link>` (navigation status)

`waku/router` lets any descendant of a `<Link>` read its navigation status via `useNavigationStatus_UNSTABLE`, relying on the `<Link>` for context. With a plain `<a>` there's no context, so the consumer names what it watches — the destination `href` is the simplest, and needs nothing on the `<a>`:

```diff
- import { Link, useNavigationStatus_UNSTABLE } from 'waku/router/client';
+ import { useNavigationStatus_UNSTABLE } from 'waku-navigation';

- function NavSpinner() {
-   const { pending } = useNavigationStatus_UNSTABLE();
+ function NavSpinner({ href }: { href: string }) {
+   const { pending } = useNavigationStatus_UNSTABLE({ href });
    return pending ? <span>…</span> : null;
  }

- <Link to="/slow">Slow <NavSpinner /></Link>
+ <a href="/slow">Slow <NavSpinner href="/slow" /></a>
```

Reach for `{ dataNavKey }` + `data-nav-key` on the `<a>` only when you need two same-href anchors to light up independently.

### `<Slice>`

Same import path change as `useRouter`. All props (`id`, `lazy`, `fallback`, children) are unchanged.

### `ErrorBoundary` → your own

`waku-navigation` does not ship an error boundary; any standard React error boundary works. Place it around `<Router>`:

```tsx
<ErrorBoundary>
  <Router />
</ErrorBoundary>
```

Non-404 refetch failures (network errors, server 5xx) are rethrown during render and bubble to the nearest boundary. 404s are handled internally — the router refetches `/404` and renders that route's tree, so you keep using your `pages/404.tsx` (with `getConfig` returning a `404` http status) the same as before.

### `unstable_events`

Same shape as in `waku/router/client`:

```tsx
const { unstable_events } = useRouter();

useEffect(() => {
  const onStart = (route) => console.log('start', route.path);
  const onComplete = (route) => console.log('complete', route.path);
  unstable_events.on('start', onStart);
  unstable_events.on('complete', onComplete);
  return () => {
    unstable_events.off('start', onStart);
    unstable_events.off('complete', onComplete);
  };
}, [unstable_events]);
```

`'start'` fires before the refetch; `'complete'` fires after `setRoute` inside the transition. Hash-only navigations fire both back-to-back.

### Lower-level `unstable_*` exports

These are unchanged primitives — keep importing them from `waku/router/client` directly:

```ts
import {
  unstable_HAS404_ID,
  unstable_IS_STATIC_ID,
  unstable_ROUTE_ID,
  unstable_SKIP_HEADER,
  unstable_encodeRoutePath,
  unstable_encodeSliceId,
  unstable_getRouteSlotId,
  unstable_getSliceSlotId,
  unstable_getErrorInfo,
  unstable_addBase,
  unstable_removeBase,
  unstable_RouterContext,
  unstable_parseRoute,
} from 'waku/router/client';
```

Internally `waku-navigation` uses these to interop with Waku's RSC store, slot IDs, and error metadata.

---

## What the router does for you

These are all handled inside the navigate-event listener so apps usually don't need to think about them:

- **Same-origin guard** — cross-origin navigations have `canIntercept: false` and are passed through to the browser.
- **Download guard** — `<a download>` clicks (`event.downloadRequest !== null`) are passed through, so the browser issues the download instead of an RSC fetch.
- **Form submission guard** — `<form method="POST">` submissions (`event.formData != null`) are passed through to the server.
- **Hash-only navigations** — not intercepted by default (the browser scrolls to the anchor natively), but state is synced so `useRouter().hash` reflects the new fragment. If `useRouter().push('#x', { scroll: false })` is used, the handler intercepts with `scroll: 'manual'` to honor that.
- **Abort during transition** — `event.signal` is checked between async steps so a fast-clicked second navigation cleanly cancels the first without committing stale state.
- **404 on the client** — a refetch that throws with `getErrorInfo(err)?.status === 404` is handled by refetching `/404` and pointing the slot there, mirroring Waku's behavior. The URL still reflects the user's request.
- **Static route cache** — routes with `getConfig({ render: 'static' })` are added to a `staticPathSet` after their first fetch; revisits skip the refetch entirely (the RSC payload is already in Waku's store).
- **`X-Waku-Router-Skip` header** — every refetch sends the etags of elements we already have (harvested from the RSC payload's `ETAG:`-prefixed entries) so the server can skip re-rendering shared layouts/slices whose etag still matches.
- **HMR cache invalidation** — when Waku's dev runtime fires `globalThis.__WAKU_RSC_RELOAD_LISTENERS__` (Vite HMR update), the router clears `staticPathSet` and `cachedEtags` and refetches the current route. Guarded by `import.meta.hot` so it's stripped in production.

---

## Caveats / not yet implemented

- No `<Link>` component — navigation is just plain `<a>`. Pending status is opt-in via `useNavigationStatus_UNSTABLE({ href })` (by destination) or `{ dataNavKey }` (by `data-nav-key`, for same-href independence). The `<Link>` niceties (`scroll`, `unstable_prefetchOnEnter`/`OnView`) compose from `useRouter().push(href, { scroll })` / `useRouter().prefetch(href)`.
- `unstable_routeInterceptor` (server-side route rewrite hook) is not supported.
- `unstable_fetchRscStore` (custom RSC store) is not exposed on `<Router>`.
- Requires a browser with the Navigation API. There is currently no fallback for older browsers.
