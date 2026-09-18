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
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_addBase as addBase,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from 'waku/minimal/client';
import {
  RouterHostContext_UNSTABLE as RouterHostContext,
  SearchCodecsProvider_UNSTABLE,
  Slice_UNSTABLE as Slice,
  unstable_buildMergePatch as buildMergePatch,
  unstable_buildRouteHref as buildRouteHref,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getRouteFromElements as getRouteFromElements,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_has404FromElements as has404FromElements,
  unstable_isStaticFromElements as isStaticFromElements,
  unstable_load as load,
  unstable_parseRoute as parseRoute,
  useHmrRefetch_UNSTABLE as useHmrRefetch,
  useInitialRoute_UNSTABLE as useInitialRoute,
  useInitialRscParams_UNSTABLE as useInitialRscParams,
  useParams_UNSTABLE,
  useResolveSearchCodec_UNSTABLE as useResolveSearchCodec,
  useRouterCache_UNSTABLE as useRouterCache,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
  type Unstable_BuildRouteHrefTarget as BuildRouteHrefTarget,
  type Unstable_Loaded as Loaded,
  type Unstable_RouteHref as RouteHref,
  type Unstable_RoutePath as RoutePath,
  type Unstable_RouterHost as RouterHost,
} from 'waku/router/client-core';

export {
  SearchCodecsProvider_UNSTABLE,
  Slice,
  useParams_UNSTABLE,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
};

/** @deprecated Use `SearchCodecsProvider_UNSTABLE`. */
export const Unstable_SearchCodecsProvider = SearchCodecsProvider_UNSTABLE;

type Route = { path: string; query: string; hash: string };

const NOT_FOUND_PATH = '/404';

type NavigationStatus = { pending?: boolean };

type NavStatusEntry = {
  getElement: () => HTMLAnchorElement | null;
  href: string;
  scroll: boolean | undefined;
  setOptimisticStatus: (status: NavigationStatus) => void;
};
type RegisterFn = (id: string, entry: NavStatusEntry) => () => void;

