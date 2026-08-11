import type { ScanSummary } from '../attribution/scan.js';

/**
 * Product contract: below this many AI-attributed added lines, percentages
 * are withheld and the low-coverage message is printed instead.
 */
export const LOW_COVERAGE_LINES = 50;

function pct(part: number, whole: number): string {
  if (whole === 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : 'n/a';
}

export function renderScan(summary: ScanSummary): string {
  const { high, estimated, perDetector } = summary;
  const attributedLines = high.lines + estimated.lines;
  const out: string[] = [];
  out.push('survived scan — attribution coverage');
  out.push('');
  out.push(`  commits analysed     ${summary.totalCommits}  (${day(summary.rangeStart)} → ${day(summary.rangeEnd)})`);
  out.push(`  AI-attributed        ${high.commits + estimated.commits}  (${high.commits} high confidence, ${estimated.commits} estimated)`);
  out.push(`  per detector         trailer ${perDetector.trailer} · notes ${perDetector.notes} · author ${perDetector.author} · heuristic ${perDetector.heuristic}`);
  out.push('');
  if (attributedLines < LOW_COVERAGE_LINES) {
    out.push(`  attribution coverage too low to be meaningful: ${attributedLines} AI-attributed added`);
    out.push(`  lines (fewer than ${LOW_COVERAGE_LINES}). Percentages withheld. Attribution improves when`);
    out.push('  commits carry AI trailers (e.g. Co-Authored-By) or notes under refs/notes/ai.');
  } else {
    out.push(`  added lines          ${summary.totalAddedLines} total`);
    out.push(`  AI-attributed lines  ${high.lines} high confidence (${pct(high.lines, summary.totalAddedLines)}) · ${estimated.lines} estimated (${pct(estimated.lines, summary.totalAddedLines)})`);
    out.push('');
    out.push('  estimated figures come from heuristics and are reported separately;');
    out.push('  they are never blended into the high-confidence numbers.');
  }
  out.push('');
  return out.join('\n');
}
