'use client';

import { Link, useRouter } from 'waku-navigation';

export function UserNav() {
  const { push } = useRouter();
  return (
    <>
      <Link
        to={{ to: '/user/[id]', params: { id: 'alice' } }}
        data-testid="user-link"
      >
        User alice
      </Link>
      <button
        type="button"
        data-testid="user-push"
        onClick={() => push({ to: '/user/[id]', params: { id: 'bob' } })}
      >
        Push user bob
      </button>
      <button
        type="button"
        data-testid="user-push-encoded"
        onClick={() => push({ to: '/user/[id]', params: { id: 'a b' } })}
      >
        Push user a b
      </button>
    </>
  );
}
