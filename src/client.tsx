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
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getErrorInfo as getErrorInfo,
  unstable_getHttpStatusFromMeta as getHttpStatusFromMeta,
  unstable_parseRoute as parseRoute,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_IS_STATIC_ID as IS_STATIC_ID,
  unstable_ROUTE_ID as ROUTE_ID,
  unstable_SKIP_HEADER as SKIP_HEADER,
} from 'waku/router/client';

type Elements = Record<string, unknown>;

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
  initialRoutePath,
  httpStatus,
}: {
  initialRoutePath: string;
  httpStatus: string | undefined;
}) {
  const refetch = useRefetch();
  const [routePath, setRoutePath] = useState(initialRoutePath);
  const registryRef = useRef(new Map<string, TransitionStartFunction>());
  // Paths whose response was marked IS_STATIC: subsequent navigations to
  // them skip refetch entirely. Slot ids the server has already given us;
  // sent back via SKIP_HEADER so the server can omit them on the next fetch.
  const staticPathSetRef = useRef(new Set<string>());
  const cachedIdSetRef = useRef(new Set<string>());
  // Track caches off the elements promise (which Waku populates from the
  // initial SSR payload and from every refetch). Doing it from a useEffect
  // lets us pick up the initial elements too, not just the ones we refetch.
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
      if (event.hashChange || event.downloadRequest !== null || event.formData)
        return;
      const route = parseRoute(new URL(event.destination.url));
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
                let targetPath: string;
                try {
                  // Already-loaded static route -- no network round-trip, the
                  // element is still in the store.
                  if (!staticPathSetRef.current.has(route.path)) {
                    await refetch(
                      encodeRoutePath(route.path),
                      undefined,
                      enhanceFetchWithSkip,
                    );
                  }
                  if (signal.aborted) return resolve();
                  targetPath = route.path;
                } catch (err) {
                  if (signal.aborted) return resolve();
                  if (getErrorInfo(err)?.status === 404) {
                    if (!staticPathSetRef.current.has(NOT_FOUND_PATH)) {
                      await refetch(
                        encodeRoutePath(NOT_FOUND_PATH),
                        undefined,
                        enhanceFetchWithSkip,
                      );
                    }
                    if (signal.aborted) return resolve();
                    targetPath = NOT_FOUND_PATH;
                  } else {
                    throw err;
                  }
                }
                setRoutePath(targetPath);
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
  return (
    <RouterContext.Provider value={{ register }}>
      <Slot id="root">
        <meta name="httpstatus" content={httpStatus} />
        <Slot id={getRouteSlotId(routePath)} />
      </Slot>
    </RouterContext.Provider>
  );
}

export function Router() {
  const httpStatus = getHttpStatusFromMeta();
  const initialRoutePath =
    httpStatus === '404'
      ? NOT_FOUND_PATH
      : parseRoute(new URL(window.navigation.currentEntry!.url!)).path;
  return (
    <Root initialRscPath={encodeRoutePath(initialRoutePath)}>
      <InnerRouter
        initialRoutePath={initialRoutePath}
        httpStatus={httpStatus}
      />
    </Root>
  );
}

// TODO: query & hash support
// TODO: slice support (upstream) -- including the IS_STATIC:<slotId> marker
// TODO: error handling (non-404 refetch failures currently rethrow uncaught)
// TODO: prefetching
// TODO: HMR cache invalidation (clear staticPathSet/cachedIdSet on hot reload)
// TODO: <Pending> for non-click navigations (browser back/forward, programmatic
//       navigate()) -- currently no source element, so no <Pending> lights up
// TODO: e2e coverage for the downloadRequest and formData guard branches
// TODO: and more?
