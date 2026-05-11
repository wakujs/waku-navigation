import type { PlaywrightTestProject } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';
import type { TestOptions } from './e2e/utils.js';

// Navigation API is currently only implemented in Chromium-based browsers,
// so we only test against chromium here.
const config = defineConfig<TestOptions>({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 10_000 : 5_000,
  },
  use: {
    viewport: { width: 1440, height: 800 },
    locale: 'en-US',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ].flatMap<PlaywrightTestProject<TestOptions>>((item) => [
    {
      ...item,
      name: `${item.name}-dev`,
      use: {
        ...item.use,
        mode: 'DEV',
      },
    },
    {
      ...item,
      name: `${item.name}-prd`,
      use: {
        ...item.use,
        mode: 'PRD',
      },
    },
  ]),
  forbidOnly: !!process.env.CI,
  // Each spec file's beforeAll spawns a `waku dev`/`start` server + a
  // Chromium context, so even with the default 4 workers we'd quickly hit
  // resource limits in constrained environments. Keep parallelism low.
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
});

export default config;
