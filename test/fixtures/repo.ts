import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export interface FixtureCommit {
  message: string;
  /** ISO 8601 date used for both author and committer date. */
  date: string;
  /** path -> content; null deletes the file. */
  files: Record<string, string | null>;
  authorName?: string;
  authorEmail?: string;
}

function git(dir: string, args: string[], env?: Record<string, string>): string {
  const res = spawnSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) {
    throw new Error(`fixture git ${args.join(' ')} failed: ${res.stderr}`);
  }
  return res.stdout;
}

export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'survived-fixture-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.name', 'Fixture Human']);
  git(dir, ['config', 'user.email', 'human@example.com']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

export function makeNonRepoDir(): string {
  return mkdtempSync(join(tmpdir(), 'survived-nonrepo-'));
}

export function commit(dir: string, c: FixtureCommit): string {
  for (const [path, content] of Object.entries(c.files)) {
    const full = join(dir, path);
    if (content === null) {
      unlinkSync(full);
    } else {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }
  git(dir, ['add', '-A']);
  const env: Record<string, string> = {
    GIT_AUTHOR_DATE: c.date,
    GIT_COMMITTER_DATE: c.date,
  };
  if (c.authorName) env.GIT_AUTHOR_NAME = c.authorName;
  if (c.authorEmail) env.GIT_AUTHOR_EMAIL = c.authorEmail;
  git(dir, ['commit', '-q', '-m', c.message], env);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

export function buildRepo(commits: FixtureCommit[]): { dir: string; hashes: string[] } {
  const dir = makeRepo();
  const hashes = commits.map((c) => commit(dir, c));
  return { dir, hashes };
}

export function addNote(dir: string, notesRef: string, commitHash: string, text: string): void {
  git(dir, ['notes', `--ref=${notesRef}`, 'add', '-f', '-m', text, commitHash]);
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
