/// <reference types="dom-navigation" />

'use client';

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
  type TransitionStartFunction,
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
  unstable_getHttpStatusFromMeta as getHttpStatusFromMeta,
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
const PENDING_ATTR = 'data-waku-pending';

// Each <Pending> generates a unique id via useId and stamps the child <a>
// with data-waku-pending=<id>. The Router listens to document clicks for any
// element with that attribute and remembers the id, then -- when the
// navigate event fires -- looks up THAT <Pending>'s startTransition. So two
// <Pending>s pointing at the same href stay independent, and isPending lights
// up only on the one that was actually clicked.
type PendingEntry = {
  href: string | undefined;
  startTransition: TransitionStartFunction;
};
type RegisterFn = (id: string, entry: PendingEntry) => () => void;

const noopRegister: RegisterFn = () => () => {};
const PendingRegistryContext = createContext<{ register: RegisterFn }>({
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

export function Pending({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const { register } = useContext(PendingRegistryContext);
  const id = useId();
  const stamped = Children.map(children, (child) => {
    if (isValidElement(child) && child.type === 'a') {
      return cloneElement(child as ReactElement<Record<string, unknown>>, {
        [PENDING_ATTR]: id,
      });
    }
    return child;
  });
  // Capture the wrapped <a>'s href so that programmatic / back-forward
  // navigations (which have no event.sourceElement) can still find their
  // Pending by matching the destination path.
  const href = Children.toArray(children)
    .map((child) => {
      if (isValidElement(child) && child.type === 'a') {
        const { href: h } = child.props as { href?: unknown };
        return typeof h === 'string' ? h : undefined;
      }
      return undefined;
    })
    .find((h): h is string => h !== undefined);
  useLayoutEffect(
    () => register(id, { href, startTransition }),
    [id, href, register, startTransition],
  );
  return (
    <>
      {stamped}
      {isPending ? fallback : null}
    </>
  );
}

function InnerRouter({
  initialRoute,
  httpStatus,
}: {
  initialRoute: Route;
  httpStatus: string | undefined;
}) {
  const refetch = useRefetch();
  // Waku's INTERNAL_ServerRouter renders the SSR tree with hash: '' (URL
  // fragments aren't sent to the server), so we mirror that to keep the
  // first client render in sync, then upgrade to the real hash post-hydration.
  const [route, setRoute] = useState<Route>(() => ({
    ...initialRoute,
    hash: '',
  }));
  // Non-404 refetch failures (network errors, server 500s, etc.) get surfaced
  // by rethrowing during render so the user's <ErrorBoundary> can catch them.
  // The state clears on the next successful navigation.
  const [renderError, setRenderError] = useState<unknown>(null);
  if (renderError) throw renderError;
  useEffect(() => {
    if (initialRoute.hash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoute((r) => ({ ...r, hash: initialRoute.hash }));
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const registryRef = useRef(new Map<string, PendingEntry>());
  const staticPathSetRef = useRef(new Set<string>());
  const cachedIdSetRef = useRef(new Set<string>());
  // Stable Set so Waku's <Slice> can mutate it (add on fetch start, delete on
  // fetch end) without losing state across re-renders. useMemo with [] keeps
  // the same instance and avoids reading ref.current during render.
  const fetchingSlices = useMemo(() => new Set<string>(), []);
  const elementsPromise = useElementsPromise();
  useEffect(() => {
    elementsPromise.then(
      (elements: Elements) => {
        const routeData = elements[ROUTE_ID] as
          | [path: string, query: string]
          | undefined;
        if (routeData && elements[IS_STATIC_ID]) {
          staticPathSetRef.current.add(routeData[0]);
        }
        cachedIdSetRef.current = new Set(
          Object.keys(elements).filter(
            (k) => !k.startsWith('_') && k !== ROUTE_ID && k !== IS_STATIC_ID,
          ),
        );
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
  // Adds the X-Waku-Router-Skip header listing element ids we already have,
  // so the server can skip re-rendering them. Shared by navigate + prefetch.
  const enhanceFetchWithSkip = useMemo(
    () =>
      withEnhanceFetchFn((fetchFn) => (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set(SKIP_HEADER, JSON.stringify([...cachedIdSetRef.current]));
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
      cachedIdSetRef.current.clear();
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
      const id =
        source?.closest?.(`a[${PENDING_ATTR}]`)?.getAttribute(PENDING_ATTR) ??
        null;
      // Prefer the source-element match (most precise: tied to the actual
      // clicked <a>). For programmatic push/replace and browser back/forward
      // there's no sourceElement, so fall back to any <Pending> whose
      // wrapped <a>'s href resolves to this destination path.
      let registered = id ? registryRef.current.get(id) : undefined;
      if (!registered) {
        for (const entry of registryRef.current.values()) {
          if (
            entry.href !== undefined &&
            new URL(entry.href, window.location.href).pathname ===
              nextRoute.path
          ) {
            registered = entry;
            break;
          }
        }
      }
      const startTransition: TransitionStartFunction =
        registered?.startTransition ?? ((fn) => fn());
      event.intercept({
        ...(suppressScroll ? { scroll: 'manual' as const } : {}),
        handler: () =>
          new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              try {
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
                setRenderError(null);
                setRoute(targetRoute);
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
      <PendingRegistryContext.Provider value={{ register }}>
        <Slot id="root">
          <meta name="httpstatus" content={httpStatus} />
          <Slot id={getRouteSlotId(route.path)} />
        </Slot>
      </PendingRegistryContext.Provider>
    </RouterContext.Provider>
  );
}

export function Router() {
  const httpStatus = getHttpStatusFromMeta();
  const parsed = parseRoute(new URL(window.navigation.currentEntry!.url!));
  const initialRoute: Route =
    httpStatus === '404'
      ? { path: NOT_FOUND_PATH, query: '', hash: '' }
      : parsed;
  return (
    <Root initialRscPath={encodeRoutePath(initialRoute.path)}>
      <InnerRouter initialRoute={initialRoute} httpStatus={httpStatus} />
    </Root>
  );
}

// TODO: and more?
