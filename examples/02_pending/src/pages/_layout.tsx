import type { ReactNode } from 'react';
import { Link } from 'waku-navigation';
import { NavStatus } from '../components/nav-status.js';
import { ViewTransitionLink } from '../components/view-transition-link.js';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ul>
        <li>
          {/* A plain <a> still navigates client-side: no type-safe `to`, no
              prefetch, no navigation status. */}
          <a href="/">Home</a>
        </li>
        <li>
          {/* <Link> adds the type-safe `to`, prefetch, and per-link status.
              The consumer lives inside and reads it by context -- no ids. */}
          <Link to="/slow">
            Slow <NavStatus testid="pending" label="(loading…)" />
          </Link>
        </li>
        <li>
          {/* A second <Link> to the same route stays independent on click;
              this one also prefetches when the pointer enters it. */}
          <Link to="/slow" unstable_prefetchOnEnter>
            Slow (alt) <NavStatus testid="pending-alt" label="(loading…)" />
          </Link>
        </li>
        <li>
          {/* View Transitions: unstable_startTransition is a function, so it
              lives in a client component. Status is bypassed, so it stays
              dark. */}
          <ViewTransitionLink />
        </li>
      </ul>
      <main>{children}</main>
    </>
  );
}
