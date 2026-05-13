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
import {
  Root,
  Slot,
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
  unstable_RouterContext,
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
type RegisterFn = (
  id: string,
  startTransition: TransitionStartFunction,
) => () => void;

const noopRegister: RegisterFn = () => () => {};
const RouterContext = createContext<{ register: RegisterFn }>({
  register: noopRegister,
});

// We piggyback on Waku's unstable_RouterContext for the route state. The
// server-side `INTERNAL_ServerRouter` that Waku's define-router runs during
// SSR already populates this context with the real route, so our useRouter
// reads correct values during SSR -- no hydration mismatch, no flicker. On
// the client our `<Router>` provides the same context shape below.
//
// Mirrors the shape of waku/router/client's useRouter() so apps migrating
// across can swap the import path. push/replace/reload/back/forward are thin
// wrappers over window.navigation; route info comes from context.
//
// Not yet implemented (vs waku/router/client): `prefetch`, `unstable_events`,
// and the `scroll` option on push/replace.
export function useRouter() {
  const ctx = useContext(unstable_RouterContext);
  const route: Route = ctx?.route ?? { path: '/', query: '', hash: '' };
  return {
    path: route.path,
    query: route.query,
    hash: route.hash,
    push: (to: string) =>
      window.navigation.navigate(to, { history: 'push' }).finished,
    replace: (to: string) =>
      window.navigation.navigate(to, { history: 'replace' }).finished,
    reload: () => window.navigation.reload().finished,
    back: () => {
      window.navigation.back();
    },
    forward: () => {
      window.navigation.forward();
    },
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
  const { register } = useContext(RouterContext);
  const id = useId();
  useLayoutEffect(
    () => register(id, startTransition),
    [id, register, startTransition],
  );
  const stamped = Children.map(children, (child) => {
    if (isValidElement(child) && child.type === 'a') {
      return cloneElement(child as ReactElement<Record<string, unknown>>, {
        [PENDING_ATTR]: id,
      });
    }
    return child;
  });
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
  useEffect(() => {
    if (initialRoute.hash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoute((r) => ({ ...r, hash: initialRoute.hash }));
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const registryRef = useRef(new Map<string, TransitionStartFunction>());
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
  const register = useCallback<RegisterFn>((id, st) => {
    registryRef.current.set(id, st);
    return () => {
      registryRef.current.delete(id);
    };
  }, []);
  useEffect(() => {
    const callback = (event: NavigateEvent) => {
      if (!event.canIntercept) return;
      if (event.downloadRequest !== null || event.formData) return;
      const nextRoute = parseRoute(new URL(event.destination.url));
      // Hash-only navigations: don't intercept (the browser handles URL + scroll
      // natively), but DO sync state so useRouter().hash stays current.
      if (event.hashChange) {
        setRoute(nextRoute);
        return;
      }
      const signal = event.signal;
      const source = (event as NavigateEvent & { sourceElement?: Element })
        .sourceElement;
      const id =
        source?.closest?.(`a[${PENDING_ATTR}]`)?.getAttribute(PENDING_ATTR) ??
        null;
      const registered = id ? registryRef.current.get(id) : undefined;
      const startTransition: TransitionStartFunction =
        registered ?? ((fn) => fn());
      const enhanceFetchWithSkip = withEnhanceFetchFn(
        (fetchFn) => (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set(SKIP_HEADER, JSON.stringify([...cachedIdSetRef.current]));
          return fetchFn(input, { ...init, headers });
        },
      );
      event.intercept({
        handler: () =>
          new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              try {
                let targetRoute = nextRoute;
                try {
                  if (!staticPathSetRef.current.has(nextRoute.path)) {
                    await refetch(
                      encodeRoutePath(nextRoute.path),
                      new URLSearchParams({ query: nextRoute.query }),
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
                        new URLSearchParams({ query: '' }),
                        enhanceFetchWithSkip,
                      );
                    }
                    if (signal.aborted) return resolve();
                    targetRoute = { path: NOT_FOUND_PATH, query: '', hash: '' };
                  } else {
                    throw err;
                  }
                }
                setRoute(targetRoute);
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
  }, [refetch]);
  // Mirror the shape Waku's INTERNAL_ServerRouter provides. We only care about
  // `route` for our useRouter; the other fields are present as no-ops so the
  // context value is type-compatible.
  const notAvailable = (name: string) => () => {
    throw new Error(`${name} is not available in waku-navigation`);
  };
  const routerCtxValue = useMemo(
    () => ({
      route,
      changeRoute: notAvailable('changeRoute') as never,
      prefetchRoute: notAvailable('prefetchRoute') as never,
      routeChangeEvents: { on: () => {}, off: () => {} },
      fetchingSlices,
    }),
    [route, fetchingSlices],
  );
  return (
    <unstable_RouterContext.Provider value={routerCtxValue}>
      <RouterContext.Provider value={{ register }}>
        <Slot id="root">
          <meta name="httpstatus" content={httpStatus} />
          <Slot id={getRouteSlotId(route.path)} />
        </Slot>
      </RouterContext.Provider>
    </unstable_RouterContext.Provider>
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

// TODO: error handling (non-404 refetch failures currently rethrow uncaught)
// TODO: prefetching (also adds useRouter().prefetch)
// TODO: scroll option on useRouter().push/replace
// TODO: route-change event subscriber (useRouter().unstable_events)
// TODO: HMR cache invalidation (clear staticPathSet/cachedIdSet on hot reload)
// TODO: <Pending> for non-click navigations (browser back/forward, programmatic
//       navigate()) -- currently no source element, so no <Pending> lights up
// TODO: e2e coverage for the downloadRequest and formData guard branches
// TODO: and more?
