import type { CommitInfo, CommitStats } from '../git/index.js';
import type { Attribution } from './types.js';
import { AGENT_PHRASING_PATTERNS } from './markers.js';

/** S1: message matches common agent phrasing (data-driven, see markers.ts). */
export function messageMatchesAgentPhrasing(message: string): boolean {
  return AGENT_PHRASING_PATTERNS.some((p) => p.test(message));
}

/** S2: > 300 added lines in a single commit with < 5% deletions. */
export function isLargeAdditionLowDeletion(stats: CommitStats): boolean {
  return stats.added > 300 && stats.deleted < stats.added * 0.05;
}

/** S3: commits landing within 120s of another commit by the same author. */
export function commitsWithin120s(commits: CommitInfo[]): Set<string> {
  const flagged = new Set<string>();
  const byAuthor = new Map<string, CommitInfo[]>();
  for (const c of commits) {
    const list = byAuthor.get(c.authorEmail) ?? [];
    list.push(c);
    byAuthor.set(c.authorEmail, list);
  }
  for (const list of byAuthor.values()) {
    const sorted = [...list].sort(
      (a, b) => Date.parse(a.committerDate) - Date.parse(b.committerDate),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (Date.parse(curr.committerDate) - Date.parse(prev.committerDate) <= 120_000) {
        flagged.add(prev.hash);
        flagged.add(curr.hash);
      }
    }
  }
  return flagged;
}

/** S4: emoji-free imperative-style summary line followed by a bullet list. */
export function hasImperativeSummaryWithBullets(message: string): boolean {
  const [subject = '', ...rest] = message.split('\n');
  if (/\p{Extended_Pictographic}/u.test(subject)) return false;
  const bullets = rest.filter((line) => /^\s*[-*] \S/.test(line));
  return bullets.length >= 2;
}

export interface HeuristicContext {
  stats: Map<string, CommitStats>;
  within120s: Set<string>;
}

/** Estimated-confidence attribution when >= 2 independent signals fire. */
export function detectHeuristic(c: CommitInfo, ctx: HeuristicContext): Attribution | null {
  const stats = ctx.stats.get(c.hash) ?? { added: 0, deleted: 0 };
  const signals = [
    messageMatchesAgentPhrasing(c.message),
    isLargeAdditionLowDeletion(stats),
    ctx.within120s.has(c.hash),
    hasImperativeSummaryWithBullets(c.message),
  ].filter(Boolean).length;
  if (signals < 2) return null;
  return { commit: c.hash, source: 'heuristic', confidence: 'estimated', tool: null };
}
