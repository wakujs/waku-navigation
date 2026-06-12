import { expect, test } from 'vitest';
import {
  Pending,
  Router,
  Slice,
  unstable_useNavigationStatus,
  useRouter,
} from 'waku-navigation';

test('exports', () => {
  expect(Router).toBeDefined();
  expect(Pending).toBeDefined();
  expect(Slice).toBeDefined();
  expect(useRouter).toBeDefined();
  expect(unstable_useNavigationStatus).toBeDefined();
});
