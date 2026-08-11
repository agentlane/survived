import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildRepo, makeRepo, makeNonRepoDir, commit, cleanup } from './fixtures/repo.js';
import { runCli } from './fixtures/run-cli.js';

const dirs: string[] = [];
afterAll(() => dirs.forEach(cleanup));

function track<T extends string>(d: T): T {
  dirs.push(d);
  return d;
}

describe('error UX', () => {
  it('refuses shallow clones with unshallow instructions', () => {
    const { dir } = buildRepo([
      { message: 'one', date: '2024-01-01T12:00:00Z', files: { 'a.txt': 'a\n' } },
      { message: 'two', date: '2024-01-02T12:00:00Z', files: { 'b.txt': 'b\n' } },
    ]);
    track(dir);
    const target = track(makeNonRepoDir());
    const res = spawnSync('git', ['clone', '--depth', '1', '-q', `file://${dir}`, 'shallow'], {
      cwd: target,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    const shallow = join(target, 'shallow');

    for (const args of [[], ['scan']]) {
      const out = runCli(args, shallow);
      expect(out.status).toBe(1);
      expect(out.stderr).toContain('shallow');
      expect(out.stderr).toContain('git fetch --unshallow');
    }
  });

  it('warns on a detached HEAD but still analyses', () => {
    const dir = track(makeRepo());
    commit(dir, { message: 'one', date: '2024-01-01T12:00:00Z', files: { 'a.txt': 'a\n' } });
    commit(dir, { message: 'two', date: '2024-01-02T12:00:00Z', files: { 'b.txt': 'b\n' } });
    spawnSync('git', ['checkout', '-q', 'HEAD~1'], { cwd: dir, encoding: 'utf8' });

    const res = runCli([], dir);
    expect(res.status).toBe(0);
    expect(res.stderr.toLowerCase()).toContain('detached');
  });

  it('explains when no cohort is old enough to measure', () => {
    const dir = track(makeRepo());
    const sixty = Array.from({ length: 60 }, (_, i) => `x${i}`).join('\n') + '\n';
    commit(dir, {
      message: 'feat: engine\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
      date: '2024-01-01T12:00:00Z',
      files: { 'a.txt': sixty },
    });
    commit(dir, { message: 'later', date: '2024-01-06T12:00:00Z', files: { 'b.txt': 'b\n' } });

    const res = runCli([], dir);
    expect(res.status).toBe(0);
    expect(res.stdout.toLowerCase()).toContain('no cohort has reached 30 days');
    expect(res.stdout).not.toMatch(/\d+\.\d+%/);
  });
});

describe('--help examples', () => {
  it('shows usage examples', () => {
    const res = runCli(['--help'], track(makeNonRepoDir()));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Examples:');
    expect(res.stdout).toContain('survived --html --out report.html');
  });
});
