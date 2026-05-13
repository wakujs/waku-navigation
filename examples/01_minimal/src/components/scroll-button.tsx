'use client';

import { useRouter } from 'waku-navigation';

export function ScrollButton({
  to,
  scroll,
  testid,
}: {
  to: string;
  scroll: boolean;
  testid: string;
}) {
  const { push } = useRouter();
  return (
    <button
      type="button"
      data-testid={testid}
      style={{ position: 'fixed', top: 0, right: 0, zIndex: 1 }}
      onClick={() => push(to, { scroll })}
    >
      Push {to} (scroll={String(scroll)})
    </button>
  );
}
