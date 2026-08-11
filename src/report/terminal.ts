import pc from 'picocolors';
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

/** Headline block: ~20 lines. picocolors disables itself when stdout is not a TTY. */
export function renderTerminal(report: SurvivalReport): string {
  const out: string[] = [];
  const pad = (s: string) => s.padEnd(13);

  out.push(pc.bold('survived — AI code survival report'));
  out.push(`  range          ${dayOf(report.range.start)} → ${dayOf(report.range.end)} · ${report.analysedCommits} commits analysed`);
  out.push(
    `  AI-attributed  ${report.aiCommits.high} commits high confidence · ${report.aiCommits.estimated} estimated · ${aiAttributedLines(report)} added lines`,
  );
  out.push(
    `  human baseline ${report.humanSample.sampled} of ${report.humanSample.pool} non-AI commits (seeded sample)`,
  );
  out.push('');

  if (isLowCoverage(report)) {
    out.push(`  ${lowCoverageMessage(report)}`);
    out.push('');
    return out.join('\n') + '\n';
  }

  if (nothingMeasurableYet(report)) {
    out.push(`  ${TOO_YOUNG_MESSAGE}`);
    out.push('');
    return out.join('\n') + '\n';
  }

  out.push(`  survival       ${pad('30d')}${pad('60d')}${pad('90d')}`);
  out.push(`  AI (high)      ${pctRow(report.ai.high).map(pad).join('')}`);
  out.push(`  AI (estimated) ${pctRow(report.ai.estimated).map(pad).join('')}`);
  out.push(`  human          ${pctRow(report.human).map(pad).join('')}`);
  out.push('');

  const latest = latestMeasurable(report.ai.high);
  if (latest) {
    const split = deadSplit(report.ai.high[latest]);
    if (split) {
      out.push(
        `  dead AI lines (high, ${latest.slice(1)}d): ${split.rewrittenPct.toFixed(1)}% rewritten · ${split.deletedPct.toFixed(1)}% deleted`,
      );
    }
  }
  const notYet = report.ai.high.t90.notYetMeasurableLines + report.ai.estimated.t90.notYetMeasurableLines;
  if (notYet > 0) out.push(`  not yet measurable at 90d: ${notYet} AI-attributed lines (excluded)`);
  const worst = worstDirectory(report);
  if (worst) out.push(`  worst-surviving directory: ${worst.key} (${worst.pct.toFixed(1)}%)`);
  out.push('');
  out.push(pc.dim('  estimated tier is heuristic and reported separately — never blended.'));
  out.push(pc.dim('  full data: survived --json · charts: survived --html --out report.html'));
  out.push('');
  return out.join('\n') + '\n';
}
