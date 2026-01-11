# waku-navigation

Experimental Waku Router implementation with Navigation API

## Install

```bash
npm install waku-navigation
```

## Usage

Create this file as `./src/waku.client.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku-navigation';

const rootElement = (
  <StrictMode>
    <Router />
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
```
