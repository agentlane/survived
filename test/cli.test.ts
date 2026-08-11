import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeRepo, makeNonRepoDir, commit, cleanup } from './fixtures/repo.js';
import { runCli } from './fixtures/run-cli.js';

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
