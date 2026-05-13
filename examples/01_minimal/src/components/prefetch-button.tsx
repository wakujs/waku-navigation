'use client';

import { useRouter } from 'waku-navigation';

export function PrefetchButton({ to }: { to: string }) {
  const { prefetch } = useRouter();
  return (
    <button
      type="button"
      data-testid="prefetch"
      data-prefetch-target={to}
      onClick={() => prefetch(to)}
    >
      Prefetch {to}
    </button>
  );
}
