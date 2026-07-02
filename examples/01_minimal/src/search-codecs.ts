import type { Unstable_SearchCodec } from 'waku/router';

export const tabCodec: Unstable_SearchCodec<{ tab: string }> = {
  id: 'tab',
  parse: (query) => ({
    tab: new URLSearchParams(query).get('tab') ?? 'home',
  }),
  serialize: (search) => new URLSearchParams({ tab: search.tab }).toString(),
};
