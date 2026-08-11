import type { CommitInfo } from '../git/index.js';

/**
 * Snapshot ref lookup over the current branch, by committer date.
 * "Snapshot ref for T" = last commit whose committer date <= (commit date + T).
 * With non-monotonic committer dates (rebases), "last" means the commit with
 * the greatest committer date at or before the moment.
 */
export class SnapshotIndex {
  private readonly sorted: { epoch: number; hash: string }[];
  private readonly newest: number;

  constructor(commits: CommitInfo[]) {
    this.sorted = commits
      .map((c) => ({ epoch: Date.parse(c.committerDate), hash: c.hash }))
      .sort((a, b) => a.epoch - b.epoch);
    this.newest = this.sorted.at(-1)?.epoch ?? Number.NEGATIVE_INFINITY;
  }

  /** True when the branch has history reaching `epochMs` — cohorts beyond it are not yet measurable. */
  measurable(epochMs: number): boolean {
    return this.newest >= epochMs;
  }

  /** Hash of the last commit with committer date <= `epochMs`, or null. */
  refAt(epochMs: number): string | null {
    let lo = 0;
    let hi = this.sorted.length - 1;
    let found: string | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid]!.epoch <= epochMs) {
        found = this.sorted[mid]!.hash;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }
}
