import type { SurvivalReport, SurvivalStats, TimepointKey } from '../survival/types.js';
import { TIMEPOINT_KEYS } from '../survival/types.js';
import {
  aiAttributedLines,
  isLowCoverage,
  lowCoverageMessage,
  survivalPct,
  fmtPct,
  dayOf,
} from './format.js';
import { METHODOLOGY } from './methodology.js';

const COLORS = {
  aiHigh: '#6366f1',
  aiEstimated: '#a5b4fc',
  human: '#64748b',
  surviving: '#10b981',
  rewritten: '#f59e0b',
  deleted: '#ef4444',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- charts (inline SVG, rendered here, no scripts) ---

const W = 600;
const H = 240;
const PAD = 42;

function yFor(pct: number): number {
  return H - PAD - (pct / 100) * (H - 2 * PAD);
}

function axes(xLabels: string[]): string {
  const parts: string[] = [];
  const step = (W - 2 * PAD) / Math.max(1, xLabels.length - 1);
  parts.push(`<line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#cbd5e1"/>`);
  parts.push(`<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="#cbd5e1"/>`);
  for (const g of [0, 50, 100]) {
    parts.push(`<text x="${PAD - 8}" y="${yFor(g) + 4}" text-anchor="end" class="tick">${g}%</text>`);
    parts.push(`<line x1="${PAD}" y1="${yFor(g)}" x2="${W - PAD}" y2="${yFor(g)}" stroke="#f1f5f9"/>`);
  }
  xLabels.forEach((label, i) => {
    parts.push(`<text x="${PAD + i * step}" y="${H - PAD + 18}" text-anchor="middle" class="tick">${esc(label)}</text>`);
  });
  return parts.join('');
}

interface Series {
  color: string;
  dashed?: boolean;
  points: (number | null)[];
}

function curveChart(series: Series[], xLabels: string[]): string {
  const step = (W - 2 * PAD) / Math.max(1, xLabels.length - 1);
  const parts: string[] = [axes(xLabels)];
  for (const s of series) {
    const coords = s.points
      .map((p, i) => (p === null ? null : `${PAD + i * step},${yFor(p)}`))
      .filter((c): c is string => c !== null);
    if (coords.length === 0) continue;
    const dash = s.dashed ? ' stroke-dasharray="6 4"' : '';
    parts.push(`<polyline points="${coords.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5"${dash}/>`);
    s.points.forEach((p, i) => {
      if (p !== null) parts.push(`<circle cx="${PAD + i * step}" cy="${yFor(p)}" r="3.5" fill="${s.color}"/>`);
    });
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${parts.join('')}</svg>`;
}

function monthBars(report: SurvivalReport): string {
  const rows = report.byMonth;
  const groupW = (W - 2 * PAD) / Math.max(1, rows.length);
  const barW = Math.min(22, groupW / 3);
  const parts: string[] = [];
  parts.push(`<line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#cbd5e1"/>`);
  for (const g of [0, 50, 100]) {
    parts.push(`<text x="${PAD - 8}" y="${yFor(g) + 4}" text-anchor="end" class="tick">${g}%</text>`);
    parts.push(`<line x1="${PAD}" y1="${yFor(g)}" x2="${W - PAD}" y2="${yFor(g)}" stroke="#f1f5f9"/>`);
  }
  rows.forEach((row, i) => {
    const cx = PAD + i * groupW + groupW / 2;
    const ai = survivalPct(row.ai.t30);
    const human = survivalPct(row.human.t30);
    if (ai !== null) {
      parts.push(`<rect x="${cx - barW - 1}" y="${yFor(ai)}" width="${barW}" height="${H - PAD - yFor(ai)}" fill="${COLORS.aiHigh}"/>`);
    }
    if (human !== null) {
      parts.push(`<rect x="${cx + 1}" y="${yFor(human)}" width="${barW}" height="${H - PAD - yFor(human)}" fill="${COLORS.human}"/>`);
    }
    parts.push(`<text x="${cx}" y="${H - PAD + 18}" text-anchor="middle" class="tick">${esc(row.key)}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${parts.join('')}</svg>`;
}

function splitBars(stats: SurvivalStats): string {
  const rowH = 34;
  const height = PAD + TIMEPOINT_KEYS.length * (rowH + 14);
  const barX = PAD + 30;
  const barMax = W - barX - PAD;
  const parts: string[] = [];
  TIMEPOINT_KEYS.forEach((k: TimepointKey, i) => {
    const t = stats[k];
    const y = PAD / 2 + i * (rowH + 14);
    parts.push(`<text x="${PAD + 22}" y="${y + rowH / 2 + 4}" text-anchor="end" class="tick">${k.slice(1)}d</text>`);
    if (t.measurableLines === 0) {
      parts.push(`<text x="${barX + 4}" y="${y + rowH / 2 + 4}" class="tick">not yet measurable</text>`);
      return;
    }
    let x = barX;
    for (const [kind, value] of [
      ['surviving', t.surviving],
      ['rewritten', t.rewritten],
      ['deleted', t.deleted],
    ] as const) {
      const w = (value / t.measurableLines) * barMax;
      if (w > 0) parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="${COLORS[kind]}"/>`);
      x += w;
    }
  });
  return `<svg viewBox="0 0 ${W} ${height}" role="img">${parts.join('')}</svg>`;
}

// --- page ---

function survivalTable(report: SurvivalReport): string {
  const row = (label: string, stats: SurvivalStats): string =>
    `<tr><th>${label}</th>${TIMEPOINT_KEYS.map((k) => `<td>${fmtPct(survivalPct(stats[k]))}</td>`).join('')}</tr>`;
  return `<table>
<thead><tr><th>survival</th><th>30d</th><th>60d</th><th>90d</th></tr></thead>
<tbody>
${row('AI (high confidence)', report.ai.high)}
${row('AI (estimated)', report.ai.estimated)}
${row('human baseline', report.human)}
</tbody></table>`;
}

function breakdownTable(rows: { key: string; ai: SurvivalStats; human: SurvivalStats }[], heading: string): string {
  const cells = rows
    .map(
      (r) =>
        `<tr><th>${esc(r.key)}</th>${TIMEPOINT_KEYS.map((k) => `<td>${fmtPct(survivalPct(r.ai[k]))}</td>`).join('')}${TIMEPOINT_KEYS.map((k) => `<td class="mut">${fmtPct(survivalPct(r.human[k]))}</td>`).join('')}</tr>`,
    )
    .join('\n');
  return `<h2>${esc(heading)}</h2>
<table>
<thead><tr><th></th><th>AI 30d</th><th>AI 60d</th><th>AI 90d</th><th>human 30d</th><th>human 60d</th><th>human 90d</th></tr></thead>
<tbody>${cells}</tbody></table>`;
}

const CSS = `
body { font: 15px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; color: #0f172a; background: #fff; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
table { border-collapse: collapse; margin: 0.75rem 0; width: 100%; }
th, td { text-align: right; padding: 0.35rem 0.6rem; border-bottom: 1px solid #e2e8f0; }
th:first-child { text-align: left; }
thead th { font-weight: 600; border-bottom: 2px solid #cbd5e1; }
.meta { color: #475569; } .mut { color: #64748b; }
.tick { font-size: 11px; fill: #64748b; }
.legend span { display: inline-block; margin-right: 1rem; font-size: 0.85rem; color: #475569; }
.legend i { display: inline-block; width: 10px; height: 10px; margin-right: 4px; border-radius: 2px; }
.method { color: #475569; font-size: 0.85rem; border-top: 1px solid #e2e8f0; margin-top: 2.5rem; padding-top: 1rem; }
.notice { background: #fffbeb; border: 1px solid #fde68a; padding: 0.75rem 1rem; border-radius: 6px; }
`;

function legend(entries: [string, string][]): string {
  return `<p class="legend">${entries.map(([label, color]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join('')}</p>`;
}

/** Single self-contained file: inline CSS, inline server-rendered SVG, no scripts. */
export function renderHtml(report: SurvivalReport): string {
  const body: string[] = [];
  body.push('<h1>survived — AI code survival report</h1>');
  body.push(
    `<p class="meta">${dayOf(report.range.start)} → ${dayOf(report.range.end)} · ${report.analysedCommits} commits analysed · ` +
      `${report.aiCommits.high} AI commits high confidence, ${report.aiCommits.estimated} estimated (${aiAttributedLines(report)} added lines) · ` +
      `human baseline ${report.humanSample.sampled} of ${report.humanSample.pool} non-AI commits (seeded sample)</p>`,
  );

  if (isLowCoverage(report)) {
    body.push(`<p class="notice">${esc(lowCoverageMessage(report))}</p>`);
  } else {
    body.push(survivalTable(report));

    body.push('<h2>Survival curves</h2>');
    body.push(legend([
      ['AI (high confidence)', COLORS.aiHigh],
      ['AI (estimated)', COLORS.aiEstimated],
      ['human baseline', COLORS.human],
    ]));
    body.push(
      curveChart(
        [
          { color: COLORS.aiHigh, points: TIMEPOINT_KEYS.map((k) => survivalPct(report.ai.high[k])) },
          { color: COLORS.aiEstimated, dashed: true, points: TIMEPOINT_KEYS.map((k) => survivalPct(report.ai.estimated[k])) },
          { color: COLORS.human, points: TIMEPOINT_KEYS.map((k) => survivalPct(report.human[k])) },
        ],
        ['30d', '60d', '90d'],
      ),
    );

    body.push('<h2>30-day survival by authorship month</h2>');
    body.push(legend([
      ['AI (high confidence)', COLORS.aiHigh],
      ['human baseline', COLORS.human],
    ]));
    body.push(monthBars(report));

    body.push('<h2>AI line outcomes (high confidence)</h2>');
    body.push(legend([
      ['surviving', COLORS.surviving],
      ['rewritten', COLORS.rewritten],
      ['deleted', COLORS.deleted],
    ]));
    body.push(splitBars(report.ai.high));

    body.push(breakdownTable(report.byDirectory, 'Survival by top-level directory (high confidence)'));
    if (report.byTool.length > 0) {
      body.push('<h2>Survival by detected tool (high confidence)</h2>');
      body.push(`<table>
<thead><tr><th>tool</th><th>30d</th><th>60d</th><th>90d</th></tr></thead>
<tbody>${report.byTool
        .map((r) => `<tr><th>${esc(r.tool)}</th>${TIMEPOINT_KEYS.map((k) => `<td>${fmtPct(survivalPct(r.ai[k]))}</td>`).join('')}</tr>`)
        .join('\n')}</tbody></table>`);
    }
  }

  body.push(`<p class="method">${esc(METHODOLOGY)}</p>`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>survived report</title>
<style>${CSS}</style>
</head>
<body>
${body.join('\n')}
</body>
</html>
`;
}
