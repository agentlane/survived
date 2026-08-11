import { runGit, runGitBuffer, runGitExitCode, GitError } from './run.js';

export { GitError };

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';

export interface Trailer {
  key: string;
  value: string;
}

export interface CommitInfo {
  hash: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerDate: string;
  message: string;
  trailers: Trailer[];
}

export interface LogOptions {
  ref?: string;
  since?: string;
  maxCount?: number;
}

export interface AddedRange {
  start: number;
  count: number;
}

export interface FileDiff {
  path: string;
  addedRanges: AddedRange[];
  addedLines: number;
}

export interface BlameLine {
  line: number;
  origin: string;
}

export interface CommitStats {
  added: number;
  deleted: number;
}

export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    const { stdout, exitCode } = await runGitExitCode(
      repoPath,
      ['rev-parse', '--is-inside-work-tree'],
      { allowExitCodes: [128] },
    );
    return exitCode === 0 && stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/** Shallow clones lack the history blame needs — callers must refuse them. */
export async function isShallowRepo(repoPath: string): Promise<boolean> {
  const stdout = await runGit(repoPath, ['rev-parse', '--is-shallow-repository']);
  return stdout.trim() === 'true';
}

/** Current branch name, or null on a detached HEAD. */
export async function headBranch(repoPath: string): Promise<string | null> {
  const { stdout, exitCode } = await runGitExitCode(
    repoPath,
    ['symbolic-ref', '--short', '-q', 'HEAD'],
    { allowExitCodes: [1] },
  );
  return exitCode === 0 ? stdout.trim() : null;
}

export async function log(repoPath: string, opts: LogOptions = {}): Promise<CommitInfo[]> {
  const format = [
    '%H', '%an', '%ae', '%aI', '%cI', '%B', '%(trailers:only=true,unfold=true)',
  ].join(FIELD_SEP);
  const args = ['log', `--format=${format}${RECORD_SEP}`];
  if (opts.maxCount !== undefined) args.push(`--max-count=${opts.maxCount}`);
  if (opts.since !== undefined) args.push(`--since=${opts.since}`);
  args.push(opts.ref ?? 'HEAD');
  const stdout = await runGit(repoPath, args);
  return stdout
    .split(RECORD_SEP)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.length > 0)
    .map((record) => {
      const fields = record.split(FIELD_SEP);
      if (fields.length !== 7) {
        throw new Error(`unexpected git log record shape (${fields.length} fields)`);
      }
      const [hash, authorName, authorEmail, authorDate, committerDate, message, trailerBlock] =
        fields as [string, string, string, string, string, string, string];
      return {
        hash,
        authorName,
        authorEmail,
        authorDate,
        committerDate,
        message: message.replace(/\n$/, ''),
        trailers: parseTrailers(trailerBlock),
      };
    });
}

/**
 * Added/deleted line counts per commit in a single subprocess
 * (`git log --numstat`). Binary files ("-" counts) and merge commits
 * (no numstat block by default) contribute zero.
 */
export async function logNumstat(repoPath: string, opts: LogOptions = {}): Promise<Map<string, CommitStats>> {
  const args = ['-c', 'core.quotePath=false', 'log', '--numstat', `--format=${RECORD_SEP}%H`];
  if (opts.maxCount !== undefined) args.push(`--max-count=${opts.maxCount}`);
  if (opts.since !== undefined) args.push(`--since=${opts.since}`);
  args.push(opts.ref ?? 'HEAD');
  const stdout = await runGit(repoPath, args);
  const stats = new Map<string, CommitStats>();
  for (const record of stdout.split(RECORD_SEP)) {
    const lines = record.split('\n').filter((l) => l.length > 0);
    const hash = lines[0];
    if (!hash) continue;
    let added = 0;
    let deleted = 0;
    for (const line of lines.slice(1)) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m) continue;
      if (m[1] !== '-') added += Number(m[1]);
      if (m[2] !== '-') deleted += Number(m[2]);
    }
    stats.set(hash, { added, deleted });
  }
  return stats;
}

function parseTrailers(block: string): Trailer[] {
  return block
    .split('\n')
    .filter((line) => line.includes(':'))
    .map((line) => {
      const idx = line.indexOf(':');
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    });
}

