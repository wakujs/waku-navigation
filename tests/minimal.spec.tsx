import { expect, test } from 'vitest';
import {
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
