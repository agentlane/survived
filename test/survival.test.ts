import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { buildRepo, cleanup } from './fixtures/repo.js';
import { survivalTimeline, day } from './fixtures/timeline.js';
import { seededSample, mulberry32, DEFAULT_SEED } from '../src/survival/sample.js';
import { SnapshotIndex } from '../src/survival/snapshots.js';
import { classifyDead } from '../src/survival/classify.js';
import { analyseSurvival } from '../src/survival/engine.js';
import type { TimepointStats, SurvivalStats } from '../src/survival/types.js';

const tp = (m: number, s: number, r: number, d: number, ny: number): TimepointStats => ({
  measurableLines: m,
  surviving: s,
  rewritten: r,
  deleted: d,
  notYetMeasurableLines: ny,
});
const stats = (t30: TimepointStats, t60: TimepointStats, t90: TimepointStats): SurvivalStats => ({ t30, t60, t90 });
const zeros = () => stats(tp(0, 0, 0, 0, 0), tp(0, 0, 0, 0, 0), tp(0, 0, 0, 0, 0));

let dir: string;

beforeAll(() => {
  ({ dir } = buildRepo(survivalTimeline));
});

afterAll(() => cleanup(dir));

describe('seededSample', () => {
  it('is deterministic, sized, and a subset', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const a = seededSample(items, 10, 42);
    const b = seededSample(items, 10, 42);
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    expect(new Set(a).size).toBe(10);
    for (const x of a) expect(items).toContain(x);
    expect(seededSample(items, 10, 43)).not.toEqual(a);
    expect(seededSample(items, 200, 42)).toHaveLength(100);
  });

  it('mulberry32 yields the same stream for the same seed', () => {
    const r1 = mulberry32(7);
    const r2 = mulberry32(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe('SnapshotIndex', () => {
  const fake = (epochDay: number, hash: string) => ({
    hash,
    authorName: 'x',
    authorEmail: 'x@x',
    authorDate: day(epochDay),
    committerDate: day(epochDay),
    message: 'x',
    trailers: [],
  });

  it('finds the last commit at or before a moment', () => {
    const idx = new SnapshotIndex([fake(20, 'c'), fake(10, 'b'), fake(0, 'a')]);
    expect(idx.refAt(Date.parse(day(15)))).toBe('b');
    expect(idx.refAt(Date.parse(day(10)))).toBe('b');
    expect(idx.refAt(Date.parse(day(99)))).toBe('c');
    expect(idx.refAt(Date.parse(day(0)) - 1)).toBeNull();
  });

  it('knows when a moment is not yet measurable', () => {
    const idx = new SnapshotIndex([fake(20, 'c'), fake(0, 'a')]);
    expect(idx.measurable(Date.parse(day(20)))).toBe(true);
    expect(idx.measurable(Date.parse(day(21)))).toBe(false);
  });
});

describe('classifyDead', () => {
  it('splits dead lines into rewritten and deleted by hunk overlap', () => {
    const ranges = [{ start: 1, count: 40 }];
    const hunks = [
      { oldStart: 1, oldCount: 20, newCount: 20 }, // replacement
      { oldStart: 21, oldCount: 10, newCount: 0 }, // pure deletion
    ];
    expect(classifyDead(ranges, hunks, 30)).toEqual({ rewritten: 20, deleted: 10 });
  });

  it('counts net line loss of a merged replacement hunk as deleted', () => {
    // git -U0 merges adjacent rewrite (1-20) + deletion (21-30) into -1,30 +1,20
    const ranges = [{ start: 1, count: 40 }];
    const hunks = [{ oldStart: 1, oldCount: 30, newCount: 20 }];
    expect(classifyDead(ranges, hunks, 30)).toEqual({ rewritten: 20, deleted: 10 });
  });

  it('classifies leftover dead lines as rewritten when no deletion hunk covers them', () => {
    expect(classifyDead([{ start: 1, count: 5 }], [], 2)).toEqual({ rewritten: 2, deleted: 0 });
  });

  it('ignores deletion hunks outside the added ranges', () => {
    const hunks = [{ oldStart: 100, oldCount: 10, newCount: 0 }];
    expect(classifyDead([{ start: 1, count: 5 }], hunks, 3)).toEqual({ rewritten: 3, deleted: 0 });
  });
});

describe('analyseSurvival — scripted timeline', () => {
  it('produces the exact 30/60/90 figures', async () => {
    const report = await analyseSurvival(dir);

    expect(report.analysedCommits).toBe(7);
    expect(report.aiCommits).toEqual({ high: 2, estimated: 0 });

    expect(report.ai.high).toEqual(
      stats(tp(50, 30, 20, 0, 0), tp(40, 20, 20, 0, 10), tp(40, 10, 20, 10, 10)),
    );
    expect(report.ai.estimated).toEqual(zeros());

    expect(report.human).toEqual(
      stats(tp(30, 30, 0, 0, 5), tp(25, 25, 0, 0, 10), tp(0, 0, 0, 0, 35)),
    );
    expect(report.humanSample).toEqual({ sampled: 5, pool: 5, seed: DEFAULT_SEED });
  });

  it('reports the analysed author-date range', async () => {
    const report = await analyseSurvival(dir);
    expect(report.range).toEqual({ start: day(0), end: day(95) });
  });

  it('excludes young cohorts and reports them as not yet measurable', async () => {
    const report = await analyseSurvival(dir);
    // The d60 AI commit (10 lines) is measurable at 30 days only.
    expect(report.ai.high.t60.notYetMeasurableLines).toBe(10);
    expect(report.ai.high.t90.notYetMeasurableLines).toBe(10);
    expect(report.ai.high.t60.measurableLines).toBe(40);
  });

  it('breaks down by top-level directory (high-confidence AI, human alongside)', async () => {
    const report = await analyseSurvival(dir);
    expect(report.byDirectory).toEqual([
      {
        key: '.',
        ai: zeros(),
        human: stats(tp(10, 10, 0, 0, 5), tp(5, 5, 0, 0, 10), tp(0, 0, 0, 0, 15)),
      },
      {
        key: 'lib',
        ai: stats(tp(10, 10, 0, 0, 0), tp(0, 0, 0, 0, 10), tp(0, 0, 0, 0, 10)),
        human: zeros(),
      },
      {
        key: 'src',
        ai: stats(tp(40, 20, 20, 0, 0), tp(40, 20, 20, 0, 0), tp(40, 10, 20, 10, 0)),
        human: stats(tp(20, 20, 0, 0, 0), tp(20, 20, 0, 0, 0), tp(0, 0, 0, 0, 20)),
      },
    ]);
  });

  it('breaks down by calendar month of authorship and by tool', async () => {
    const report = await analyseSurvival(dir);
    expect(report.byMonth.map((r) => r.key)).toEqual(['2024-01', '2024-02', '2024-03', '2024-04']);
    const jan = report.byMonth[0]!;
    expect(jan.ai).toEqual(stats(tp(40, 20, 20, 0, 0), tp(40, 20, 20, 0, 0), tp(40, 10, 20, 10, 0)));
    expect(jan.human).toEqual(stats(tp(25, 25, 0, 0, 0), tp(25, 25, 0, 0, 0), tp(0, 0, 0, 0, 25)));

    expect(report.byTool).toEqual([
      { tool: 'claude', ai: stats(tp(50, 30, 20, 0, 0), tp(40, 20, 20, 0, 10), tp(40, 10, 20, 10, 10)) },
    ]);
  });

  it('supports maxCommits (newest first)', async () => {
    const report = await analyseSurvival(dir, { maxCommits: 3 });
    expect(report.analysedCommits).toBe(3);
    expect(report.aiCommits).toEqual({ high: 1, estimated: 0 });
    expect(report.ai.high.t30).toEqual(tp(10, 10, 0, 0, 0));
    expect(report.humanSample.pool).toBe(2);
  });

  it('supports since', async () => {
    const report = await analyseSurvival(dir, { since: day(55) });
    expect(report.analysedCommits).toBe(4);
    expect(report.aiCommits).toEqual({ high: 1, estimated: 0 });
  });

  it('writes nothing to the repo besides .survived/', async () => {
    await analyseSurvival(dir);
    const res = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    const entries = res.stdout.split('\n').filter((l) => l.length > 0);
    expect(entries).toEqual(['?? .survived/']);
  });
});
