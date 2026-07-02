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
  type AnchorHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { preloadModule } from 'react-dom';
import {
  Root,
  Slot,
  unstable_prefetchRsc as prefetchRsc,
  unstable_registerFetchEnhancer as registerFetchEnhancer,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useRefetch,
} from 'waku/minimal/client';
import {
  Slice,
  Unstable_SearchCodecsProvider,
  unstable_addBase as addBase,
  unstable_buildRouteHref as buildRouteHref,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getErrorInfo as getErrorInfo,
  unstable_matchRouteParams as matchRouteParams,
  unstable_parseRoute as parseRoute,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_IS_STATIC_ID as IS_STATIC_ID,
  unstable_ROUTE_ID as ROUTE_ID,
  unstable_RouterContext as RouterContext,
  unstable_SKIP_HEADER as SKIP_HEADER,
  unstable_useResolveSearchCodec as useResolveSearchCodec,
  type Unstable_BuildRouteHrefTarget as BuildRouteHrefTarget,
  type Unstable_RouteHref as RouteHref,
  type Unstable_RouteParams as RouteParams,
  type Unstable_RoutePath as RoutePath,
  type Unstable_RouteSearch as RouteSearch,
} from 'waku/router/client';

export { Slice, Unstable_SearchCodecsProvider };

type Elements = Record<string, unknown>;
type Route = { path: string; query: string; hash: string };

const NOT_FOUND_PATH = '/404';
// Mirror waku's unexported etag constants (router/isomorphic-utils/route-path).
// STATIC_ETAG is a numeric sentinel a static slot carries instead of a string.
const ETAG_ID_PREFIX = 'ETAG:';
const STATIC_ETAG = 1;

type NavigationStatus = { pending?: boolean };
type TransitionFunction = () => void | Promise<void>;

type NavStatusEntry = {
  getElement: () => HTMLAnchorElement | null;
  href: string;
  scroll: boolean | undefined;
  unstable_startTransition: ((fn: TransitionFunction) => void) | undefined;
  setOptimisticStatus: (status: NavigationStatus) => void;
};
type RegisterFn = (id: string, entry: NavStatusEntry) => () => void;

const noopRegister: RegisterFn = () => () => {};
const NavStatusRegistryContext = createContext<{ register: RegisterFn }>({
  register: noopRegister,
});

const NavigationStatusContext = createContext<NavigationStatus>({});

/**
 * Navigation status of the enclosing {@link Link}, like React's
 * `useFormStatus`. `pending` is `true` while the link's navigation is in
 * flight, until the destination route's async components resolve. Returns `{}`
 * outside a `<Link>`.
 */
export const useNavigationStatus_UNSTABLE = (): NavigationStatus =>
  useContext(NavigationStatusContext);

