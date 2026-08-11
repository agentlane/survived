import { describe, it, expect } from 'vitest';
import type { CommitInfo, CommitStats } from '../src/git/index.js';
import { detectTrailer, detectNotes, detectAuthor } from '../src/attribution/detectors.js';
import {
  messageMatchesAgentPhrasing,
  isLargeAdditionLowDeletion,
  commitsWithin120s,
  hasImperativeSummaryWithBullets,
} from '../src/attribution/heuristics.js';
import { attributeCommits } from '../src/attribution/index.js';

let n = 0;
function stub(overrides: Partial<CommitInfo>): CommitInfo {
  n += 1;
  return {
    hash: `${n}`.padStart(40, '0'),
    authorName: 'Human Person',
    authorEmail: 'human@example.com',
    authorDate: '2024-01-01T12:00:00Z',
    committerDate: '2024-01-01T12:00:00Z',
    message: 'fix: adjust config',
    trailers: [],
    ...overrides,
  };
}

describe('trailer detector', () => {
  it('matches Co-Authored-By with a known AI tool', () => {
    const c = stub({
      trailers: [{ key: 'Co-Authored-By', value: 'Claude <noreply@anthropic.com>' }],
    });
    expect(detectTrailer(c)).toEqual({
      commit: c.hash,
      source: 'trailer',
      confidence: 'high',
      tool: 'claude',
    });
  });

  it('matches Assisted-by / Generated-by / AI-Generated trailers', () => {
    for (const key of ['Assisted-by', 'Generated-by', 'AI-Generated']) {
      const c = stub({ trailers: [{ key, value: 'aider v0.50' }] });
      expect(detectTrailer(c)).toMatchObject({ source: 'trailer', confidence: 'high', tool: 'aider' });
    }
  });

  it('is case-insensitive and also reads raw body lines', () => {
    const c = stub({
      message: 'add thing\n\nsome text\nco-authored-by: GitHub Copilot <copilot@github.com>',
      trailers: [],
    });
    expect(detectTrailer(c)).toMatchObject({ tool: 'copilot', confidence: 'high' });
  });

  it('ignores human co-authors and non-AI bots', () => {
    expect(
      detectTrailer(stub({ trailers: [{ key: 'Co-Authored-By', value: 'Jane Doe <jane@example.com>' }] })),
    ).toBeNull();
    expect(
      detectTrailer(stub({ trailers: [{ key: 'Co-Authored-By', value: 'dependabot[bot] <x@github.com>' }] })),
    ).toBeNull();
  });
});

describe('notes detector', () => {
  it('attributes a commit annotated under the AI notes ref', () => {
    const c = stub({});
    const notes = new Map([[c.hash, 'tool: cursor']]);
    expect(detectNotes(c, notes)).toEqual({
      commit: c.hash,
      source: 'notes',
      confidence: 'high',
      tool: 'cursor',
    });
  });

  it('returns null without a note', () => {
    expect(detectNotes(stub({}), new Map())).toBeNull();
  });
});

describe('author detector', () => {
  it('matches known agent authors', () => {
    expect(detectAuthor(stub({ authorName: 'claude[bot]' }))).toMatchObject({ tool: 'claude' });
    expect(detectAuthor(stub({ authorEmail: 'bot@noreply.anthropic.com' }))).toMatchObject({ tool: 'claude' });
    expect(detectAuthor(stub({ authorName: 'devin-ai-integration[bot]' }))).toMatchObject({ tool: 'devin' });
  });

  it('does not match github-actions alone or humans', () => {
    expect(
      detectAuthor(stub({ authorName: 'github-actions', authorEmail: 'github-actions[bot]@users.noreply.github.com' })),
    ).toBeNull();
    expect(detectAuthor(stub({}))).toBeNull();
  });
});

