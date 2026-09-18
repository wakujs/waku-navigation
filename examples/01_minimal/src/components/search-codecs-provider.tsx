'use client';

import type { ReactNode } from 'react';
import { SearchCodecsProvider_UNSTABLE } from 'waku-navigation';
import { tabCodec } from '../search-codecs.js';

export function SearchCodecs({ children }: { children: ReactNode }) {
  return (
    <SearchCodecsProvider_UNSTABLE searchCodecs={[tabCodec]}>
      {children}
    </SearchCodecsProvider_UNSTABLE>
  );
}
