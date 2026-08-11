import { join } from 'node:path';
import {
  log,
  logNumstat,
  showNumstatDiff,
  blameFile,
  diffFileHunks,
  GitError,
  type CommitInfo,
  type FileDiff,
  type DiffHunk,
} from '../git/index.js';
import { attributeCommits, type Attribution } from '../attribution/index.js';
import { readAiNotes } from '../attribution/scan.js';
import { DiskCache } from '../cache/index.js';
import { mapLimit } from './pool.js';
import { SnapshotIndex } from './snapshots.js';
import { classifyDead } from './classify.js';
import { seededSample, DEFAULT_SEED } from './sample.js';
import {
  TIMEPOINT_DAYS,
  TIMEPOINT_KEYS,
  emptyStats,
  type TimepointKey,
  type SurvivalStats,
  type SurvivalReport,
  type BreakdownRow,
  type ToolRow,
} from './types.js';

const DAY_MS = 86_400_000;
const CONCURRENCY = 8;
const MAX_HUMAN_SAMPLE = 500;
/** Separator for composite keys — NUL never appears in refs or paths. */
const SEP = '\u0000';

export interface EngineOptions {
  heuristics?: boolean;
  /** Analyse only commits with committer date >= this ISO date. */
  since?: string;
  /** Analyse only the newest N commits. */
  maxCommits?: number;
  cacheDir?: string;
  seed?: number;
}

interface BlameSummary {
  exists: boolean;
  counts: Record<string, number>;
}

interface Cohort {
  commit: CommitInfo;
  attribution: Attribution | null; // null = sampled human baseline commit
}

interface Task {
  cohort: Cohort;
  file: FileDiff;
  tKey: TimepointKey;
  snapshot: string;
}

interface Outcome {
  cohort: Cohort;
  file: string;
  tKey: TimepointKey;
  surviving: number;
  rewritten: number;
  deleted: number;
  notYet: number;
}

function topLevelDir(path: string): string {
  const idx = path.indexOf('/');
  return idx === -1 ? '.' : path.slice(0, idx);
}

export async function analyseSurvival(repoPath: string, opts: EngineOptions = {}): Promise<SurvivalReport> {
  const heuristics = opts.heuristics ?? true;
  const seed = opts.seed ?? DEFAULT_SEED;
  const cache = new DiskCache(opts.cacheDir ?? join(repoPath, '.survived', 'cache'));

  const [allCommits, numstat, notes] = await Promise.all([
    log(repoPath),
    logNumstat(repoPath),
    readAiNotes(repoPath),
  ]);
  const snapshots = new SnapshotIndex(allCommits);

  let analysed = allCommits; // newest first
  if (opts.since !== undefined) {
    const cutoff = Date.parse(opts.since);
    analysed = analysed.filter((c) => Date.parse(c.committerDate) >= cutoff);
  }
  if (opts.maxCommits !== undefined) analysed = analysed.slice(0, opts.maxCommits);

  const attributions = attributeCommits(analysed, notes, numstat, { heuristics });
  const aiCohorts: Cohort[] = analysed
    .filter((c) => attributions.has(c.hash))
    .map((c) => ({ commit: c, attribution: attributions.get(c.hash)! }));
  const humanPool = analysed.filter((c) => !attributions.has(c.hash));
  const sampled = seededSample(humanPool, Math.min(MAX_HUMAN_SAMPLE, humanPool.length), seed);
  const cohorts: Cohort[] = [...aiCohorts, ...sampled.map((c) => ({ commit: c, attribution: null }))];

  // Added-line ranges per cohort commit (cached by immutable commit hash).
  const filesByCommit = new Map<string, FileDiff[]>();
  await mapLimit(cohorts, CONCURRENCY, async ({ commit }) => {
    const key = `added:v1:${commit.hash}`;
    let files = await cache.get<FileDiff[]>(key);
    if (files === undefined) {
      files = await showNumstatDiff(repoPath, commit.hash);
      await cache.set(key, files);
    }
    filesByCommit.set(commit.hash, files);
  });

  // Expand cohorts into per-(file, timepoint) work; young cohorts short-circuit.
  const outcomes: Outcome[] = [];
  const tasks: Task[] = [];
  for (const cohort of cohorts) {
    const files = filesByCommit.get(cohort.commit.hash) ?? [];
    const baseEpoch = Date.parse(cohort.commit.committerDate);
    TIMEPOINT_DAYS.forEach((days, i) => {
      const tKey = TIMEPOINT_KEYS[i]!;
      const atEpoch = baseEpoch + days * DAY_MS;
      if (!snapshots.measurable(atEpoch)) {
        for (const file of files) {
          outcomes.push({ cohort, file: file.path, tKey, surviving: 0, rewritten: 0, deleted: 0, notYet: file.addedLines });
        }
        return;
      }
      const snapshot = snapshots.refAt(atEpoch);
      if (snapshot === null) return; // unreachable: the cohort commit itself qualifies
      for (const file of files) tasks.push({ cohort, file, tKey, snapshot });
    });
  }

  // Blame once per unique (snapshot, file) — shared across cohorts and timepoints.
  const blameKeys = [...new Set(tasks.map((t) => `${t.snapshot}${SEP}${t.file.path}`))];
  const blames = new Map<string, BlameSummary>();
  await mapLimit(blameKeys, CONCURRENCY, async (key) => {
    const [ref, path] = key.split(SEP) as [string, string];
    const cacheKey = `blame:v1:${ref}:${path}`;
    let summary = await cache.get<BlameSummary>(cacheKey);
    if (summary === undefined) {
      summary = await computeBlame(repoPath, ref, path);
      await cache.set(cacheKey, summary);
    }
    blames.set(key, summary);
  });

  const taskOutcomes = await mapLimit(tasks, CONCURRENCY, async (task): Promise<Outcome> => {
    const { cohort, file, tKey, snapshot } = task;
    const blame = blames.get(`${snapshot}${SEP}${file.path}`)!;
    if (!blame.exists) {
      return { cohort, file: file.path, tKey, surviving: 0, rewritten: 0, deleted: file.addedLines, notYet: 0 };
    }
    const surviving = Math.min(blame.counts[cohort.commit.hash] ?? 0, file.addedLines);
    const dead = file.addedLines - surviving;
    if (dead === 0) {
      return { cohort, file: file.path, tKey, surviving, rewritten: 0, deleted: 0, notYet: 0 };
    }
    const cacheKey = `deadc:v1:${cohort.commit.hash}:${snapshot}:${file.path}`;
    let hunks = await cache.get<DiffHunk[]>(cacheKey);
    if (hunks === undefined) {
      hunks = await diffFileHunks(repoPath, cohort.commit.hash, snapshot, file.path);
      await cache.set(cacheKey, hunks);
    }
    const { rewritten, deleted } = classifyDead(file.addedRanges, hunks, dead);
    return { cohort, file: file.path, tKey, surviving, rewritten, deleted, notYet: 0 };
  });
  outcomes.push(...taskOutcomes);

  return aggregate(analysed, aiCohorts, sampled, humanPool, outcomes, seed);
}

