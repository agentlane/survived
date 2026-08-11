import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isGitRepo,
  headBranch,
  log,
  logNumstat,
  showNumstatDiff,
  blameFile,
  readNotes,
  GitError,
} from '../src/git/index.js';
import { buildRepo, makeNonRepoDir, addNote, cleanup, type FixtureCommit } from './fixtures/repo.js';

function day(n: number): string {
  const d = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// 22 commits with controlled dates:
//  0     alpha.txt (5 lines)
//  1..18 f1.txt .. f18.txt (3 lines each); f7 commit carries an AI trailer,
//        f9 commit adds two files at once
//  19    modifies line 3 of alpha.txt
//  20    deletes f1.txt
//  21    beta.txt by a different author
const commits: FixtureCommit[] = [
  { message: 'add alpha', date: day(0), files: { 'alpha.txt': 'a1\na2\na3\na4\na5\n' } },
  ...Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    const c: FixtureCommit = {
      message: `add f${n}`,
      date: day(n),
      files: { [`f${n}.txt`]: `${n}-1\n${n}-2\n${n}-3\n` },
    };
    if (n === 7) {
      c.message = 'add f7\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
    }
    if (n === 9) {
      c.files['extra/nested.txt'] = 'x1\nx2\n';
    }
    return c;
  }),
  { message: 'rework alpha line 3', date: day(19), files: { 'alpha.txt': 'a1\na2\nA3-REWRITTEN\na4\na5\n' } },
  { message: 'drop f1', date: day(20), files: { 'f1.txt': null } },
  {
    message: 'add beta',
    date: day(21),
    files: { 'beta.txt': 'b1\nb2\n' },
    authorName: 'Other Person',
    authorEmail: 'other@example.com',
  },
];

let dir: string;
let hashes: string[];
let nonRepo: string;

beforeAll(() => {
  ({ dir, hashes } = buildRepo(commits));
  nonRepo = makeNonRepoDir();
  addNote(dir, 'ai', hashes[3]!, 'tool: test-agent');
});

afterAll(() => {
  cleanup(dir);
  cleanup(nonRepo);
});

describe('isGitRepo', () => {
  it('is true inside a repo', async () => {
    expect(await isGitRepo(dir)).toBe(true);
  });

  it('is false outside a repo', async () => {
    expect(await isGitRepo(nonRepo)).toBe(false);
  });
});

describe('headBranch', () => {
  it('returns the checked-out branch', async () => {
    expect(await headBranch(dir)).toBe('main');
  });
});

describe('log', () => {
  it('returns every commit, newest first, with exact dates', async () => {
    const entries = await log(dir);
    expect(entries).toHaveLength(22);
    expect(entries[0]!.hash).toBe(hashes[21]);
    expect(entries[21]!.hash).toBe(hashes[0]);
    // git >= 2.45 prints strict-ISO UTC dates with a Z suffix
    expect(entries[21]!.authorDate).toBe('2024-01-01T12:00:00Z');
    expect(entries[21]!.committerDate).toBe('2024-01-01T12:00:00Z');
  });

  it('carries author identity and message', async () => {
    const entries = await log(dir);
    const beta = entries.find((e) => e.hash === hashes[21])!;
    expect(beta.authorName).toBe('Other Person');
    expect(beta.authorEmail).toBe('other@example.com');
    expect(beta.message).toContain('add beta');
  });

  it('parses trailers', async () => {
    const entries = await log(dir);
    const f7 = entries.find((e) => e.hash === hashes[7])!;
    expect(f7.trailers).toEqual([
      { key: 'Co-Authored-By', value: 'Claude <noreply@anthropic.com>' },
    ]);
    const plain = entries.find((e) => e.hash === hashes[2])!;
    expect(plain.trailers).toEqual([]);
  });

  it('respects maxCount', async () => {
    const entries = await log(dir, { maxCount: 5 });
    expect(entries).toHaveLength(5);
  });

  it('fails loudly with git stderr on a bad ref', async () => {
    await expect(log(dir, { ref: 'no-such-ref' })).rejects.toThrowError(GitError);
    await expect(log(dir, { ref: 'no-such-ref' })).rejects.toThrowError(/no-such-ref/);
  });
});

describe('logNumstat', () => {
  it('returns added/deleted counts for every commit in one call', async () => {
    const stats = await logNumstat(dir);
    expect(stats.size).toBe(22);
    expect(stats.get(hashes[2]!)).toEqual({ added: 3, deleted: 0 });
    expect(stats.get(hashes[19]!)).toEqual({ added: 1, deleted: 1 });
    expect(stats.get(hashes[20]!)).toEqual({ added: 0, deleted: 3 });
  });

  it('respects maxCount', async () => {
    const stats = await logNumstat(dir, { maxCount: 3 });
    expect(stats.size).toBe(3);
  });
});

describe('showNumstatDiff', () => {
  it('reports added line ranges for a new file', async () => {
    const files = await showNumstatDiff(dir, hashes[2]!);
    expect(files).toEqual([
      { path: 'f2.txt', addedRanges: [{ start: 1, count: 3 }], addedLines: 3 },
    ]);
  });

  it('reports every file of a multi-file commit', async () => {
    const files = await showNumstatDiff(dir, hashes[9]!);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(['extra/nested.txt', 'f9.txt']);
    expect(files.reduce((n, f) => n + f.addedLines, 0)).toBe(5);
  });

  it('reports only the replaced line for a modification', async () => {
    const files = await showNumstatDiff(dir, hashes[19]!);
    expect(files).toEqual([
      { path: 'alpha.txt', addedRanges: [{ start: 3, count: 1 }], addedLines: 1 },
    ]);
  });

  it('reports no added lines for a pure deletion', async () => {
    const files = await showNumstatDiff(dir, hashes[20]!);
    expect(files).toEqual([]);
  });
});

describe('blameFile', () => {
  it('maps every line to its origin commit', async () => {
    const lines = await blameFile(dir, 'HEAD', 'alpha.txt');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({ line: 1, origin: hashes[0] });
    expect(lines[2]).toEqual({ line: 3, origin: hashes[19] });
    expect(lines[4]).toEqual({ line: 5, origin: hashes[0] });
  });

  it('fails loudly for a missing file', async () => {
    await expect(blameFile(dir, 'HEAD', 'nope.txt')).rejects.toThrowError(GitError);
  });
});

describe('readNotes', () => {
  it('returns commit -> note text for the given notes ref', async () => {
    const notes = await readNotes(dir, 'ai');
    expect(notes.size).toBe(1);
    expect(notes.get(hashes[3]!)).toBe('tool: test-agent');
  });

  it('returns an empty map when the notes ref does not exist', async () => {
    const notes = await readNotes(dir, 'does-not-exist');
    expect(notes.size).toBe(0);
  });
});