/** Props for {@link Link}. Mirrors `waku/router`'s `<Link>`. */
export type LinkProps<Path extends RoutePath> = {
  /**
   * Destination, type-checked against your app's generated routes. Either an
   * href string or, for a parameterized route, `{ to, params, hash }`.
   */
  to: RouteHref | BuildRouteHrefTarget<Path>;
  children: ReactNode;
  /**
   * Whether to scroll on navigation. `false` keeps the current scroll
   * position; otherwise the browser's default after-navigation scroll applies.
   */
  scroll?: boolean;
  /** Prefetch the route when the pointer enters the link. */
  unstable_prefetchOnEnter?: boolean;
  /** Prefetch the route when the link scrolls into view. */
  unstable_prefetchOnView?: boolean;
  /**
   * Overrides how the route-commit transition is started, e.g. to integrate
   * the browser View Transitions API. When set, the pending state is bypassed,
   * so {@link useNavigationStatus_UNSTABLE} stays `{}` for this link.
   */
  unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
  ref?: Ref<HTMLAnchorElement> | undefined;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

/**
 * A type-safe, prefetching, status-aware link. A plain `<a>` already navigates
 * client-side, so `<Link>` is an enhancement: it adds a type-checked `to`,
 * prefetching, and per-link navigation status (read by descendants via
 * {@link useNavigationStatus_UNSTABLE}). Mirrors `waku/router`'s `<Link>`.
 */
export function Link<Path extends RoutePath>({
  to,
  children,
  scroll,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  unstable_startTransition,
  ref: refProp,
  ...props
}: LinkProps<Path>) {
  const base = (import.meta as { env?: { WAKU_CONFIG_BASE_PATH?: string } }).env
    ?.WAKU_CONFIG_BASE_PATH;
  const href = typeof to === 'string' ? to : buildRouteHref(to);
  const resolvedTo = base ? addBase(href, base) : href;
  const ctx = useContext(RouterContext);
  const { register } = useContext(NavStatusRegistryContext);
  const [status, setOptimisticStatus] = useOptimistic<NavigationStatus>({});
  const elementRef = useRef<HTMLAnchorElement | null>(null);
  const setRef = useCallback(
    (node: HTMLAnchorElement | null) => {
      elementRef.current = node;
      if (typeof refProp === 'function') refProp(node);
      else if (refProp)
        (refProp as { current: HTMLAnchorElement | null }).current = node;
    },
    [refProp],
  );
  const id = useId();
  useLayoutEffect(
    () =>
      register(id, {
        getElement: () => elementRef.current,
        href: resolvedTo,
        scroll,
        unstable_startTransition,
        setOptimisticStatus,
      }),
    [
      id,
      resolvedTo,
      scroll,
      unstable_startTransition,
      register,
      setOptimisticStatus,
    ],
  );
  useEffect(() => {
    if (!unstable_prefetchOnView || !elementRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const url = new URL(resolvedTo, window.location.href);
          if (url.href !== window.location.href) {
            ctx?.prefetchRoute(parseRoute(url));
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [unstable_prefetchOnView, resolvedTo, ctx]);
  const onMouseEnter: AnchorHTMLAttributes<HTMLAnchorElement>['onMouseEnter'] =
    unstable_prefetchOnEnter
      ? (event) => {
          const url = new URL(resolvedTo, window.location.href);
          if (url.href !== window.location.href) {
            ctx?.prefetchRoute(parseRoute(url));
          }
          props.onMouseEnter?.(event);
        }
      : props.onMouseEnter;
  // No onClick: the browser fires the navigate event for the plain <a>, and
  // InnerRouter's handler correlates it back to this instance.
  return (
    <NavigationStatusContext.Provider value={status}>
      <a {...props} href={resolvedTo} ref={setRef} onMouseEnter={onMouseEnter}>
        {children}
      </a>
    </NavigationStatusContext.Provider>
  );
}

type NavigateOptions = { scroll?: boolean };
type Navigate = {
  (to: RouteHref, options?: NavigateOptions): Promise<void>;
  <Path extends RoutePath>(
    target: BuildRouteHrefTarget<Path>,
    options?: NavigateOptions,
  ): Promise<void>;
};
type Prefetch = {
  (to: RouteHref): void;
  <Path extends RoutePath>(target: BuildRouteHrefTarget<Path>): void;
};
type RouteChangeEvents = {
  on: (name: 'start' | 'complete', handler: (route: Route) => void) => void;
  off: (name: 'start' | 'complete', handler: (route: Route) => void) => void;
};
const noopEvents: RouteChangeEvents = { on: () => {}, off: () => {} };
/**
 * Imperative router handle: the current `path` / `query` / `hash`, plus
 * `push` / `replace` / `reload` / `back` / `forward` / `prefetch` and
 * `unstable_events`. Same shape as `waku/router/client`'s `useRouter`.
 */
export function useRouter() {
  const ctx = useContext(RouterContext);
  const route: Route = ctx?.route ?? { path: '/', query: '', hash: '' };
  return {
    path: route.path,
    query: route.query,
    hash: route.hash,
    push: (async (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => {
      const href = typeof to === 'string' ? to : buildRouteHref(to);
      await window.navigation.navigate(href, {
        history: 'push',
        info: { scroll: options?.scroll },
      }).finished;
    }) as Navigate,
    replace: (async (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => {
      const href = typeof to === 'string' ? to : buildRouteHref(to);
      await window.navigation.navigate(href, {
        history: 'replace',
        info: { scroll: options?.scroll },
      }).finished;
    }) as Navigate,
    reload: () => window.navigation.reload().finished,
    back: () => {
      window.navigation.back();
    },
    forward: () => {
      window.navigation.forward();
    },
    prefetch: ((to: RouteHref | BuildRouteHrefTarget<RoutePath>) => {
      const href = typeof to === 'string' ? to : buildRouteHref(to);
      ctx?.prefetchRoute(parseRoute(new URL(href, window.location.href)));
    }) as Prefetch,
    unstable_events: (ctx?.routeChangeEvents ??
      noopEvents) as RouteChangeEvents,
  };
}

/**
 * Read the current route's params, typed from the `from` path, or `null` when
 * the current path does not match it. Mirrors `waku/router`'s
 * `useParams_UNSTABLE`.
 */
export function useParams_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): RouteParams<Path> | null {
  const { path } = useRouter();
  return useMemo(() => matchRouteParams(from, path), [from, path]);
}

/**
 * Read the current route's typed `search`, parsed with the route's codec
 * (provided via {@link Unstable_SearchCodecsProvider}), or `null` when the
 * current path does not match `from` or the route has no codec. Mirrors
 * `waku/router`'s `useSearch_UNSTABLE`.
 */
export function useSearch_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): RouteSearch<Path> | null {
  const { path, query } = useRouter();
  const resolveCodec = useResolveSearchCodec();
  return useMemo(() => {
    if (matchRouteParams(from, path) === null) return null;
    const codec = resolveCodec(from);
    return codec ? (codec.parse(query) as RouteSearch<Path>) : null;
  }, [from, path, query, resolveCodec]);
}

type SetSearch<Path extends RoutePath> = (
  update:
    | Partial<RouteSearch<Path>>
    | ((prev: RouteSearch<Path>) => Partial<RouteSearch<Path>>),
  options?: { history?: 'push' | 'replace'; scroll?: boolean },
) => Promise<void>;

/**
 * Returns a setter for the current route's typed `search`, serialized with the
 * route's codec (provided via {@link Unstable_SearchCodecsProvider}). It
 * navigates to the same path with the new query (push by default). A no-op when
 * the current path does not match `from` or has no codec. Mirrors `waku/router`'s
 * `useSetSearch_UNSTABLE`.
 */
export function useSetSearch_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): SetSearch<Path> {
  const { path, query } = useRouter();
  const resolveCodec = useResolveSearchCodec();
  return useCallback<SetSearch<Path>>(
    async (update, options) => {
      if (matchRouteParams(from, path) === null) return;
      const codec = resolveCodec(from);
      if (!codec) return;
      const prev = codec.parse(query) as RouteSearch<Path>;
      const partial = typeof update === 'function' ? update(prev) : update;
      const url = new URL(window.location.href);
      url.search = codec.serialize({ ...prev, ...partial });
      await window.navigation.navigate(url.href, {
        history: options?.history ?? 'push',
        info: { scroll: options?.scroll },
      }).finished;
    },
    [from, path, query, resolveCodec],
  );
}

// Same origin + path + query (not pathname; fragment ignored). Malformed input
// returns false rather than throwing.
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
    // First render only. ROUTE_ID records the route the server actually
    // rendered, so an unknown URL served the /404 page resolves to '/404'. This
    // must not suspend on later renders: suspending inside a navigation
    // transition would keep it from ever committing.
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
  // Rethrow during render so the user's <ErrorBoundary> catches non-404
  // failures; cleared by the next successful navigation.
  const [renderError, setRenderError] = useState<unknown>(null);
  if (renderError) throw renderError;
  useEffect(() => {
    // SSR sends no fragment, so the hash starts ''; upgrade it post-hydration.
    if (fallbackRoute.hash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoute((r) => ({ ...(r as Route), hash: fallbackRoute.hash }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const registryRef = useRef(new Map<string, NavStatusEntry>());
  const staticPathSetRef = useRef(new Set<string>());
  const cachedEtagsRef = useRef<Record<string, string | number>>({});
  // Stable instance: <Slice> mutates this Set across renders.
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
        const etags: Record<string, string | number> = {};
        for (const [key, value] of Object.entries(elements)) {
          // Keep the static sentinel; for string tags drop empty (clear signal)
          // and non-Latin1 (breaks the fetch header).
          if (
            key.startsWith(ETAG_ID_PREFIX) &&
            (value === STATIC_ETAG ||
              (typeof value === 'string' && /^[ -ÿ]+$/.test(value)))
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
  // Send our cached etags via X-Waku-Router-Skip so the server can skip
  // re-rendering slots whose etag still matches.
  useEffect(
    () =>
      registerFetchEnhancer((fetchFn) => (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set(SKIP_HEADER, JSON.stringify(cachedEtagsRef.current));
        return fetchFn(input, { ...init, headers });
      }),
    [],
  );
  // Waku's prefetch cache keys params by identity, so reuse one object per
  // query string or prefetch entries get invalidated.
  const rscParamsByQueryRef = useRef(new Map<string, URLSearchParams>());
  const getRscParams = useCallback((query: string) => {
    let params = rscParamsByQueryRef.current.get(query);
    if (!params) {
      params = new URLSearchParams({ query });
      rscParamsByQueryRef.current.set(query, params);
    }
    return params;
  }, []);
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
  const prefetchRoute = useCallback(
    (next: Route) => {
      if (staticPathSetRef.current.has(next.path)) return;
      prefetchRsc(encodeRoutePath(next.path), getRscParams(next.query));
      // When the build publishes it, __WAKU_ROUTER_PREFETCH__ yields the
      // route's JS chunk ids to preload.
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
    [getRscParams],
  );
  // Vite HMR (dev only): clear caches and refetch the current route when Waku's
  // runtime fires __WAKU_RSC_RELOAD_LISTENERS__.
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
      const info = event.info as { scroll?: boolean } | undefined;
      const source = (event as NavigateEvent & { sourceElement?: Element })
        .sourceElement;
      const clickedAnchor = source?.closest?.('a') ?? null;
      // Match the navigating <Link>(s): the clicked one by element identity (so
      // two same-`to` links stay independent), or -- with no source element
      // (programmatic / back-forward) -- every <Link> whose `to` hits the dest.
      const matched: NavStatusEntry[] = [];
      for (const entry of registryRef.current.values()) {
        const hit = clickedAnchor
          ? entry.getElement() === clickedAnchor
          : !source && routeMatchesHref(entry.href, nextRoute);
        if (hit) matched.push(entry);
      }
      const resolvedScroll =
        info?.scroll ?? (matched.length ? matched[0]!.scroll : undefined);
      const suppressScroll = resolvedScroll === false;
      if (event.hashChange) {
        // Hash-only: no refetch; intercept only to suppress the browser scroll.
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
      // A clicked <Link>'s unstable_startTransition overrides the commit
      // transition (View Transitions); its pending is then bypassed.
      const customTransition = clickedAnchor
        ? matched.find((e) => e.unstable_startTransition)
            ?.unstable_startTransition
        : undefined;
      const pendingSetters = matched
        .filter((e) => !e.unstable_startTransition)
        .map((e) => e.setOptimisticStatus);
      event.intercept({
        ...(suppressScroll ? { scroll: 'manual' as const } : {}),
        handler: () =>
          new Promise<void>((resolve, reject) => {
            // Run in a transition: keeps the previous page visible while the
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
                      );
                    }
                    if (signal.aborted) return resolve();
                    targetRoute = { path: NOT_FOUND_PATH, query: '', hash: '' };
                  } else {
                    setRenderError(err);
                    throw err;
                  }
                }
                // Updates after the first await lose the transition scope
                // (https://react.dev/reference/react/startTransition#caveats),
                // so re-wrap the commit; a <Link>'s unstable_startTransition
                // takes over here.
                const commitRoute = () => {
                  setRenderError(null);
                  setRoute(targetRoute);
                };
                if (customTransition) customTransition(commitRoute);
                else startTransition(commitRoute);
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
  }, [refetch, getRscParams, emitRouteEvent]);
  // Mirror waku's INTERNAL_ServerRouter context shape; only route and
  // prefetchRoute are used.
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

/**
 * The client router. Reads the initial route from `window.navigation`, listens
 * for navigate events, and renders the current page. Takes no props.
 */
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
