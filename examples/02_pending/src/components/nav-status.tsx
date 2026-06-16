'use client';

import { unstable_useNavigationStatus } from 'waku-navigation';

// Shows `label` while a matching navigation is in flight. `match` is either
// { href } (any navigation to that destination) or { dataNavKey } (the specific
// <a data-nav-key={...}>). Correlated purely by the match -- no ref, no wrapper.
export function NavStatus({
  match,
  testid,
  label,
}: {
  match: { href?: string; dataNavKey?: string };
  testid: string;
  label: string;
}) {
  const { pending } = unstable_useNavigationStatus(match);
  return pending ? <span data-testid={testid}> {label}</span> : null;
}
