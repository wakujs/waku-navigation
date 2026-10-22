import { unstable_createRouteHref as createRouteHref } from 'waku/router';
import type { Unstable_SearchCodec } from 'waku/router';

const tabCodec: Unstable_SearchCodec<{ tab: string }> = {
  parse: (query) => ({
    tab: new URLSearchParams(query).get('tab') ?? 'home',
  }),
  serialize: (search) => new URLSearchParams({ tab: search.tab }).toString(),
};

export const userRoute = createRouteHref({ path: '/user/[id]' });
export const searchRoute = createRouteHref({
  path: '/search',
  search: tabCodec,
});
