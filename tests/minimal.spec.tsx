import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { unstable_createRouteHref as createRouteHref } from 'waku/router';
import {
  Link,
  Router,
  Slice,
  useNavigationStatus_UNSTABLE,
  useRouter,
} from 'waku-navigation';

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
