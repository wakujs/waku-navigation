'use client';

import { use } from 'react';

// A client-side delay AFTER the server has responded. The promise is
// created once per page load and cached; once it resolves, future renders
// get the resolved value immediately.
const CLIENT_DELAY_MS = 800;
let cached: Promise<string> | null = null;
const getDelayedData = () => {
  if (!cached) {
    cached = new Promise<string>((resolve) => {
      setTimeout(() => resolve('client data loaded'), CLIENT_DELAY_MS);
    });
  }
  return cached;
};

export function SlowClientData() {
  const data = use(getDelayedData());
  return <p data-testid="slow-data">{data}</p>;
}
