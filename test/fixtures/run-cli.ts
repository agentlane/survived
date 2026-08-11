import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));
// Absolute specifier: the spawned process runs with cwd outside this project,
// so a bare "tsx" would not resolve.
const tsxUrl = import.meta.resolve('tsx');

export function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, ['--import', tsxUrl, cliPath, ...args], {
    cwd,
    encoding: 'utf8',
  });
}
