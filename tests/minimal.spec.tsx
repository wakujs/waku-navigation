import { cleanup, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { unstable_createRouteHref as createRouteHref } from 'waku/router';
import {
  Link,
  Router,
  Slice,
  useNavigationStatus_UNSTABLE,
  useRouter,
} from 'waku-navigation';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('exports', () => {
  expect(Router).toBeDefined();
  expect(Slice).toBeDefined();
  expect(useRouter).toBeDefined();
  expect(useNavigationStatus_UNSTABLE).toBeDefined();
});

test('a constructed href keeps its encoded params under the configured base path', () => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
  try {
    const userRoute = createRouteHref({ path: '/user/[id]' });
    const html = renderToString(
      <Link to={userRoute({ params: { id: 'a b' } })}>User</Link>,
    );
    expect(html).toContain('href="/app/user/a%20b"');
  } finally {
    vi.unstubAllEnvs();
  }
});

test.each(['push', 'replace'] as const)(
  '%s applies the configured base path to a constructed href',
  async (method) => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    const navigate = vi.fn((_to: string, _options: unknown) => ({
      finished: Promise.resolve(),
    }));
    vi.stubGlobal('navigation', { navigate });
    const { result } = renderHook(useRouter);
    const userRoute = createRouteHref({ path: '/user/[id]' });

    await result.current[method](userRoute({ params: { id: 'a b' } }));

    expect(navigate).toHaveBeenCalledWith('/app/user/a%20b', {
      history: method,
      info: { scroll: undefined },
    });
  },
);

test('prefetch accepts a constructed href under the configured base path', () => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
  const { result } = renderHook(useRouter);
  const userRoute = createRouteHref({ path: '/user/[id]' });

  expect(() =>
    result.current.prefetch(userRoute({ params: { id: 'a b' } })),
  ).not.toThrow();
});
