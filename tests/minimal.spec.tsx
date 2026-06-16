import { expect, test } from 'vitest';
import {
  Router,
  Slice,
  unstable_useNavigationStatus,
  useRouter,
} from 'waku-navigation';

test('exports', () => {
  expect(Router).toBeDefined();
  expect(Slice).toBeDefined();
  expect(useRouter).toBeDefined();
  expect(unstable_useNavigationStatus).toBeDefined();
});
