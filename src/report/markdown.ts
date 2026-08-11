import type { SurvivalReport } from '../survival/types.js';
import {
  aiAttributedLines,
  isLowCoverage,
  lowCoverageMessage,
  pctRow,
  deadSplit,
  latestMeasurable,
  worstDirectory,
  dayOf,
  nothingMeasurableYet,
  TOO_YOUNG_MESSAGE,
} from './format.js';

/** Same content as the terminal report, as markdown. */
export function renderMarkdown(report: SurvivalReport): string {
  const out: string[] = [];
  out.push('# survived — AI code survival report');
  out.push('');
  out.push(`- **Range:** ${dayOf(report.range.start)} → ${dayOf(report.range.end)} (${report.analysedCommits} commits analysed)`);
  out.push(
    `- **AI-attributed:** ${report.aiCommits.high} commits high confidence, ${report.aiCommits.estimated} estimated (${aiAttributedLines(report)} added lines)`,
  );
  out.push(
    `- **Human baseline:** ${report.humanSample.sampled} of ${report.humanSample.pool} non-AI commits (seeded sample)`,
  );
  out.push('');

  if (isLowCoverage(report)) {
    out.push(`> ${lowCoverageMessage(report)}`);
    out.push('');
    return out.join('\n');
  }

  if (nothingMeasurableYet(report)) {
    out.push(`> ${TOO_YOUNG_MESSAGE}`);
    out.push('');
    return out.join('\n');
  }

  out.push('| survival | 30d | 60d | 90d |');
  out.push('| --- | --- | --- | --- |');
  out.push(`| AI (high confidence) | ${pctRow(report.ai.high).join(' | ')} |`);
  out.push(`| AI (estimated) | ${pctRow(report.ai.estimated).join(' | ')} |`);
  out.push(`| human | ${pctRow(report.human).join(' | ')} |`);
  out.push('');

  const latest = latestMeasurable(report.ai.high);
  if (latest) {
    const split = deadSplit(report.ai.high[latest]);
    if (split) {
      out.push(
        `Dead AI lines (high confidence, ${latest.slice(1)}d): ${split.rewrittenPct.toFixed(1)}% rewritten, ${split.deletedPct.toFixed(1)}% deleted.`,
      );
    }
  }
  const notYet = report.ai.high.t90.notYetMeasurableLines + report.ai.estimated.t90.notYetMeasurableLines;
  if (notYet > 0) out.push(`Not yet measurable at 90d: ${notYet} AI-attributed lines (excluded).`);
  const worst = worstDirectory(report);
  if (worst) out.push(`Worst-surviving directory: \`${worst.key}\` (${worst.pct.toFixed(1)}%).`);
  out.push('');
  out.push('_The estimated tier is heuristic and reported separately from high-confidence figures — never blended._');
  out.push('');
  return out.join('\n');
}
