import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildRepo, makeRepo, makeNonRepoDir, commit, addNote, cleanup, type FixtureCommit } from './fixtures/repo.js';
import { runCli } from './fixtures/run-cli.js';
import { scanRepo } from '../src/attribution/scan.js';

function lines(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`).join('\n') + '\n';
}

// Planted attribution fixture. Added-line totals:
//   c0 3, c1 60 (trailer), c2 5 (trailer), c3 4 (note), c4 3 (author),
//   c5 2 (github-actions, must stay unattributed), c6 10 (heuristic S1+S4+S3),
//   c7 320 (heuristic S2+S3)
// total 407; high 72 (17.7%); estimated 330 (81.1%)
const commits: FixtureCommit[] = [
  { message: 'chore: seed', date: '2024-03-01T12:00:00Z', files: { 'README.md': lines('r', 3) } },
  {
    message: 'feat: add engine\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    date: '2024-03-02T12:00:00Z',
    files: { 'engine.ts': lines('e', 60) },
  },
  {
    message: 'docs: update guide\n\nAssisted-by: aider',
    date: '2024-03-03T12:00:00Z',
    files: { 'guide.md': lines('g', 5) },
  },
  { message: 'refactor: tidy io', date: '2024-03-04T12:00:00Z', files: { 'io.ts': lines('i', 4) } },
  {
    message: 'fix: adjust retry',
    date: '2024-03-05T12:00:00Z',
    files: { 'retry.ts': lines('t', 3) },
    authorName: 'devin-ai-integration[bot]',
    authorEmail: 'devin@devin.ai',
  },
  {
    message: 'chore: bump deps',
    date: '2024-03-06T12:00:00Z',
    files: { 'deps.txt': lines('d', 2) },
    authorName: 'github-actions',
    authorEmail: 'github-actions[bot]@users.noreply.github.com',
  },
  {
    message: 'add parser module\n\n- handle comments\n- support nested blocks\n\nGenerated with Claude Code',
    date: '2024-03-07T12:00:00Z',
    files: { 'parser.ts': lines('p', 10) },
  },
  { message: 'add parser tests', date: '2024-03-07T12:01:00Z', files: { 'parser.test.ts': lines('s', 320) } },
];

let dir: string;
let hashes: string[];

beforeAll(() => {
  ({ dir, hashes } = buildRepo(commits));
  addNote(dir, 'ai', hashes[3]!, 'tool: cursor');
});

afterAll(() => cleanup(dir));

describe('scanRepo', () => {
  it('classifies every planted commit exactly', async () => {
    const { attributions } = await scanRepo(dir, { heuristics: true });
    const classified = hashes.map((h, i) => ({
      subject: commits[i]!.message.split('\n')[0],
      ...(attributions.get(h)
        ? {
            source: attributions.get(h)!.source,
            confidence: attributions.get(h)!.confidence,
            tool: attributions.get(h)!.tool,
          }
        : { source: null }),
    }));
    expect(classified).toMatchSnapshot();
    expect(attributions.size).toBe(6);
  });

  it('computes the coverage summary', async () => {
    const { summary } = await scanRepo(dir, { heuristics: true });
    expect(summary.totalCommits).toBe(8);
    expect(summary.totalAddedLines).toBe(407);
    expect(summary.high).toEqual({ commits: 4, lines: 72 });
    expect(summary.estimated).toEqual({ commits: 2, lines: 330 });
    expect(summary.perDetector).toEqual({ trailer: 2, notes: 1, author: 1, heuristic: 2 });
  });

  it('--no-heuristics drops exactly the estimated tier', async () => {
    const { summary, attributions } = await scanRepo(dir, { heuristics: false });
    expect(summary.high).toEqual({ commits: 4, lines: 72 });
    expect(summary.estimated).toEqual({ commits: 0, lines: 0 });
    expect(summary.perDetector.heuristic).toBe(0);
    expect(attributions.size).toBe(4);
  });
});

describe('survived scan (CLI)', () => {
  it('prints attribution coverage with labelled tiers', () => {
    const res = runCli(['scan'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('8'); // total commits
    expect(res.stdout).toContain('high');
    expect(res.stdout).toContain('estimated');
    expect(res.stdout).toContain('17.7%');
    expect(res.stdout).toContain('81.1%');
    expect(res.stdout).toMatch(/trailer\s+2/);
    expect(res.stdout).toMatch(/heuristic\s+2/);
  });

  it('--no-heuristics removes the estimated tier from the output', () => {
    const res = runCli(['scan', '--no-heuristics'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('17.7%');
    expect(res.stdout).not.toContain('81.1%');
    expect(res.stdout).toMatch(/heuristic\s+0/);
  });

  it('prints the low-coverage honesty message instead of percentages when markers are absent', () => {
    const plain = makeRepo();
    commit(plain, { message: 'seed', date: '2024-03-01T12:00:00Z', files: { 'a.txt': 'a\n' } });
    try {
      const res = runCli(['scan'], plain);
      expect(res.status).toBe(0);
      expect(res.stdout.toLowerCase()).toContain('too low');
      expect(res.stdout).not.toMatch(/\d+(\.\d+)?%/);
    } finally {
      cleanup(plain);
    }
  });

  it('exits 1 outside a git repository', () => {
    const nonRepo = makeNonRepoDir();
    try {
      const res = runCli(['scan'], nonRepo);
      expect(res.status).toBe(1);
      expect(res.stderr.toLowerCase()).toContain('not a git repository');
    } finally {
      cleanup(nonRepo);
    }
  });
});
