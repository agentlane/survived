import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskCache } from '../src/cache/index.js';
import { analyseSurvival } from '../src/survival/engine.js';
import { buildRepo, cleanup, type FixtureCommit } from './fixtures/repo.js';

function day(n: number): string {
  const d = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

describe('DiskCache', () => {
  const dir = mkdtempSync(join(tmpdir(), 'survived-cache-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('round-trips JSON values', async () => {
    const cache = new DiskCache(dir);
    await cache.set('key-1', { a: [1, 2], b: 'x' });
    expect(await cache.get('key-1')).toEqual({ a: [1, 2], b: 'x' });
  });

  it('misses on absent keys', async () => {
    const cache = new DiskCache(dir);
    expect(await cache.get('never-set')).toBeUndefined();
  });

  it('treats corrupt entries as misses', async () => {
    const cache = new DiskCache(dir);
    await cache.set('corrupt-me', { ok: true });
    // Find the entry file and truncate it.
    for (const sub of readdirSync(dir)) {
      for (const f of readdirSync(join(dir, sub))) {
        writeFileSync(join(dir, sub, f), '{not json');
      }
    }
    expect(await cache.get('corrupt-me')).toBeUndefined();
  });
});

describe('warm cache', () => {
  // Larger fixture so subprocess cost dominates timing noise: 25 AI commits,
  // human commits spread out, newest commit far enough that all cohorts measure.
  const AI_TRAILER = '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
  const timeline: FixtureCommit[] = [
    ...Array.from({ length: 25 }, (_, i): FixtureCommit => ({
      message: `feat: module ${i}${AI_TRAILER}`,
      date: day(i),
      files: { [`ai/f${i}.txt`]: Array.from({ length: 20 }, (_, j) => `l${i}-${j}`).join('\n') + '\n' },
    })),
    { message: 'docs: a', date: day(40), files: { 'a.txt': 'a\n' } },
    { message: 'docs: b', date: day(70), files: { 'b.txt': 'b\n' } },
    { message: 'docs: c', date: day(100), files: { 'c.txt': 'c\n' } },
    { message: 'docs: d', date: day(130), files: { 'd.txt': 'd\n' } },
  ];

  it('second run is >= 5x faster and identical', async () => {
    const { dir } = buildRepo(timeline);
    try {
      const t0 = performance.now();
      const cold = await analyseSurvival(dir);
      const t1 = performance.now();
      const warm = await analyseSurvival(dir);
      const t2 = performance.now();

      expect(warm).toEqual(cold);

      const coldMs = t1 - t0;
      const warmMs = t2 - t1;
      expect(coldMs / warmMs).toBeGreaterThanOrEqual(5);
    } finally {
      cleanup(dir);
    }
  }, 120_000);
});
