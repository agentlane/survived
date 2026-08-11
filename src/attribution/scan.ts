import { log, logNumstat, readNotes, type CommitInfo } from '../git/index.js';
import { AI_NOTES_REFS } from './markers.js';
import { attributeCommits, type Attribution, type DetectorName } from './index.js';

export interface TierTotals {
  commits: number;
  lines: number;
}

export interface ScanSummary {
  totalCommits: number;
  /** ISO author dates of the oldest and newest analysed commits. */
  rangeStart: string | null;
  rangeEnd: string | null;
  totalAddedLines: number;
  high: TierTotals;
  estimated: TierTotals;
  perDetector: Record<DetectorName, number>;
}

export interface ScanResult {
  summary: ScanSummary;
  attributions: Map<string, Attribution>;
  commits: CommitInfo[];
}

export interface ScanOptions {
  heuristics: boolean;
}

export async function scanRepo(repoPath: string, opts: ScanOptions): Promise<ScanResult> {
  const [commits, stats, ...noteMaps] = await Promise.all([
    log(repoPath),
    logNumstat(repoPath),
    ...AI_NOTES_REFS.map((ref) => readNotes(repoPath, ref)),
  ]);
  const notes = new Map<string, string>();
  for (const m of noteMaps) for (const [k, v] of m) notes.set(k, v);

  const attributions = attributeCommits(commits, notes, stats, opts);

  const summary: ScanSummary = {
    totalCommits: commits.length,
    rangeStart: commits.at(-1)?.authorDate ?? null,
    rangeEnd: commits.at(0)?.authorDate ?? null,
    totalAddedLines: [...stats.values()].reduce((n, s) => n + s.added, 0),
    high: { commits: 0, lines: 0 },
    estimated: { commits: 0, lines: 0 },
    perDetector: { trailer: 0, notes: 0, author: 0, heuristic: 0 },
  };
  for (const a of attributions.values()) {
    const tier = summary[a.confidence];
    tier.commits += 1;
    tier.lines += stats.get(a.commit)?.added ?? 0;
    summary.perDetector[a.source] += 1;
  }
  return { summary, attributions, commits };
}
