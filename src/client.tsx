/// <reference types="dom-navigation" />

'use client';

import { useEffect, useState } from 'react';
import { Root, Slot, useRefetch } from 'waku/minimal/client';
import type { Unstable_RouteProps as RouteProps } from 'waku/router/client';
import {
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getHttpStatusFromMeta as getHttpStatusFromMeta,
  unstable_parseRoute as parseRoute,
  unstable_getRouteSlotId as getRouteSlotId,
} from 'waku/router/client';

function InnerRouter({
  initialRoute,
  httpStatus,
}: {
  initialRoute: RouteProps;
  httpStatus: string | undefined;
}) {
  const refetch = useRefetch();
  const [routePath, setRoutePath] = useState(initialRoute.path);
  useEffect(() => {
    const callback = (event: NavigateEvent) => {
      if (!event.canIntercept) return;
      if (event.hashChange || event.downloadRequest !== null || event.formData)
        return;
      event.intercept();
      const route = parseRoute(new URL(event.destination.url));
      const rscPath = encodeRoutePath(route.path);
      refetch(rscPath);
      setRoutePath(route.path);
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
  const initialRoute = parseRoute(
    new URL(window.navigation.currentEntry!.url!),
  );
  const httpStatus = getHttpStatusFromMeta();
  return (
    <Root initialRscPath={encodeRoutePath(initialRoute.path)}>
      <InnerRouter initialRoute={initialRoute} httpStatus={httpStatus} />
    </Root>
  );
}

// TODO: caching and static handling
// TODO: caching with state?
// TODO: query & hash support
// TODO: slice support (upstream)
// TODO: 404 page
// TODO: error handling
// TODO: pending
// TODO: prefetching
// TODO: and more?
