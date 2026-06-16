import type { ReactNode } from 'react';
import { NavStatus } from '../components/nav-status.js';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <a href="/">Home</a>
        </li>
        <li>
          {/* href matching: nothing on the <a>, the consumer names the
              destination. Fires for any navigation to /slow. */}
          <a href="/slow">Slow (href)</a>
          <NavStatus
            match={{ href: '/slow' }}
            testid="status-href"
            label="Loading…"
          />
        </li>
        <li>
          {/* dataNavKey matching: independent per anchor. */}
          <a href="/slow" data-nav-key="slow">
            Slow
          </a>
          <NavStatus
            match={{ dataNavKey: 'slow' }}
            testid="pending"
            label="Loading…"
          />
        </li>
        <li>
          {/* Same href, different nav-key -- stays independent of "slow". */}
          <a href="/slow" data-nav-key="slow-alt">
            Slow (alt)
          </a>
          <NavStatus
            match={{ dataNavKey: 'slow-alt' }}
            testid="pending-alt"
            label="Loading (alt)…"
          />
        </li>
        <li>
          {/* Migration of `<Link>…<Consumer/></Link>`: the consumer lives
              inside the <a>, correlated by the shared nav-key. */}
          <a href="/slow" data-nav-key="slow-status">
            Slow (status)
            <NavStatus
              match={{ dataNavKey: 'slow-status' }}
              testid="nav-status"
              label="(navigating…)"
            />
          </a>
        </li>
      </ul>
      {/* Matches no <a> and no destination here: this never reports pending. */}
      <NavStatus
        match={{ dataNavKey: 'unused' }}
        testid="nav-status-outside"
        label="(navigating…)"
      />
      <main>{children}</main>
    </>
  );
}
