'use client';

import type { ReactNode } from 'react';
import { Unstable_SearchCodecsProvider } from 'waku-navigation';
import { tabCodec } from '../search-codecs.js';

export function SearchCodecs({ children }: { children: ReactNode }) {
  return (
    <Unstable_SearchCodecsProvider searchCodecs={[tabCodec]}>
      {children}
    </Unstable_SearchCodecsProvider>
  );
}
