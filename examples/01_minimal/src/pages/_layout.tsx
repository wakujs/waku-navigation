import type { ReactNode } from 'react';
import { EventLog } from '../components/event-log.js';
import { RouteInfo } from '../components/route-info.js';

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <a href="/">Home</a>
        </li>
        <li>
          <a href="/about">About</a>
        </li>
      </ul>
      <RouteInfo />
      <EventLog />
      <main>{children}</main>
    </>
  );
}
