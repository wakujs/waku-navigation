'use client';

import { useRouter } from 'waku-navigation';

export function RouteInfo() {
  const { path, query, hash } = useRouter();
  return (
    <div data-testid="route-info">
      {`path=${path};query=${query};hash=${hash}`}
    </div>
  );
}
