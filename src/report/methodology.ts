/**
 * Canonical methodology and confidence caveats. Included verbatim in the
 * HTML report footer (product requirement) and reused by the README.
 * Copy rules: never describes code as high or low calibre, never judges —
 * durability numbers only. Must not contain the substring "http" (the HTML
 * report is greped for it to prove zero network references).
 */
export const METHODOLOGY = `A commit is AI-attributed when a commit trailer, git note, or author identity marks it as agent-authored (high confidence), or when two or more weaker signals fire together (estimated). A line survives at T days when the snapshot commit — the last commit whose committer date falls within T days of the line's commit — still blames the line to that commit, meaning it was never modified since. Rewritten means the file still exists with replacement content; deleted means the line or its file is gone. Cohorts younger than T days are excluded as not yet measurable, never counted as surviving. Estimated figures come from heuristics and are always reported separately from high-confidence figures, never blended into a single number. The human baseline runs the identical computation over a seeded random sample of non-AI commits from the same repository. This tool measures durability only: how long lines remain unmodified. Durability is not a judgement of the code itself.`;
