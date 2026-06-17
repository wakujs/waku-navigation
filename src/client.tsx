/// <reference types="dom-navigation" />

'use client';

import {
  createContext,
  startTransition,
  use,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from 'react';
import { preloadModule } from 'react-dom';
import {
  Root,
  Slot,
  unstable_prefetchRsc as prefetchRsc,
  unstable_withEnhanceFetchFn as withEnhanceFetchFn,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useRefetch,
} from 'waku/minimal/client';
import {
  Slice,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getErrorInfo as getErrorInfo,
  unstable_parseRoute as parseRoute,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_IS_STATIC_ID as IS_STATIC_ID,
  unstable_ROUTE_ID as ROUTE_ID,
  unstable_RouterContext as RouterContext,
  unstable_SKIP_HEADER as SKIP_HEADER,
} from 'waku/router/client';

// Slice is re-exported from waku/router/client unchanged. It only needs the
// router context (fetchingSlices + the elements promise) -- both of which our
// <Router> already provides -- so the component works as-is.
export { Slice };

type Elements = Record<string, unknown>;
type Route = { path: string; query: string; hash: string };

const NOT_FOUND_PATH = '/404';
// Authored by the app on a plain <a> to correlate it with a navigation-status
// consumer, the way <label htmlFor> correlates with <input id>. The router
// reads it off the clicked <a> (or, for programmatic navs, off the matching
// <a> in the DOM) to know which consumers to mark pending.
const NAV_KEY_ATTR = 'data-nav-key';
// Mirrors ETAG_ID_PREFIX in waku's router/common.js, which is not exported
// from waku/router/client. Elements under this prefix carry the etag for the
// same-named slot; the X-Waku-Router-Skip header echoes them back so the
// server can skip re-rendering unchanged slots.
const ETAG_ID_PREFIX = 'ETAG:';

// Navigation-status registry. Each useNavigationStatus_UNSTABLE(match) call
// registers its useOptimistic setter under a unique instance id, tagged with
// the match it cares about -- a destination `href`, a `dataNavKey` (matching an
// <a data-nav-key>), or both. On navigate, the router flips every matching
// entry to pending; React reverts it when the transition commits (after
// client-side Suspense), aborts, or errors. Several consumers may share a
// match -- all of them light up together.
type NavigationStatus = { pending?: boolean };
// At least one matcher is required -- {} would silently never go pending.
type NavStatusMatch =
  | { href: string; dataNavKey?: string }
  | { href?: string; dataNavKey: string };
type NavStatusEntry = {
  href?: string | undefined;
  dataNavKey?: string | undefined;
  setOptimisticStatus: (status: NavigationStatus) => void;
};
type RegisterFn = (id: string, entry: NavStatusEntry) => () => void;

const noopRegister: RegisterFn = () => () => {};
const NavStatusRegistryContext = createContext<{ register: RegisterFn }>({
  register: noopRegister,
});

// We piggyback on Waku's RouterContext (imported above from
// waku/router/client as unstable_RouterContext) for the route state. The
// server-side `INTERNAL_ServerRouter` that Waku's define-router runs during
// SSR already populates this context with the real route, so our useRouter
// reads correct values during SSR -- no hydration mismatch, no flicker. On
// the client our `<Router>` provides the same context shape below.
//
// Mirrors the shape of waku/router/client's useRouter() so apps migrating
// across can swap the import path. push/replace/reload/back/forward are thin
// wrappers over window.navigation; route info and prefetch come from context.
//
// The `scroll` option on push/replace is forwarded to the navigate event via
// the Navigation API's `info` channel (not persisted in history). When
// scroll: false, the navigate handler intercepts with scroll: 'manual' and
// skips event.scroll(); otherwise the browser's default after-transition
// scroll behavior applies.
//
// `unstable_events` exposes start/complete subscriptions for route changes;
// see InnerRouter for emission points.
type PushReplaceOptions = { scroll?: boolean };
type RouteChangeEvents = {
  on: (name: 'start' | 'complete', handler: (route: Route) => void) => void;
  off: (name: 'start' | 'complete', handler: (route: Route) => void) => void;
};
const noopEvents: RouteChangeEvents = { on: () => {}, off: () => {} };
export function useRouter() {
  const ctx = useContext(RouterContext);
  const route: Route = ctx?.route ?? { path: '/', query: '', hash: '' };
  return {
    path: route.path,
    query: route.query,
    hash: route.hash,
    push: (to: string, options?: PushReplaceOptions) =>
      window.navigation.navigate(to, {
        history: 'push',
        info: { scroll: options?.scroll },
      }).finished,
    replace: (to: string, options?: PushReplaceOptions) =>
      window.navigation.navigate(to, {
        history: 'replace',
        info: { scroll: options?.scroll },
      }).finished,
    reload: () => window.navigation.reload().finished,
    back: () => {
      window.navigation.back();
    },
    forward: () => {
      window.navigation.forward();
    },
    prefetch: (to: string) => {
      ctx?.prefetchRoute(parseRoute(new URL(to, window.location.href)));
    },
    unstable_events: (ctx?.routeChangeEvents ??
      noopEvents) as RouteChangeEvents,
  };
}

// Counterpart of waku/router/client's useNavigationStatus_UNSTABLE, adapted
// for plain <a>. Two ways to say which navigation you care about:
//
//   { href: '/slow' }   -- any navigation whose destination is /slow. Nothing
//                          extra on the <a>; matches by destination, so every
//                          anchor to /slow shares it (no independence).
//   { dataNavKey: 'x' }  -- the navigation from <a data-nav-key="x">. Tells two
//                          same-href anchors apart (give them different ids;
//                          useId() for list-rendered ones).
//
// Pass both to match either. The consumer can live anywhere -- inside the <a>,
// beside it, or far away. Returns { pending: undefined } until a matching
// navigation is in flight; pending clears when the new route commits (after
// client-side Suspense), or on abort/error.
function useNavigationStatus({
  href,
  dataNavKey,
}: NavStatusMatch): NavigationStatus {
  const [status, setOptimisticStatus] = useOptimistic<NavigationStatus>({});
  const { register } = useContext(NavStatusRegistryContext);
  const id = useId();
  useLayoutEffect(
    () => register(id, { href, dataNavKey, setOptimisticStatus }),
    [id, href, dataNavKey, register, setOptimisticStatus],
  );
  return status;
}
export { useNavigationStatus as useNavigationStatus_UNSTABLE };

// True when `href` (possibly relative) resolves to the same internal route as
// `route`. Compared on origin + path + query -- not just pathname -- so
// /search?q=a doesn't match /search?q=b, and a cross-origin href that happens
// to share a path doesn't match an internal navigation. The fragment is
// ignored (hash-only navigations never set pending). Malformed input returns
// false rather than throwing, so a bad consumer href or odd DOM anchor can't
// break the navigation handler.
const routeMatchesHref = (href: string, route: Route): boolean => {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  const parsed = parseRoute(url);
  return parsed.path === route.path && parsed.query === route.query;
};

function InnerRouter({ fallbackRoute }: { fallbackRoute: Route }) {
  const refetch = useRefetch();
  const elementsPromise = useElementsPromise();
  const [routeState, setRoute] = useState<Route>();
  let route = routeState;
  if (route === undefined) {
    // First render only: the RSC payload records which route the server
    // actually rendered (ROUTE_ID), so an unknown URL that was served the
    // /404 page resolves to '/404' here. Suspending on `use` is free at this
    // point -- the slots below suspend on the same promise during hydration
    // -- but it must not happen on later renders: suspending InnerRouter
    // inside the navigation transition keeps the navigation from ever
    // committing. The hash starts as '' to match Waku's INTERNAL_ServerRouter
    // SSR output (URL fragments aren't sent to the server) and is upgraded
    // post-hydration in the effect below.
    const elements = use(elementsPromise) as Elements;
    const routeData = elements[ROUTE_ID] as
      | [path: string, query: string]
      | undefined;
    route =
      routeData && routeData[0] !== fallbackRoute.path
        ? { path: routeData[0], query: routeData[1], hash: '' }
        : { ...fallbackRoute, hash: '' };
    setRoute(route);
  }
  // Non-404 refetch failures (network errors, server 500s, etc.) get surfaced
  // by rethrowing during render so the user's <ErrorBoundary> can catch them.
  // The state clears on the next successful navigation.
  const [renderError, setRenderError] = useState<unknown>(null);
  if (renderError) throw renderError;
  useEffect(() => {
    if (fallbackRoute.hash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoute((r) => ({ ...(r as Route), hash: fallbackRoute.hash }));
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const registryRef = useRef(new Map<string, NavStatusEntry>());
  const staticPathSetRef = useRef(new Set<string>());
  const cachedEtagsRef = useRef<Record<string, string>>({});
  // Stable Set so Waku's <Slice> can mutate it (add on fetch start, delete on
  // fetch end) without losing state across re-renders. useMemo with [] keeps
  // the same instance and avoids reading ref.current during render.
  const fetchingSlices = useMemo(() => new Set<string>(), []);
  useEffect(() => {
    elementsPromise.then(
      (elements: Elements) => {
        const routeData = elements[ROUTE_ID] as
          | [path: string, query: string]
          | undefined;
        if (routeData && elements[IS_STATIC_ID]) {
          staticPathSetRef.current.add(routeData[0]);
        }
        const etags: Record<string, string> = {};
        for (const [key, value] of Object.entries(elements)) {
          // Drop empty (clear signal) and non-Latin1 (breaks fetch) tags.
          if (
            key.startsWith(ETAG_ID_PREFIX) &&
            typeof value === 'string' &&
            /^[\u0020-\u00ff]+$/.test(value)
          ) {
            etags[key.slice(ETAG_ID_PREFIX.length)] = value;
          }
        }
        cachedEtagsRef.current = etags;
      },
      () => {},
    );
  }, [elementsPromise]);
  const register = useCallback<RegisterFn>((id, entry) => {
    registryRef.current.set(id, entry);
    return () => {
      registryRef.current.delete(id);
    };
  }, []);
  // Adds the X-Waku-Router-Skip header mapping element ids to the etags we
  // already hold, so the server can skip re-rendering elements whose etag
  // still matches. Shared by navigate + prefetch.
  const enhanceFetchWithSkip = useMemo(
    () =>
      withEnhanceFetchFn((fetchFn) => (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set(SKIP_HEADER, JSON.stringify(cachedEtagsRef.current));
        return fetchFn(input, { ...init, headers });
      }),
    [],
  );
  // Waku's prefetch cache keys the URLSearchParams by identity, so a fresh
  // `new URLSearchParams(...)` on every call would invalidate the prefetch
  // entry. We memoize by query string so the same params object is reused.
  const rscParamsByQueryRef = useRef(new Map<string, URLSearchParams>());
  const getRscParams = useCallback((query: string) => {
    let params = rscParamsByQueryRef.current.get(query);
    if (!params) {
      params = new URLSearchParams({ query });
      rscParamsByQueryRef.current.set(query, params);
    }
    return params;
  }, []);
  // Subscribers for route-change events. Stable on/off pair so consumers can
  // re-register without invalidating set entries. The router emits 'start'
  // before refetching and 'complete' after applying the new route.
  type RouteEventName = 'start' | 'complete';
  type RouteEventListener = (route: Route) => void;
  const routeChangeListeners = useMemo(
    () => ({
      start: new Set<RouteEventListener>(),
      complete: new Set<RouteEventListener>(),
    }),
    [],
  );
  const emitRouteEvent = useCallback(
    (name: RouteEventName, r: Route) => {
      for (const listener of routeChangeListeners[name]) listener(r);
    },
    [routeChangeListeners],
  );
  const routeChangeEvents = useMemo(
    () => ({
      on: (name: RouteEventName, handler: RouteEventListener) => {
        routeChangeListeners[name].add(handler);
      },
      off: (name: RouteEventName, handler: RouteEventListener) => {
        routeChangeListeners[name].delete(handler);
      },
    }),
    [routeChangeListeners],
  );
  // Eagerly fetch the RSC for a route (used by useRouter().prefetch). Build
  // output may also publish a __WAKU_ROUTER_PREFETCH__ helper that returns the
  // JS chunk ids for a path; if present, we preload them too.
  const prefetchRoute = useCallback(
    (next: Route) => {
      if (staticPathSetRef.current.has(next.path)) return;
      prefetchRsc(
        encodeRoutePath(next.path),
        getRscParams(next.query),
        enhanceFetchWithSkip,
      );
      (
        globalThis as {
          __WAKU_ROUTER_PREFETCH__?: (
            path: string,
            preload: (id: string) => void,
          ) => void;
        }
      ).__WAKU_ROUTER_PREFETCH__?.(next.path, (id) =>
        preloadModule(id, { as: 'script' }),
      );
    },
    [enhanceFetchWithSkip, getRscParams],
  );
  // Vite HMR: when a server file changes, Waku's dev runtime invokes any
  // callbacks in __WAKU_RSC_RELOAD_LISTENERS__. We register one that drops
  // our path/id caches (so a "static" route picks up the new content) and
  // refetches the current route. In production import.meta.hot is undefined
  // and the effect body returns early.
  useEffect(() => {
    if (!(import.meta as { hot?: unknown }).hot) return;
    const refetchRoute = () => {
      staticPathSetRef.current.clear();
      cachedEtagsRef.current = {};
      refetch(encodeRoutePath(route.path), getRscParams(route.query));
    };
    const listeners = ((
      globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: Array<() => void> }
    ).__WAKU_RSC_RELOAD_LISTENERS__ ||= []);
    listeners.unshift(refetchRoute);
    return () => {
      const i = listeners.indexOf(refetchRoute);
      if (i !== -1) listeners.splice(i, 1);
    };
  }, [route, refetch, getRscParams]);
  useEffect(() => {
    const callback = (event: NavigateEvent) => {
      if (!event.canIntercept) return;
      if (event.downloadRequest !== null || event.formData) return;
      // React >=19.2's default transition indicator fires fake navigations.
      if (event.info === 'react-transition') return;
      const nextRoute = parseRoute(new URL(event.destination.url));
      // useRouter().push/replace forward { scroll } via `info`. The Navigation
      // API itself doesn't persist `info` in history, so it only applies to
      // this single navigation -- exactly what we want.
      const info = event.info as { scroll?: boolean } | undefined;
      const suppressScroll = info?.scroll === false;
      // Hash-only navigations: by default we don't intercept (the browser
      // handles URL + scroll natively), but if the caller explicitly asked
      // to suppress scrolling we still need to intercept so we can pass
      // scroll: 'manual' and skip the browser's anchor scroll.
      if (event.hashChange) {
        // Hash-only navigations don't refetch, so 'start' and 'complete'
        // both fire effectively together; emit both so subscribers don't
        // have to special-case them.
        emitRouteEvent('start', nextRoute);
        if (suppressScroll) {
          event.intercept({
            scroll: 'manual',
            handler: async () => {
              setRoute(nextRoute);
              emitRouteEvent('complete', nextRoute);
            },
          });
        } else {
          setRoute(nextRoute);
          emitRouteEvent('complete', nextRoute);
        }
        return;
      }
      emitRouteEvent('start', nextRoute);
      const signal = event.signal;
      const source = (event as NavigateEvent & { sourceElement?: Element })
        .sourceElement;
      // Resolve the navigating <a>'s data-nav-key (for dataNavKey matching):
      // the clicked <a> (most precise, so two same-href anchors stay
      // independent), or -- for programmatic push/replace and browser
      // back/forward, which have no sourceElement -- the first nav-key anchor in
      // the live DOM whose href resolves to the destination. href matching
      // needs none of this; it keys off the destination route directly.
      let navDataKey =
        source?.closest?.(`a[${NAV_KEY_ATTR}]`)?.getAttribute(NAV_KEY_ATTR) ??
        null;
      if (navDataKey === null && !source) {
        for (const anchor of document.querySelectorAll(`a[${NAV_KEY_ATTR}]`)) {
          const href = anchor.getAttribute('href');
          if (href !== null && routeMatchesHref(href, nextRoute)) {
            navDataKey = anchor.getAttribute(NAV_KEY_ATTR);
            break;
          }
        }
      }
      const pendingSetters: NavStatusEntry['setOptimisticStatus'][] = [];
      for (const entry of registryRef.current.values()) {
        const byKey =
          entry.dataNavKey !== undefined && entry.dataNavKey === navDataKey;
        const byHref =
          entry.href !== undefined && routeMatchesHref(entry.href, nextRoute);
        if (byKey || byHref) pendingSetters.push(entry.setOptimisticStatus);
      }
      event.intercept({
        ...(suppressScroll ? { scroll: 'manual' as const } : {}),
        handler: () =>
          new Promise<void>((resolve, reject) => {
            // Always a transition: it keeps the previous page visible while the
            // next tree suspends, and scopes the optimistic pending updates so
            // React reverts them on commit/abort/error.
            startTransition(async () => {
              try {
                for (const set of pendingSetters) set({ pending: true });
                let targetRoute = nextRoute;
                try {
                  if (!staticPathSetRef.current.has(nextRoute.path)) {
                    await refetch(
                      encodeRoutePath(nextRoute.path),
                      getRscParams(nextRoute.query),
                      enhanceFetchWithSkip,
                    );
                  }
                  if (signal.aborted) return resolve();
                } catch (err) {
                  if (signal.aborted) return resolve();
                  if (getErrorInfo(err)?.status === 404) {
                    if (!staticPathSetRef.current.has(NOT_FOUND_PATH)) {
                      await refetch(
                        encodeRoutePath(NOT_FOUND_PATH),
                        getRscParams(''),
                        enhanceFetchWithSkip,
                      );
                    }
                    if (signal.aborted) return resolve();
                    targetRoute = { path: NOT_FOUND_PATH, query: '', hash: '' };
                  } else {
                    setRenderError(err);
                    throw err;
                  }
                }
                // Updates after the first await lose the enclosing transition
                // scope (https://react.dev/reference/react/startTransition#caveats),
                // so re-wrap the commit -- otherwise it renders urgently and
                // the optimistic pending state reverts before the new tree is
                // ready.
                startTransition(() => {
                  setRenderError(null);
                  setRoute(targetRoute);
                });
                emitRouteEvent('complete', targetRoute);
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          }),
      });
    };
    window.navigation.addEventListener('navigate', callback);
    return () => {
      window.navigation.removeEventListener('navigate', callback);
    };
  }, [refetch, enhanceFetchWithSkip, getRscParams, emitRouteEvent]);
  // Mirror the shape Waku's INTERNAL_ServerRouter provides. We only care about
  // `route` and `prefetchRoute`; the other fields are no-ops so the context
  // value is type-compatible.
  const notAvailable = (name: string) => () => {
    throw new Error(`${name} is not available in waku-navigation`);
  };
  const routerCtxValue = useMemo(
    () => ({
      route,
      changeRoute: notAvailable('changeRoute') as never,
      prefetchRoute,
      routeChangeEvents,
      fetchingSlices,
    }),
    [route, prefetchRoute, routeChangeEvents, fetchingSlices],
  );
  return (
    <RouterContext.Provider value={routerCtxValue}>
      <NavStatusRegistryContext.Provider value={{ register }}>
        <Slot id="root">
          <Slot id={getRouteSlotId(route.path)} />
        </Slot>
      </NavStatusRegistryContext.Provider>
    </RouterContext.Provider>
  );
}

export function Router() {
  const initialRoute = parseRoute(
    new URL(window.navigation.currentEntry!.url!),
  );
  return (
    <Root initialRscPath={encodeRoutePath(initialRoute.path)}>
      <InnerRouter fallbackRoute={initialRoute} />
    </Root>
  );
}

// TODO: and more?
