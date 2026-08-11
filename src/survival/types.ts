export const TIMEPOINT_DAYS = [30, 60, 90] as const;

export type TimepointKey = 't30' | 't60' | 't90';
export const TIMEPOINT_KEYS: readonly TimepointKey[] = ['t30', 't60', 't90'];

export interface TimepointStats {
  /** Added lines in cohorts old enough to measure at this timepoint. */
  measurableLines: number;
  surviving: number;
  rewritten: number;
  deleted: number;
  /** Added lines in cohorts younger than the timepoint — excluded, never counted as surviving. */
  notYetMeasurableLines: number;
}

export interface SurvivalStats {
  t30: TimepointStats;
  t60: TimepointStats;
  t90: TimepointStats;
}

export interface BreakdownRow {
  key: string;
  ai: SurvivalStats;
  human: SurvivalStats;
}

export interface ToolRow {
  tool: string;
  ai: SurvivalStats;
}

export interface SurvivalReport {
  timepointDays: number[];
  analysedCommits: number;
  aiCommits: { high: number; estimated: number };
  /** Estimated tier reported separately — never blended (product contract). */
  ai: { high: SurvivalStats; estimated: SurvivalStats };
  human: SurvivalStats;
  humanSample: { sampled: number; pool: number; seed: number };
  /** Breakdowns cover high-confidence AI attribution only, human alongside. */
  byDirectory: BreakdownRow[];
  byMonth: BreakdownRow[];
  byTool: ToolRow[];
}

export function emptyTimepoint(): TimepointStats {
  return { measurableLines: 0, surviving: 0, rewritten: 0, deleted: 0, notYetMeasurableLines: 0 };
}

export function emptyStats(): SurvivalStats {
  return { t30: emptyTimepoint(), t60: emptyTimepoint(), t90: emptyTimepoint() };
}