// Defaults apply during SSR, where waku's INTERNAL_ServerRouter provides only
// the RouterHost.
const RouterContext = createContext<{
  register: RegisterFn;
  prefetchRoute: (route: Route) => void;
}>({
  register: () => () => {},
  prefetchRoute: () => {},
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
   * href string or, for a parameterized route, `{ to, params, search, hash }`.
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
  ref: refProp,
  ...props
}: LinkProps<Path>) {
  const base = (import.meta as { env?: { WAKU_CONFIG_BASE_PATH?: string } }).env
    ?.WAKU_CONFIG_BASE_PATH;
  const resolveCodec = useResolveSearchCodec();
  const href = typeof to === 'string' ? to : buildRouteHref(to, resolveCodec);
  const resolvedTo = base ? addBase(href, base) : href;
  const { register, prefetchRoute } = useContext(RouterContext);
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
        setOptimisticStatus,
      }),
    [id, resolvedTo, scroll, register, setOptimisticStatus],
  );
  useEffect(() => {
    if (!unstable_prefetchOnView || !elementRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const url = new URL(resolvedTo, window.location.href);
          if (url.href !== window.location.href) {
            prefetchRoute(parseRoute(url));
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [unstable_prefetchOnView, resolvedTo, prefetchRoute]);
  const onMouseEnter: AnchorHTMLAttributes<HTMLAnchorElement>['onMouseEnter'] =
    unstable_prefetchOnEnter
      ? (event) => {
          const url = new URL(resolvedTo, window.location.href);
          if (url.href !== window.location.href) {
            prefetchRoute(parseRoute(url));
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
/**
 * Imperative router handle: the current `path` / `query` / `hash`, plus
 * `push` / `replace` / `reload` / `back` / `forward` / `prefetch`. Same shape
 * as `waku/router/client`'s `useRouter`.
 */
export function useRouter() {
  const host = useContext(RouterHostContext);
  const { prefetchRoute } = useContext(RouterContext);
  const resolveCodec = useResolveSearchCodec();
  const route: Route = host?.route ?? { path: '/', query: '', hash: '' };
  return {
    path: route.path,
    query: route.query,
    hash: route.hash,
    push: (async (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => {
      const href =
        typeof to === 'string' ? to : buildRouteHref(to, resolveCodec);
      await window.navigation.navigate(href, {
        history: 'push',
        info: { scroll: options?.scroll },
      }).finished;
    }) as Navigate,
    replace: (async (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => {
      const href =
        typeof to === 'string' ? to : buildRouteHref(to, resolveCodec);
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
      const href =
        typeof to === 'string' ? to : buildRouteHref(to, resolveCodec);
      prefetchRoute(parseRoute(new URL(href, window.location.href)));
    }) as Prefetch,
  };
}

// RouterHost contract: a superseded navigation settles instead of rejecting.
const navigateHost: RouterHost['navigate'] = async (
  href,
  { history, scroll },
) => {
  try {
    await window.navigation.navigate(href, { history, info: { scroll } })
      .finished;
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
  }
};

// ROUTE_ID names the route the server rendered: '/404' for a missing route, or
// the target of a redirect it resolved. Mirrors waku's history binding.
const getLandedRoute = ({ route, url, elements }: Loaded): Route => {
  const served = getRouteFromElements(elements);
  if (
    served &&
    served.path !== NOT_FOUND_PATH &&
    (served.path !== route.path ||
      (!isStaticFromElements(elements) && served.query !== route.query))
  ) {
    return served;
  }
  return {
    path: served?.path ?? route.path,
    query: route.query,
    hash: url.hash,
  };
};

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
  const elements = use(useElementsPromise());
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRegisterRscReloadListener();
  const cache = useRouterCache();
  // Resolves an unknown URL the server answered with the /404 page to '/404',
  // and restores the hash (SSR sends no fragment) after hydration.
  const initialRoute = useInitialRoute(fallbackRoute);
  const [committedRoute, setRoute] = useState<Route>();
  const route = committedRoute ?? initialRoute;
  // Rethrow during render so the user's <ErrorBoundary> catches failures;
  // cleared by the next successful navigation.
  const [renderError, setRenderError] = useState<unknown>(null);
  if (renderError) throw renderError;
  const elementsRef = useRef(elements);
  const routeRef = useRef(route);
  useLayoutEffect(() => {
    elementsRef.current = elements;
    routeRef.current = route;
  });
  useEffect(() => {
    cache.learnStaticFromElements(elements);
  }, [cache, elements]);
  const registryRef = useRef(new Map<string, NavStatusEntry>());
  const register = useCallback<RegisterFn>((id, entry) => {
    registryRef.current.set(id, entry);
    return () => {
      registryRef.current.delete(id);
    };
  }, []);
  const prefetchRoute = useCallback(
    (next: Route) => {
      if (cache.canReuseStaticRoute(next, elementsRef.current)) return;
      cache.prefetchRoute(next);
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
    [cache],
  );
  // Vite HMR (dev only): the replacing no-op retires Root's own listener, which
  // would refetch the initial route; useHmrRefetch refetches the current one.
  useEffect(
    () => registerRscReloadListener(() => {}, { replace: true }),
    [registerRscReloadListener],
  );
  const getSettledRoute = useCallback(() => routeRef.current, []);
  useHmrRefetch({ getSettledRoute });
  useEffect(() => {
    const callback = (event: NavigateEvent) => {
      if (!event.canIntercept) return;
      if (event.downloadRequest !== null || event.formData) return;
      // React >=19.2's default transition indicator fires fake navigations.
      if (event.info === 'react-transition') return;
      const destination = new URL(event.destination.url);
      const nextRoute = parseRoute(destination);
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
        if (suppressScroll) {
          event.intercept({
            scroll: 'manual',
            handler: async () => {
              setRoute(nextRoute);
            },
          });
        } else {
          setRoute(nextRoute);
        }
        return;
      }
      const signal = event.signal;
      event.intercept({
        ...(suppressScroll ? { scroll: 'manual' as const } : {}),
        handler: () =>
          new Promise<void>((resolve, reject) => {
            // Run in a transition: keeps the previous page visible while the
            // next tree suspends, and scopes the optimistic pending updates so
            // React reverts them on commit/abort/error.
            startTransition(async () => {
              try {
                for (const { setOptimisticStatus } of matched) {
                  setOptimisticStatus({ pending: true });
                }
                const settled = routeRef.current;
                const base = elementsRef.current;
                // Reuses a static route or a prefetch, and follows a 404 or
                // redirect the fetch reports.
                const outcome = await load(cache, nextRoute, {
                  signal,
                  has404: has404FromElements(base),
                  settled,
                  base,
                  url: destination,
                });
                if (outcome.type === 'aborted') return resolve();
                if (outcome.type === 'external') {
                  window.location.replace(outcome.url.href);
                  return resolve();
                }
                if (outcome.type === 'failed') {
                  setRenderError(outcome.error);
                  throw outcome.error;
                }
                const targetRoute =
                  outcome.type === 'loaded'
                    ? getLandedRoute(outcome)
                    : outcome.route;
                // Updates after the first await lose the transition scope
                // (https://react.dev/reference/react/startTransition#caveats),
                // so re-wrap the commit.
                startTransition(() => {
                  setRenderError(null);
                  if (outcome.type === 'loaded') {
                    void mergeElements(
                      buildMergePatch(outcome, elementsRef.current, base, {
                        settled,
                      }),
                    );
                  }
                  setRoute(targetRoute);
                });
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
  }, [cache, mergeElements]);
  // The same RouterHost waku's INTERNAL_ServerRouter provides during SSR, which
  // the re-exported hooks and useRouter read.
  const host = useMemo<RouterHost>(
    () => ({ route, navigate: navigateHost }),
    [route],
  );
  const routerCtxValue = useMemo(
    () => ({ register, prefetchRoute }),
    [register, prefetchRoute],
  );
  return (
    <RouterHostContext.Provider value={host}>
      <RouterContext.Provider value={routerCtxValue}>
        <Slot id="root">
          <Slot id={getRouteSlotId(route.path)} />
        </Slot>
      </RouterContext.Provider>
    </RouterHostContext.Provider>
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
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const initialRscParams = useInitialRscParams(
    initialRscPath,
    initialRoute.query,
  );
  return (
    <Root initialRscPath={initialRscPath} initialRscParams={initialRscParams}>
      <InnerRouter fallbackRoute={initialRoute} />
    </Root>
  );
}
