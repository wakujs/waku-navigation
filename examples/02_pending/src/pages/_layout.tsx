import type { ReactNode } from 'react';
import { Pending } from 'waku-navigation';
import { StatusLink } from '../components/status-link.js';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <a href="/">Home</a>
        </li>
        <li>
          <Pending fallback={<span data-testid="pending"> Loading…</span>}>
            <a href="/slow">Slow</a>
          </Pending>
        </li>
        <li>
          <Pending
            fallback={<span data-testid="pending-alt"> Loading (alt)…</span>}
          >
            <a href="/slow">Slow (alt)</a>
          </Pending>
        </li>
        <li>
          <StatusLink to="/slow">Slow (status)</StatusLink>
        </li>
      </ul>
      <main>{children}</main>
    </>
  );
}
