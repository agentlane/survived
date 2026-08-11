import type { SurvivalReport, SurvivalStats, TimepointStats, TimepointKey } from '../survival/types.js';
import { TIMEPOINT_KEYS } from '../survival/types.js';

/** Product contract: below this many AI-attributed added lines, percentages are withheld. */
export const LOW_COVERAGE_LINES = 50;

/** Total added lines carried by AI-attributed commits (both tiers). Any
 *  timepoint's measurable+notYet sums to the tier's total added lines. */
export function aiAttributedLines(report: SurvivalReport): number {
  const total = (t: TimepointStats) => t.measurableLines + t.notYetMeasurableLines;
  return total(report.ai.high.t30) + total(report.ai.estimated.t30);
}

export function isLowCoverage(report: SurvivalReport): boolean {
  return aiAttributedLines(report) < LOW_COVERAGE_LINES;
}

/** Survival percentage at one timepoint, or null when nothing is measurable. */
export function survivalPct(t: TimepointStats): number | null {
  if (t.measurableLines === 0) return null;
  return (t.surviving / t.measurableLines) * 100;
}

export function fmtPct(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function pctRow(stats: SurvivalStats): string[] {
  return TIMEPOINT_KEYS.map((k) => fmtPct(survivalPct(stats[k])));
}

/** Worst-surviving directory for high-confidence AI lines, judged at the
 *  latest timepoint with measurable lines. */
export function worstDirectory(report: SurvivalReport): { key: string; pct: number } | null {
  let worst: { key: string; pct: number } | null = null;
  for (const row of report.byDirectory) {
    const latest = [...TIMEPOINT_KEYS].reverse()
      .map((k) => survivalPct(row.ai[k]))
      .find((p) => p !== null);
    if (latest === undefined || latest === null) continue;
    if (worst === null || latest < worst.pct) worst = { key: row.key, pct: latest };
  }
  return worst;
}

/** Rewrite/delete split of dead lines at a timepoint, or null when none died. */
export function deadSplit(t: TimepointStats): { rewrittenPct: number; deletedPct: number } | null {
  const dead = t.rewritten + t.deleted;
  if (dead === 0) return null;
  return { rewrittenPct: (t.rewritten / dead) * 100, deletedPct: (t.deleted / dead) * 100 };
}

/** Latest timepoint key with measurable lines, for headline split figures. */
export function latestMeasurable(stats: SurvivalStats): TimepointKey | null {
  return [...TIMEPOINT_KEYS].reverse().find((k) => stats[k].measurableLines > 0) ?? null;
}

export function dayOf(iso: string | null): string {
  return iso ? iso.slice(0, 10) : 'n/a';
}

/** Shared honesty copy — printed instead of percentages under low coverage. */
export function lowCoverageMessage(report: SurvivalReport): string {
  return (
    `attribution coverage too low to be meaningful: ${aiAttributedLines(report)} AI-attributed added ` +
    `lines (fewer than ${LOW_COVERAGE_LINES}). Percentages withheld. Attribution improves when ` +
    `commits carry AI trailers (e.g. Co-Authored-By) or notes under refs/notes/ai.`
  );
}
