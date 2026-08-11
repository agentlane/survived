import type { CommitInfo, Trailer } from '../git/index.js';
import type { Attribution } from './types.js';
import { AI_TOOL_MARKERS, AI_TRAILER_KEYS, COAUTHOR_TRAILER_KEYS, AI_AUTHOR_PATTERNS } from './markers.js';

function toolFor(text: string): string | null {
  for (const { tool, pattern } of AI_TOOL_MARKERS) {
    if (pattern.test(text)) return tool;
  }
  return null;
}

/** Trailers parsed by git, plus raw body lines shaped like trailers —
 *  agents sometimes emit trailers outside a well-formed trailer block. */
function allTrailerLines(c: CommitInfo): Trailer[] {
  const fromBody = c.message
    .split('\n')
    .map((line) => /^([A-Za-z-]+):\s*(.+)$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ key: m[1]!, value: m[2]! }));
  return [...c.trailers, ...fromBody];
}

export function detectTrailer(c: CommitInfo): Attribution | null {
  for (const { key, value } of allTrailerLines(c)) {
    const k = key.toLowerCase();
    if (COAUTHOR_TRAILER_KEYS.includes(k)) {
      const tool = toolFor(value);
      if (tool) return { commit: c.hash, source: 'trailer', confidence: 'high', tool };
    }
    if (AI_TRAILER_KEYS.includes(k)) {
      return { commit: c.hash, source: 'trailer', confidence: 'high', tool: toolFor(value) };
    }
  }
  return null;
}

export function detectNotes(c: CommitInfo, notes: Map<string, string>): Attribution | null {
  const note = notes.get(c.hash);
  if (note === undefined) return null;
  return { commit: c.hash, source: 'notes', confidence: 'high', tool: toolFor(note) };
}

export function detectAuthor(c: CommitInfo): Attribution | null {
  for (const { tool, pattern } of AI_AUTHOR_PATTERNS) {
    if (pattern.test(c.authorName) || pattern.test(c.authorEmail)) {
      return { commit: c.hash, source: 'author', confidence: 'high', tool };
    }
  }
  return null;
}
