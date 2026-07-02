'use client';

import { useSearch_UNSTABLE, useSetSearch_UNSTABLE } from 'waku-navigation';

export function SearchControls() {
  const search = useSearch_UNSTABLE({ from: '/search' });
  const setSearch = useSetSearch_UNSTABLE({ from: '/search' });
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
    </>
  );
}
