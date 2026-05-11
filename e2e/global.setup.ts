import { exec } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Runs once before any worker starts, so concurrent workers don't race on the
// same `dist/` directories.
export default async function globalSetup() {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  // Compile the lib to dist/ -- the example imports waku-navigation through
  // the linked package, which resolves via package.json exports to dist/.
  await execAsync('pnpm compile', { cwd: repoRoot });

  // Only PRD tests need a built example; skip when running dev-only.
  const projectArgs = process.argv.filter((arg) => arg.startsWith('--project'));
  const wantsPrd =
    projectArgs.length === 0 || projectArgs.some((arg) => arg.includes('-prd'));
  if (!wantsPrd) return;

  const fixtureDir = fileURLToPath(
    new URL('../examples/01_minimal', import.meta.url),
  );
  const waku = fileURLToPath(
    new URL('../node_modules/waku/dist/cli.js', import.meta.url),
  );
  rmSync(`${fixtureDir}/dist`, { recursive: true, force: true });
  await execAsync(`node ${waku} build`, { cwd: fixtureDir });
}
