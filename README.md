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
- `examples/02_pending` — `<Pending>` for slow routes, `unstable_useNavigationStatus`, client-suspense settling

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

### `<Pending>`

```tsx
import { Pending } from 'waku-navigation';

<Pending fallback={<Spinner />}>
  <a href="/slow">Go slow</a>
</Pending>;
```

`<Pending>` wraps an `<a>` and shows `fallback` while a navigation to that `<a>`'s href is in flight. Each `<Pending>` gets a unique id (via `useId`) that's stamped on the wrapped `<a>`; the router reads `event.sourceElement` to know which Pending fired so two Pendings pointing at the same href stay independent.

For navigations that have no `sourceElement` — `useRouter().push('/slow')`, `navigation.navigate(...)`, browser back/forward — the router falls back to the first `<Pending>` whose wrapped `<a>`'s href resolves to the destination path. So a Pending around a `<a href="/slow">` lights up for `useRouter().push('/slow')` too.

`<Pending>` only shows its fallback for the actual route change; React's transition keeps the previous page visible until the new tree (including any client-side `<Suspense>` boundaries) is ready to commit.

### `unstable_useNavigationStatus()`

```tsx
'use client';
import { unstable_useNavigationStatus } from 'waku-navigation';

function MenuItem() {
  const { pending, ref } = unstable_useNavigationStatus<HTMLAnchorElement>();
  return (
    <a href="/slow" ref={ref}>
      Slow {pending ? '…' : ''}
    </a>
  );
}
```

The counterpart of `waku/router/client`'s `useNavigationStatus_UNSTABLE`: a `useFormStatus`-style hook that reports whether a navigation initiated by the enclosing `<a>` is in flight. `pending` turns `true` the moment the navigation starts and clears in the same commit that reveals the new route — after the destination's client-side `<Suspense>` boundaries settle, and also on abort or error.

One difference from upstream: with no `<Link>` to provide context, a hook cannot locate its own DOM position, so it returns a `ref` — attach it to any element the component renders (the `<a>` itself or any descendant) and the router resolves the enclosing `<a>` via `closest('a')` at navigation time. Without an attached ref, an enclosing `<a>`, or a surrounding `<Router>`, `pending` stays `undefined`.

Matching follows the same rules as `<Pending>`: clicks match by anchor identity (`event.sourceElement`), so two `<a>`s with the same href stay independent; programmatic and back/forward navigations (which have no source element) match the anchor's href against the destination path. Hash-only navigations complete instantly and never set `pending`.

Internally each hook holds a `useOptimistic` state that the router flips to pending inside the navigation transition, so React renders the indicator urgently and reverts it automatically when the transition settles — there is no subscription or cleanup to manage.

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

```diff
- import { Link } from 'waku/router/client';
- <Link to="/about">About</Link>
+ <a href="/about">About</a>
```

The Navigation API intercepts same-origin `<a>` clicks for you. Cross-origin links, hash-only links, download links, and modifier-keyed clicks all behave correctly without `<Link>`. Specific `<Link>` props translate as follows:

| `<Link>` prop                | `<a>` / `waku-navigation` equivalent                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| `to="/x"`                    | `href="/x"`                                                             |
| `scroll={false}`             | Click handler that calls `useRouter().push(href, { scroll: false })`    |
| `unstable_pending={node}`    | Wrap the `<a>` in `<Pending fallback={node}>`                           |
| `unstable_notPending={node}` | `unstable_useNavigationStatus()` — render `node` when `!pending`        |
| `unstable_prefetchOnEnter`   | `onMouseEnter={() => useRouter().prefetch(href)}` in a client component |
| `unstable_prefetchOnView`    | `IntersectionObserver` + `useRouter().prefetch(href)`                   |
| `unstable_startTransition`   | Not needed — the router uses `useTransition` internally                 |

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

- `<Link>` is not provided. Plain `<a>` covers the same default behavior; the `unstable_*` Link niceties (`unstable_notPending` via `unstable_useNavigationStatus`, custom `unstable_startTransition`) need a small client component if you want them.
- `unstable_routeInterceptor` (server-side route rewrite hook) is not supported.
- `unstable_fetchRscStore` (custom RSC store) is not exposed on `<Router>`.
- Requires a browser with the Navigation API. There is currently no fallback for older browsers.
