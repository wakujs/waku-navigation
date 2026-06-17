'use client';

import { Link } from 'waku-navigation';
import { NavStatus } from './nav-status.js';

// unstable_startTransition is a function, so it has to be passed from a client
// component (RSC can't send functions from the server). It wraps the route
// commit in the View Transitions API; status is bypassed while it's set.
export function ViewTransitionLink() {
  return (
    <Link
      to="/slow"
      unstable_startTransition={(fn) => {
        if (document.startViewTransition) {
          document.startViewTransition(() => fn());
        } else {
          fn();
        }
      }}
    >
      Slow (view transition){' '}
      <NavStatus testid="pending-vt" label="(loading…)" />
    </Link>
  );
}
