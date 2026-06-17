'use client';

import { Suspense, startTransition, use, useState } from 'react';

// Each click loads a "batch" that suspends ~1s. There is NO custom pending UI
// on purpose: React's default onDefaultTransitionIndicator (React >=19.2)
// already drives the browser's native loading spinner for the duration of the
// transition (visible in Chromium). It does that by firing a fake navigation
// tagged info: 'react-transition', which the router deliberately ignores -- so
// this in-page transition never turns into a route refetch.
const batchCache = new Map<number, Promise<string>>();
const loadBatch = (n: number) => {
  let promise = batchCache.get(n);
  if (!promise) {
    promise = new Promise((resolve) =>
      setTimeout(() => resolve(`batch #${n} loaded`), 1000),
    );
    batchCache.set(n, promise);
  }
  return promise;
};

function Batch({ n }: { n: number }) {
  if (n === 0) return <span data-testid="batch">no batch yet</span>;
  return <span data-testid="batch">{use(loadBatch(n))}</span>;
}

export function NativeSpinnerDemo() {
  const [n, setN] = useState(0);
  return (
    <p>
      <button
        data-testid="load-batch"
        onClick={() => startTransition(() => setN((v) => v + 1))}
      >
        Load batch
      </button>{' '}
      <Suspense fallback={<span>loading…</span>}>
        <Batch n={n} />
      </Suspense>
    </p>
  );
}