async function computeBlame(repoPath: string, ref: string, path: string): Promise<BlameSummary> {
  try {
    const lines = await blameFile(repoPath, ref, path);
    const counts: Record<string, number> = {};
    for (const l of lines) counts[l.origin] = (counts[l.origin] ?? 0) + 1;
    return { exists: true, counts };
  } catch (e) {
    if (e instanceof GitError && /no such path/i.test(e.stderr)) {
      return { exists: false, counts: {} };
    }
    throw e;
  }
}

function aggregate(
  analysed: CommitInfo[],
  aiCohorts: Cohort[],
  sampled: CommitInfo[],
  humanPool: CommitInfo[],
  outcomes: Outcome[],
  seed: number,
): SurvivalReport {
  const ai = { high: emptyStats(), estimated: emptyStats() };
  const human = emptyStats();
  const byDirectory = new Map<string, BreakdownRow>();
  const byMonth = new Map<string, BreakdownRow>();
  const byTool = new Map<string, ToolRow>();

  const row = (map: Map<string, BreakdownRow>, key: string): BreakdownRow => {
    let r = map.get(key);
    if (!r) {
      r = { key, ai: emptyStats(), human: emptyStats() };
      map.set(key, r);
    }
    return r;
  };

  const add = (stats: SurvivalStats, o: Outcome): void => {
    const tp = stats[o.tKey];
    tp.surviving += o.surviving;
    tp.rewritten += o.rewritten;
    tp.deleted += o.deleted;
    tp.measurableLines += o.surviving + o.rewritten + o.deleted;
    tp.notYetMeasurableLines += o.notYet;
  };

  for (const o of outcomes) {
    const { attribution } = o.cohort;
    const dir = topLevelDir(o.file);
    const month = o.cohort.commit.authorDate.slice(0, 7);
    if (attribution === null) {
      add(human, o);
      add(row(byDirectory, dir).human, o);
      add(row(byMonth, month).human, o);
    } else if (attribution.confidence === 'high') {
      add(ai.high, o);
      add(row(byDirectory, dir).ai, o);
      add(row(byMonth, month).ai, o);
      const tool = attribution.tool ?? 'unknown';
      let toolRow = byTool.get(tool);
      if (!toolRow) {
        toolRow = { tool, ai: emptyStats() };
        byTool.set(tool, toolRow);
      }
      add(toolRow.ai, o);
    } else {
      // Estimated tier: overall figures only. Folding it into the breakdown
      // tables would blend tiers into unlabelled figures (product contract).
      add(ai.estimated, o);
    }
  }

  const sortByKey = <T extends { key: string }>(m: Map<string, T>): T[] =>
    [...m.values()].sort((a, b) => a.key.localeCompare(b.key));

  return {
    timepointDays: [...TIMEPOINT_DAYS],
    analysedCommits: analysed.length,
    range: {
      start: analysed.at(-1)?.authorDate ?? null,
      end: analysed[0]?.authorDate ?? null,
    },
    aiCommits: {
      high: aiCohorts.filter((c) => c.attribution!.confidence === 'high').length,
      estimated: aiCohorts.filter((c) => c.attribution!.confidence === 'estimated').length,
    },
    ai,
    human,
    humanSample: { sampled: sampled.length, pool: humanPool.length, seed },
    byDirectory: sortByKey(byDirectory),
    byMonth: sortByKey(byMonth),
    byTool: [...byTool.values()].sort((a, b) => a.tool.localeCompare(b.tool)),
  };
}
