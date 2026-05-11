import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Compile the lib once before any webServer starts -- both example dev
// servers import waku-navigation through the linked dist/.
export default async function globalSetup() {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  await promisify(exec)('pnpm compile', { cwd: repoRoot });
}
