'use client';

import { useNavigationStatus_UNSTABLE } from 'waku-navigation';

// Renders `label` while the enclosing <Link>'s navigation is in flight.
// Reads the status by context -- no ref, no id, no wrapper.
export function NavStatus({
  testid,
  label,
}: {
  testid: string;
  label: string;
}) {
  const { pending } = useNavigationStatus_UNSTABLE();
  return pending ? <span data-testid={testid}> {label}</span> : null;
}
