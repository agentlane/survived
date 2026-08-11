import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRepo, makeNonRepoDir, commit, cleanup } from './fixtures/repo.js';

const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
// Absolute specifier: the spawned process runs with cwd outside this project,
// so a bare "tsx" would not resolve.
const tsxUrl = import.meta.resolve('tsx');

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, ['--import', tsxUrl, cliPath, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

let repo: string;
let nonRepo: string;

beforeAll(() => {
  repo = makeRepo();
  commit(repo, { message: 'seed', date: '2024-01-01T12:00:00Z', files: { 'a.txt': 'a\n' } });
  nonRepo = makeNonRepoDir();
});

afterAll(() => {
  cleanup(repo);
  cleanup(nonRepo);
});

describe('survived CLI', () => {
  it('prints the version', () => {
    const res = runCli(['--version'], nonRepo);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('0.1.0');
  });

  it('prints help', () => {
    const res = runCli(['--help'], nonRepo);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage');
    expect(res.stdout).toContain('survived');
  });

  it('exits 1 with a clear message outside a git repository', () => {
    const res = runCli([], nonRepo);
    expect(res.status).toBe(1);
    expect(res.stderr.toLowerCase()).toContain('not a git repository');
  });

  it('exits 0 inside a git repository', () => {
    const res = runCli([], repo);
    expect(res.status).toBe(0);
  });
});
