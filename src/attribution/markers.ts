/**
 * Marker data for AI attribution. Kept as one data file on purpose: this
 * list will grow, and detectors should not need to change when it does.
 */

export interface ToolMarker {
  tool: string;
  pattern: RegExp;
}

/** Matched against Co-Authored-By values, trailer values, and author identities. */
export const AI_TOOL_MARKERS: ToolMarker[] = [
  { tool: 'claude', pattern: /claude|anthropic/i },
  { tool: 'copilot', pattern: /copilot/i },
  { tool: 'cursor', pattern: /cursor/i },
  { tool: 'aider', pattern: /aider/i },
  { tool: 'codex', pattern: /codex/i },
  { tool: 'gemini', pattern: /gemini|jules/i },
  { tool: 'devin', pattern: /devin/i },
  { tool: 'windsurf', pattern: /windsurf/i },
  { tool: 'sweep', pattern: /sweep/i },
];

/** Trailer keys whose mere presence marks a commit as AI-attributed. */
export const AI_TRAILER_KEYS = ['assisted-by', 'generated-by', 'ai-generated'];

/** Trailer keys whose VALUE must match an AI tool marker. */
export const COAUTHOR_TRAILER_KEYS = ['co-authored-by'];

/**
 * Commit author identities of known agents. github-actions is deliberately
 * absent: it only counts as AI when combined with an AI trailer, and in that
 * case the trailer detector already claims the commit.
 */
export const AI_AUTHOR_PATTERNS: ToolMarker[] = [
  { tool: 'claude', pattern: /^claude(\[bot\])?$|anthropic\.com/i },
  { tool: 'copilot', pattern: /^(github-)?copilot(\[bot\])?$/i },
  { tool: 'cursor', pattern: /^cursor( ?agent)?(\[bot\])?$|cursor\.(sh|com)/i },
  { tool: 'aider', pattern: /^aider(\[bot\])?$/i },
  { tool: 'codex', pattern: /^codex(\[bot\])?$|openai\.com/i },
  { tool: 'gemini', pattern: /^(google-)?(gemini|jules)(-agent)?(\[bot\])?$/i },
  { tool: 'devin', pattern: /^devin\b|devin\.ai/i },
  { tool: 'windsurf', pattern: /^windsurf(\[bot\])?$/i },
  { tool: 'sweep', pattern: /^sweep(-ai)?(\[bot\])?$/i },
];

/** Message phrasing that agents commonly emit (heuristic signal S1). */
export const AGENT_PHRASING_PATTERNS: RegExp[] = [
  /generated with \[?(claude|copilot|cursor|aider|codex|gemini|devin|windsurf|sweep)/i,
  /🤖 generated/iu,
  /^aider(:| chat)/im,
  /co-authored by ai/i,
  /this commit was (written|created|generated) by an? (ai|agent|llm)/i,
];

/** Notes refs consulted by the notes detector (read-only). */
export const AI_NOTES_REFS = ['ai'];
