'use client';

import {
  Link,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from 'waku-navigation';
import { searchRoute } from '../routes.js';

export function SearchControls() {
  const search = useSearch_UNSTABLE(searchRoute);
  const setSearch = useSetSearch_UNSTABLE(searchRoute);
  return (
    <>
      <h1>Search</h1>
      <p data-testid="search-tab">tab: {search?.tab ?? '(none)'}</p>
      <button
        type="button"
        data-testid="set-tab-faq"
        onClick={() => setSearch({ tab: 'faq' })}
      >
        Show FAQ
      </button>
      <button
        type="button"
        data-testid="set-tab-updater"
        onClick={() => setSearch((prev) => ({ tab: `${prev.tab}-x` }))}
      >
        Append -x
      </button>
      <Link
        to={searchRoute({ search: { tab: 'pricing' } })}
        data-testid="search-link-pricing"
      >
        Pricing
      </Link>
    </>
  );
}