/**
 * Added-line ranges per file for a commit, from a zero-context diff against
 * its first parent. Files with no added lines are omitted. Merge commits use
 * git's default combined diff, whose `@@@` hunks match nothing here, so they
 * contribute no added lines — attribution treats merges as authored elsewhere.
 */
export async function showNumstatDiff(repoPath: string, commit: string): Promise<FileDiff[]> {
  const stdout = await runGit(repoPath, [
    '-c', 'core.quotePath=false',
    'show', '--format=', '--unified=0', '--no-color', '--no-renames', commit,
  ]);
  const files = new Map<string, AddedRange[]>();
  let current: string | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4);
      current = target === '/dev/null' ? null : target.replace(/^b\//, '');
      continue;
    }
    if (current !== null && line.startsWith('@@')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (count === 0) continue;
      const ranges = files.get(current) ?? [];
      ranges.push({ start, count });
      files.set(current, ranges);
    }
  }
  return [...files.entries()].map(([path, addedRanges]) => ({
    path,
    addedRanges,
    addedLines: addedRanges.reduce((n, r) => n + r.count, 0),
  }));
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newCount: number;
}

/**
 * Zero-context hunks for one file between two refs. Old-side line numbers
 * are in `fromRef` coordinates — the survival engine intersects them with a
 * commit's added ranges to split dead lines into rewritten vs deleted.
 */
export async function diffFileHunks(
  repoPath: string,
  fromRef: string,
  toRef: string,
  path: string,
): Promise<DiffHunk[]> {
  const stdout = await runGit(repoPath, [
    '-c', 'core.quotePath=false',
    'diff', '--unified=0', '--no-color', '--no-renames', fromRef, toRef, '--', path,
  ]);
  const hunks: DiffHunk[] = [];
  for (const line of stdout.split('\n')) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    hunks.push({
      oldStart: Number(m[1]),
      oldCount: m[2] === undefined ? 1 : Number(m[2]),
      newCount: m[3] === undefined ? 1 : Number(m[3]),
    });
  }
  return hunks;
}

/** Line -> origin commit at `ref`, via `git blame --porcelain`. */
export async function blameFile(repoPath: string, ref: string, path: string): Promise<BlameLine[]> {
  const stdout = await runGit(repoPath, [
    '-c', 'core.quotePath=false',
    'blame', '--porcelain', ref, '--', path,
  ]);
  const lines: BlameLine[] = [];
  for (const line of stdout.split('\n')) {
    const m = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(line);
    if (m) lines.push({ line: Number(m[2]), origin: m[1]! });
  }
  lines.sort((a, b) => a.line - b.line);
  return lines;
}

/**
 * Read-only view of refs/notes/<notesRef>: annotated commit -> note text.
 * Never writes notes (product contract).
 */
export async function readNotes(repoPath: string, notesRef: string): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  const { exitCode } = await runGitExitCode(
    repoPath,
    ['rev-parse', '--verify', '--quiet', `refs/notes/${notesRef}`],
    { allowExitCodes: [1] },
  );
  if (exitCode !== 0) return notes;

  const list = await runGit(repoPath, ['notes', `--ref=${notesRef}`, 'list']);
  const pairs = list
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => l.split(' ') as [string, string]);
  if (pairs.length === 0) return notes;

  const batch = await runGitBuffer(repoPath, ['cat-file', '--batch'], {
    stdin: pairs.map(([noteObj]) => noteObj).join('\n') + '\n',
  });

  let offset = 0;
  for (const [, commitHash] of pairs) {
    const headerEnd = batch.indexOf(0x0a, offset);
    if (headerEnd === -1) break;
    const header = batch.subarray(offset, headerEnd).toString('utf8');
    offset = headerEnd + 1;
    const parts = header.split(' ');
    if (parts[1] === 'missing') continue;
    const size = Number(parts[2]);
    const content = batch.subarray(offset, offset + size).toString('utf8');
    offset += size + 1; // trailing newline after each object body
    notes.set(commitHash, content.replace(/\n$/, ''));
  }
  return notes;
}
