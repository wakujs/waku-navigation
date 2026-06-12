'use client';

import type { ReactNode } from 'react';
import { unstable_useNavigationStatus } from 'waku-navigation';

export function StatusLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  const { pending, ref } = unstable_useNavigationStatus<HTMLAnchorElement>();
  return (
    <a href={to} ref={ref}>
      {children}
      {pending ? <span data-testid="nav-status"> (navigating…)</span> : null}
    </a>
  );
}