describe('heuristic signals', () => {
  it('S1: agent phrasing in the message', () => {
    expect(messageMatchesAgentPhrasing('add parser\n\nGenerated with Claude Code')).toBe(true);
    expect(messageMatchesAgentPhrasing('🤖 Generated with Claude Code')).toBe(true);
    expect(messageMatchesAgentPhrasing('fix typo in readme')).toBe(false);
  });

  it('S2: large addition with few deletions', () => {
    const s = (added: number, deleted: number): CommitStats => ({ added, deleted });
    expect(isLargeAdditionLowDeletion(s(301, 0))).toBe(true);
    expect(isLargeAdditionLowDeletion(s(400, 19))).toBe(true);
    expect(isLargeAdditionLowDeletion(s(300, 0))).toBe(false); // strictly > 300
    expect(isLargeAdditionLowDeletion(s(301, 20))).toBe(false); // >= 5% deletions
  });

  it('S3: commits within 120s of another commit by the same author', () => {
    const a1 = stub({ committerDate: '2024-01-01T12:00:00Z' });
    const a2 = stub({ committerDate: '2024-01-01T12:01:00Z' });
    const a3 = stub({ committerDate: '2024-01-01T12:10:00Z' });
    const b1 = stub({ authorEmail: 'other@example.com', committerDate: '2024-01-01T12:00:30Z' });
    const flagged = commitsWithin120s([a1, a2, a3, b1]);
    expect(flagged).toEqual(new Set([a1.hash, a2.hash]));
  });

  it('S4: emoji-free imperative summary plus bullet list', () => {
    expect(hasImperativeSummaryWithBullets('add parser module\n\n- handle comments\n- support nesting')).toBe(true);
    expect(hasImperativeSummaryWithBullets('add parser module 🚀\n\n- a\n- b')).toBe(false);
    expect(hasImperativeSummaryWithBullets('add parser module\n\n- only one bullet')).toBe(false);
    expect(hasImperativeSummaryWithBullets('add parser module')).toBe(false);
  });
});

describe('attributeCommits', () => {
  it('needs >= 2 heuristic signals for an estimated attribution', () => {
    // Dates far apart so S3 (within 120s) cannot fire between the stubs.
    const one = stub({ message: 'add parser\n\nGenerated with Claude Code', committerDate: '2024-01-01T12:00:00Z' }); // S1 only
    const two = stub({
      message: 'add parser module\n\n- handle comments\n- support nesting\n\nGenerated with Claude Code',
      committerDate: '2024-01-05T12:00:00Z',
    }); // S1+S4
    const result = attributeCommits([one, two], new Map(), new Map(), { heuristics: true });
    expect(result.get(one.hash)).toBeUndefined();
    expect(result.get(two.hash)).toMatchObject({ source: 'heuristic', confidence: 'estimated' });
  });

  it('high-confidence detector wins; a commit is counted once', () => {
    const c = stub({
      message: 'add parser module\n\n- handle comments\n- support nesting\n\nGenerated with Claude Code',
      trailers: [{ key: 'Co-Authored-By', value: 'Claude <noreply@anthropic.com>' }],
    });
    const result = attributeCommits([c], new Map(), new Map(), { heuristics: true });
    expect(result.size).toBe(1);
    expect(result.get(c.hash)).toMatchObject({ source: 'trailer', confidence: 'high' });
  });

  it('heuristics: false removes exactly the estimated tier', () => {
    const trailered = stub({ trailers: [{ key: 'Co-Authored-By', value: 'Claude <x@y>' }] });
    const shaped = stub({ message: 'add parser module\n\n- a\n- b\n\nGenerated with Claude Code' });
    const withH = attributeCommits([trailered, shaped], new Map(), new Map(), { heuristics: true });
    const withoutH = attributeCommits([trailered, shaped], new Map(), new Map(), { heuristics: false });
    expect(withH.size).toBe(2);
    expect(withoutH.size).toBe(1);
    expect(withoutH.get(trailered.hash)).toMatchObject({ confidence: 'high' });
  });
});
