import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepo, cleanup } from './fixtures/repo.js';
import { survivalTimeline } from './fixtures/timeline.js';
import { runCli } from './fixtures/run-cli.js';
import { reportSchema } from '../src/report/json.js';

let dir: string;

beforeAll(() => {
  ({ dir } = buildRepo(survivalTimeline));
});

afterAll(() => cleanup(dir));

describe('survived (default report command)', () => {
  it('prints the terminal report', () => {
    const res = runCli([], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('60.0%');
    expect(res.stdout).toContain('estimated');
  });

  it('--json emits schema-valid JSON', () => {
    const res = runCli(['--json'], dir);
    expect(res.status).toBe(0);
    const validated = reportSchema.parse(JSON.parse(res.stdout));
    expect(validated.schemaVersion).toBe(1);
  });

  it('--md emits markdown', () => {
    const res = runCli(['--md'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout.startsWith('# ')).toBe(true);
  });

  it('--html --out writes a self-contained file the user asked for', () => {
    const out = join(dir, 'report.html');
    const res = runCli(['--html', '--out', 'report.html'], dir);
    expect(res.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    const html = readFileSync(out, 'utf8');
    expect(html).not.toMatch(/http/i);
    expect(html).toContain('<svg');
  });

  it('rejects conflicting format flags', () => {
    const res = runCli(['--json', '--md'], dir);
    expect(res.status).not.toBe(0);
    expect(res.stderr.toLowerCase()).toContain('one');
  });

  it('--max-commits narrows the analysis', () => {
    const res = runCli(['--json', '--max-commits', '3'], dir);
    const validated = reportSchema.parse(JSON.parse(res.stdout));
    expect(validated.analysedCommits).toBe(3);
  });
});
