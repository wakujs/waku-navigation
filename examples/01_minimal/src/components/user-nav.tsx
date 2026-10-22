'use client';

import { Link, useRouter } from 'waku-navigation';
import { userRoute } from '../routes.js';

export function UserNav() {
  const { push } = useRouter();
  return (
    <>
      <Link to={userRoute({ params: { id: 'alice' } })} data-testid="user-link">
        User alice
      </Link>
      <button
        type="button"
        data-testid="user-push"
        onClick={() => push(userRoute({ params: { id: 'bob' } }))}
      >
        Push user bob
      </button>
      <button
        type="button"
        data-testid="user-push-encoded"
        onClick={() => push(userRoute({ params: { id: 'a b' } }))}
      >
        Push user a b
      </button>
    </>
  );
}
