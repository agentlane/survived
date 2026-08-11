import type { AddedRange, DiffHunk } from '../git/index.js';

/**
 * Split a cohort's dead lines into rewritten vs deleted.
 *
 * Blame decides alive vs dead; this decides only the kind of death. For each
 * old-side hunk (source-commit coordinates) overlapping the commit's added
 * ranges, the hunk's net line loss (oldCount - newCount) is deletion — this
 * covers both pure-deletion hunks and merged hunks where git -U0 folds an
 * adjacent rewrite and deletion into one replacement hunk. Remaining dead
 * lines sit in a file that still exists with replacement content — rewritten.
 * Dead lines no hunk explains (rare: identical content reintroduced by
 * another commit) also count as rewritten, since the file exists.
 */
export function classifyDead(
  addedRanges: AddedRange[],
  hunks: DiffHunk[],
  dead: number,
): { rewritten: number; deleted: number } {
  let deletedTotal = 0;
  for (const h of hunks) {
    if (h.oldCount === 0) continue;
    const netLoss = h.oldCount - h.newCount;
    if (netLoss <= 0) continue;
    const hunkEnd = h.oldStart + h.oldCount - 1;
    let overlap = 0;
    for (const r of addedRanges) {
      const rangeEnd = r.start + r.count - 1;
      const lo = Math.max(h.oldStart, r.start);
      const hi = Math.min(hunkEnd, rangeEnd);
      if (hi >= lo) overlap += hi - lo + 1;
    }
    deletedTotal += Math.min(overlap, netLoss);
  }
  const deleted = Math.min(dead, deletedTotal);
  return { rewritten: dead - deleted, deleted };
}
