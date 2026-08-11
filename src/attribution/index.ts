import type { CommitInfo, CommitStats } from '../git/index.js';
import type { Attribution } from './types.js';
import { detectTrailer, detectNotes, detectAuthor } from './detectors.js';
import { detectHeuristic, commitsWithin120s } from './heuristics.js';

export type { Attribution, Confidence, DetectorName } from './types.js';

export interface AttributionOptions {
  heuristics: boolean;
}

/**
 * One attribution per commit. High-confidence detectors win over the
 * heuristic tier; among high-confidence detectors, trailer > notes > author.
 */
export function attributeCommits(
  commits: CommitInfo[],
  notes: Map<string, string>,
  stats: Map<string, CommitStats>,
  opts: AttributionOptions,
): Map<string, Attribution> {
  const within120s = opts.heuristics ? commitsWithin120s(commits) : new Set<string>();
  const result = new Map<string, Attribution>();
  for (const c of commits) {
    const attribution =
      detectTrailer(c) ??
      detectNotes(c, notes) ??
      detectAuthor(c) ??
      (opts.heuristics ? detectHeuristic(c, { stats, within120s }) : null);
    if (attribution) result.set(c.hash, attribution);
  }
  return result;
}
