import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildRepo, makeRepo, commit, cleanup } from './fixtures/repo.js';
import { survivalTimeline } from './fixtures/timeline.js';
import { analyseSurvival } from '../src/survival/engine.js';
import type { SurvivalReport } from '../src/survival/types.js';
import { renderTerminal } from '../src/report/terminal.js';
import { renderMarkdown } from '../src/report/markdown.js';
import { renderJson, reportSchema } from '../src/report/json.js';
import { renderHtml } from '../src/report/html.js';
import { METHODOLOGY } from '../src/report/methodology.js';
import { worstDirectory, aiAttributedLines } from '../src/report/format.js';

let dir: string;
let report: SurvivalReport;

beforeAll(async () => {
  ({ dir } = buildRepo(survivalTimeline));
  report = await analyseSurvival(dir);
});

afterAll(() => cleanup(dir));

async function lowCoverageReport(): Promise<SurvivalReport> {
  const plain = makeRepo();
  try {
    commit(plain, { message: 'seed', date: '2024-01-01T12:00:00Z', files: { 'a.txt': 'a\n' } });
    return await analyseSurvival(plain);
  } finally {
    cleanup(plain);
  }
}

describe('format helpers', () => {
  it('counts AI-attributed added lines across tiers', () => {
    expect(aiAttributedLines(report)).toBe(50);
  });

  it('finds the worst-surviving directory at 90 days', () => {
    expect(worstDirectory(report)).toEqual({ key: 'src', pct: 25 });
  });
});

describe('terminal renderer', () => {
  it('renders the headline block', () => {
    const out = renderTerminal(report);
    expect(out).toMatchSnapshot();
    expect(out).toContain('2024-01-01');
    expect(out).toContain('60.0%'); // AI high 30d
    expect(out).toContain('25.0%'); // AI high 90d
    expect(out).toContain('100.0%'); // human 30d
    expect(out).toContain('estimated');
    expect(out.split('\n').length).toBeLessThanOrEqual(25);
  });

  it('prints the honesty message on low coverage', async () => {
    const out = renderTerminal(await lowCoverageReport());
    expect(out.toLowerCase()).toContain('too low');
    expect(out).not.toMatch(/\d+(\.\d+)?%/);
  });
});

describe('markdown renderer', () => {
  it('renders the same content as markdown', () => {
    const out = renderMarkdown(report);
    expect(out).toMatchSnapshot();
    expect(out.startsWith('# ')).toBe(true);
    expect(out).toContain('| 60.0%');
    expect(out).toContain('estimated');
  });
});

describe('json renderer', () => {
  it('round-trips through the zod schema', () => {
    const out = renderJson(report);
    const parsed: unknown = JSON.parse(out);
    const validated = reportSchema.parse(parsed);
    expect(validated.schemaVersion).toBe(1);
    expect(validated.ai.high).toEqual(report.ai.high);
    expect(validated.human).toEqual(report.human);
    expect(validated.lowCoverage).toBe(false);
  });

  it('flags low coverage instead of hiding data', async () => {
    const validated = reportSchema.parse(JSON.parse(renderJson(await lowCoverageReport())));
    expect(validated.lowCoverage).toBe(true);
  });

  it('is stable for snapshotting', () => {
    expect(renderJson(report)).toMatchSnapshot();
  });
});

describe('html renderer', () => {
  it('is fully self-contained: no network references at all', () => {
    const out = renderHtml(report);
    expect(out).not.toMatch(/http/i);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('@import');
  });

  it('embeds the three charts as inline SVG', () => {
    const out = renderHtml(report);
    expect(out.match(/<svg/g)?.length).toBe(3);
  });

  it('includes the methodology text verbatim in the footer', () => {
    expect(renderHtml(report)).toContain(METHODOLOGY);
  });

  it('renders the headline figures and snapshots stably', () => {
    const out = renderHtml(report);
    expect(out).toContain('60.0%');
    expect(out).toMatchSnapshot();
  });

  it('omits charts and shows the honesty message on low coverage', async () => {
    const out = renderHtml(await lowCoverageReport());
    expect(out.toLowerCase()).toContain('too low');
    expect(out).not.toContain('<svg');
  });
});
