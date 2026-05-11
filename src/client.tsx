/// <reference types="dom-navigation" />

'use client';

import { useEffect, useState } from 'react';
import { Root, Slot, useRefetch } from 'waku/minimal/client';
import {
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getErrorInfo as getErrorInfo,
  unstable_getHttpStatusFromMeta as getHttpStatusFromMeta,
  unstable_parseRoute as parseRoute,
  unstable_getRouteSlotId as getRouteSlotId,
} from 'waku/router/client';

const NOT_FOUND_PATH = '/404';

function InnerRouter({
  initialRoutePath,
  httpStatus,
}: {
  initialRoutePath: string;
  httpStatus: string | undefined;
}) {
  const refetch = useRefetch();
  const [routePath, setRoutePath] = useState(initialRoutePath);
  useEffect(() => {
    const callback = (event: NavigateEvent) => {
      if (!event.canIntercept) return;
      if (event.hashChange || event.downloadRequest !== null || event.formData)
        return;
      const route = parseRoute(new URL(event.destination.url));
      event.intercept({
        handler: async () => {
          try {
            await refetch(encodeRoutePath(route.path));
            setRoutePath(route.path);
          } catch (err) {
            if (getErrorInfo(err)?.status === 404) {
              await refetch(encodeRoutePath(NOT_FOUND_PATH));
              setRoutePath(NOT_FOUND_PATH);
              return;
            }
            throw err;
          }
        },
      });
    };
    window.navigation.addEventListener('navigate', callback);
    return () => {
      window.navigation.removeEventListener('navigate', callback);
    };
  }, [refetch]);
  return (
    <Slot id="root">
      <meta name="httpstatus" content={httpStatus} />
      <Slot id={getRouteSlotId(routePath)} />
    </Slot>
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
// TODO: error handling
// TODO: pending
// TODO: prefetching
// TODO: and more?
