'use client';

import { useParams_UNSTABLE } from 'waku-navigation';

export function UserParams() {
  const params = useParams_UNSTABLE({ from: '/user/[id]' });
  return (
    <p data-testid="user-params-id">params.id: {params?.id ?? '(none)'}</p>
  );
}
