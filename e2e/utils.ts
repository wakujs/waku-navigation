import { exec, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test as basicTest, expect } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';

const execAsync = promisify(exec);

export type TestOptions = {
  mode: 'DEV' | 'PRD';
  page: Page;
};

export const getAvailablePort = async (): Promise<number> => {
  const MIN_PORT = 10100;
  const MAX_PORT = 60000;
  const port = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT));
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on('error', () => {
      server.close(() => resolve(getAvailablePort()));
    });
    server.listen(port, () => {
      server.close(() => resolve(port));
    });
  });
};

const PORT_WAIT_TIMEOUT_MS = 30_000;

export const waitForPortReady = async (port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = createConnection(port);
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= PORT_WAIT_TIMEOUT_MS) {
          reject(new Error(`Timeout while waiting for port ${port}`));
          return;
        }
        setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });

const runShell = (command: string, cwd: string): ChildProcess =>
  spawn(command, {
    cwd,
    shell: true,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const terminate = async (cp: ChildProcess): Promise<void> => {
  if (cp.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    await execAsync(`taskkill /pid ${cp.pid} /t /f`);
  } else if (cp.pid) {
    process.kill(-cp.pid, 'SIGTERM');
  }
};

export const test = basicTest.extend<
  Omit<TestOptions, 'mode'>,
  Pick<TestOptions, 'mode'>
>({
  mode: ['DEV', { option: true, scope: 'worker' }],
  page: async ({ page }, pageUse, testInfo) => {
    const callback = (msg: ConsoleMessage) => {
      console.log(`(${testInfo.title}) ${msg.type()}: ${msg.text()}`);
    };
    page.on('console', callback);
    await pageUse(page);
    page.off('console', callback);
  },
});

// The lib compile and (for PRD) the example build happen once in
// global.setup.ts, so workers can run in parallel without racing on dist/.
export const prepareNormalSetup = (fixtureName: string) => {
  const waku = fileURLToPath(
    new URL('../node_modules/waku/dist/cli.js', import.meta.url),
  );
  const fixtureDir = fileURLToPath(
    new URL('../examples/' + fixtureName, import.meta.url),
  );
  const startApp = async (mode: 'DEV' | 'PRD') => {
    const cmd = mode === 'DEV' ? `node ${waku} dev` : `node ${waku} start`;
    const port = await getAvailablePort();
    const cp = runShell(`${cmd} -p ${port}`, fixtureDir);
    await waitForPortReady(port);
    const stopApp = async () => {
      await terminate(cp);
    };
    return { port, stopApp };
  };
  return startApp;
};

export async function waitForHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => {
      const el = document.body;
      if (!el) return false;
      return Object.getOwnPropertyNames(el).some((key) =>
        key.startsWith('__reactFiber'),
      );
    },
    null,
    { timeout: 60_000 },
  );
}

export const waitForSelectorText = async (
  page: Page,
  selector: string,
  text: string,
) => {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (selector) => document.querySelector(selector)?.textContent ?? null,
          selector,
        ),
      { timeout: 10_000 },
    )
    .toBe(text);
};
