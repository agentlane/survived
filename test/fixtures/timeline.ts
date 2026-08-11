import type { FixtureCommit } from './repo.js';

export function day(n: number): string {
  const d = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function lines(prefix: string, from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
}

const AI_TRAILER = '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';

// Scripted timeline (see spec Phase 2 acceptance):
//   d0   AI commit adds 40 lines (src/ai.txt)
//   d20  human rewrites lines 1-20
//   d29  human adds m1.txt (5 lines)
//   d59  human adds m2.txt (5 lines)
//   d60  AI commit adds lib/ai2.txt (10 lines) — young cohort
//   d70  human deletes original lines 21-30 (10 lines)
//   d95  human adds m3.txt (5 lines) — newest commit
export const survivalTimeline: FixtureCommit[] = [
  { message: `feat: engine${AI_TRAILER}`, date: day(0), files: { 'src/ai.txt': lines('A', 1, 40).join('\n') + '\n' } },
  {
    message: 'refactor: rework engine top',
    date: day(20),
    files: { 'src/ai.txt': [...lines('R', 1, 20), ...lines('A', 21, 40)].join('\n') + '\n' },
  },
  { message: 'docs: notes', date: day(29), files: { 'm1.txt': lines('m', 1, 5).join('\n') + '\n' } },
  { message: 'docs: more notes', date: day(59), files: { 'm2.txt': lines('n', 1, 5).join('\n') + '\n' } },
  { message: `feat: helper${AI_TRAILER}`, date: day(60), files: { 'lib/ai2.txt': lines('H', 1, 10).join('\n') + '\n' } },
  {
    message: 'chore: prune engine',
    date: day(70),
    files: { 'src/ai.txt': [...lines('R', 1, 20), ...lines('A', 31, 40)].join('\n') + '\n' },
  },
  { message: 'docs: final notes', date: day(95), files: { 'm3.txt': lines('o', 1, 5).join('\n') + '\n' } },
];
