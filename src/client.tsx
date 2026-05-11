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
import { Root, Slot, useRefetch } from 'waku/minimal/client';
import {
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getErrorInfo as getErrorInfo,
  unstable_getHttpStatusFromMeta as getHttpStatusFromMeta,
  unstable_parseRoute as parseRoute,
  unstable_getRouteSlotId as getRouteSlotId,
} from 'waku/router/client';

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
      // event.sourceElement is the element that triggered the navigation (the
      // clicked <a>, if any). It's part of the spec but missing from
      // @types/dom-navigation@1.0.6, hence the cast.
      const source = (event as NavigateEvent & { sourceElement?: Element })
        .sourceElement;
      const id =
        source?.closest?.(`a[${PENDING_ATTR}]`)?.getAttribute(PENDING_ATTR) ??
        null;
      const registered = id ? registryRef.current.get(id) : undefined;
      const startTransition: TransitionStartFunction =
        registered ?? ((fn) => fn());
      event.intercept({
        handler: () =>
          new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              try {
                let targetPath: string;
                try {
                  await refetch(encodeRoutePath(route.path));
                  if (signal.aborted) return resolve();
                  targetPath = route.path;
                } catch (err) {
                  if (signal.aborted) return resolve();
                  if (getErrorInfo(err)?.status === 404) {
                    await refetch(encodeRoutePath(NOT_FOUND_PATH));
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

// TODO: caching and static handling
// TODO: caching with state?
// TODO: query & hash support
// TODO: slice support (upstream)
// TODO: error handling (non-404 refetch failures currently rethrow uncaught)
// TODO: prefetching
// TODO: <Pending> for non-click navigations (browser back/forward, programmatic
//       navigate()) -- currently no source element, so no <Pending> lights up
// TODO: e2e coverage for the downloadRequest and formData guard branches
// TODO: and more?
