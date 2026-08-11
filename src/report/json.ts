import { z } from 'zod';
import type { SurvivalReport } from '../survival/types.js';
import { isLowCoverage } from './format.js';

export const SCHEMA_VERSION = 1;

const timepointStats = z.object({
  measurableLines: z.number().int().nonnegative(),
  surviving: z.number().int().nonnegative(),
  rewritten: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  notYetMeasurableLines: z.number().int().nonnegative(),
});

const survivalStats = z.object({
  t30: timepointStats,
  t60: timepointStats,
  t90: timepointStats,
});

export const reportSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  lowCoverage: z.boolean(),
  timepointDays: z.array(z.number().int().positive()),
  analysedCommits: z.number().int().nonnegative(),
  range: z.object({ start: z.string().nullable(), end: z.string().nullable() }),
  aiCommits: z.object({ high: z.number().int().nonnegative(), estimated: z.number().int().nonnegative() }),
  ai: z.object({ high: survivalStats, estimated: survivalStats }),
  human: survivalStats,
  humanSample: z.object({
    sampled: z.number().int().nonnegative(),
    pool: z.number().int().nonnegative(),
    seed: z.number().int(),
  }),
  byDirectory: z.array(z.object({ key: z.string(), ai: survivalStats, human: survivalStats })),
  byMonth: z.array(z.object({ key: z.string(), ai: survivalStats, human: survivalStats })),
  byTool: z.array(z.object({ tool: z.string(), ai: survivalStats })),
});

export type JsonReport = z.infer<typeof reportSchema>;

/** Full machine-readable result. Raw counts stay present under low coverage —
 *  the lowCoverage flag carries the honesty signal for machine consumers. */
export function renderJson(report: SurvivalReport): string {
  const payload: JsonReport = {
    schemaVersion: SCHEMA_VERSION,
    lowCoverage: isLowCoverage(report),
    ...report,
  };
  return JSON.stringify(reportSchema.parse(payload), null, 2) + '\n';
}
