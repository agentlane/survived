# survived

Measures how much AI-generated code in a git repository is still alive after
30, 60, and 90 days — next to a human baseline from the same repository.

`survived` is read-only and local-first: it never modifies your repository,
never touches git state, and makes zero network calls. It reports durability
(lines surviving unmodified). It does not judge code.

## Install

```bash
npx survived            # run without installing
npm install -g survived # or install globally
```

Requires Node.js >= 20 and the `git` binary on PATH.

## Usage

```bash
npx survived                          # headline report for the current repo
survived scan                         # attribution coverage only (fast spike)
survived --json > result.json         # full machine-readable result
survived --html --out report.html     # self-contained report with charts
survived --md --out SURVIVAL.md       # markdown report
survived --since 2024-01-01           # limit analysis window
survived --max-commits 5000           # cap analysed commits
survived --no-heuristics              # high-confidence attribution only
```

Exit codes: `0` report produced · `1` unusable repository · `2` usage error.

## Sample output

Real output, produced from this package's synthetic test fixture (a scripted
repository timeline — an AI commit whose lines are partly rewritten at day 20
and partly deleted at day 70):

```
$ survived scan
survived scan — attribution coverage

  commits analysed     7  (2024-01-01 → 2024-04-05)
  AI-attributed        3  (3 high confidence, 0 estimated)
  per detector         trailer 2 · notes 1 · author 0 · heuristic 0

  added lines          85 total
  AI-attributed lines  55 high confidence (64.7%) · 0 estimated (0.0%)

  estimated figures come from heuristics and are reported separately;
  they are never blended into the high-confidence numbers.
```

```
$ survived
survived — AI code survival report
  range          2024-01-01 → 2024-04-05 · 7 commits analysed
  AI-attributed  3 commits high confidence · 0 estimated · 55 added lines
  human baseline 4 of 4 non-AI commits (seeded sample)

  survival       30d          60d          90d
  AI (high)      63.6%        55.6%        25.0%
  AI (estimated) —            —            —
  human          100.0%       100.0%       —

  dead AI lines (high, 90d): 66.7% rewritten · 33.3% deleted
  not yet measurable at 90d: 15 AI-attributed lines (excluded)
  worst-surviving directory: src (25.0%)

  estimated tier is heuristic and reported separately — never blended.
  full data: survived --json · charts: survived --html --out report.html
```

## How attribution works

A commit is **AI-attributed** when any detector matches it; a commit is
counted once, and the strongest detector wins.

| Detector | Confidence | Signal |
| --- | --- | --- |
| Trailer | high | `Co-Authored-By:` naming a known agent (Claude, Copilot, Cursor, Aider, Codex, Gemini, Devin, Windsurf, Sweep), or `Assisted-by:` / `Generated-by:` / `AI-Generated:` trailers |
| Git notes | high | notes under `refs/notes/ai` (consumed read-only, never written) |
| Author | high | commit author identity of a known agent (`claude[bot]`, `devin-ai…`, …) |
| Heuristic | **estimated** | two or more weak signals together: agent-style message phrasing, >300 added lines with <5% deletions, commits within 120s by the same author, emoji-free imperative subject plus bullet-list body |

An **AI-attributed line** is a line added by an AI-attributed commit. A line
**survives** at T days when the snapshot commit (the last commit within T days
of the line's commit) still blames it to that commit — unmodified since.
Dead lines are split into **rewritten** (file exists, line replaced) and
**deleted** (line or file gone).

## Confidence labelling

Two tiers, never blended:

- **high confidence** — explicit markers (trailers, notes, author identity).
- **estimated** — heuristics. Always labelled, always reported separately.

When a repository carries fewer than 50 AI-attributed added lines, `survived`
says the coverage is too low to be meaningful instead of printing
percentages. The `--json` output keeps raw counts in that case and sets
`"lowCoverage": true`.

## Methodology

A commit is AI-attributed when a commit trailer, git note, or author identity
marks it as agent-authored (high confidence), or when two or more weaker
signals fire together (estimated). A line survives at T days when the
snapshot commit — the last commit whose committer date falls within T days of
the line's commit — still blames the line to that commit, meaning it was
never modified since. Rewritten means the file still exists with replacement
content; deleted means the line or its file is gone. Cohorts younger than T
days are excluded as not yet measurable, never counted as surviving.
Estimated figures come from heuristics and are always reported separately
from high-confidence figures, never blended into a single number. The human
baseline runs the identical computation over a seeded random sample of
non-AI commits from the same repository. This tool measures durability only:
how long lines remain unmodified. Durability is not a judgement of the code
itself.

## Cache

Results of expensive git operations are cached content-addressed in
`.survived/cache` inside the analysed repository. **Add `.survived/` to your
`.gitignore`** — `survived` deliberately never writes to your repository, not
even to `.gitignore`. Warm runs are typically several times faster; deleting
the directory is always safe.

## Related tools

- **Git AI notes** — if your workflow records AI attribution as git notes
  (`refs/notes/ai`), `survived` consumes them as a high-confidence signal.
  Complementary: those tools write attribution at commit time; `survived`
  reads it at measurement time.
- **[agent-ready](https://github.com/agentlane/agent-ready)** — gates issues
  for completeness *before* an AI agent starts work; `survived` measures what
  happened to the agent's code *after* it landed. Upstream quality gate,
  downstream durability measurement.

## Limitations

- Shallow clones cannot be analysed (blame needs full history) — run
  `git fetch --unshallow` first.
- Lines moved to a different file count as deleted; only moves within the
  same file survive.
- Merge commits contribute no added lines; blame attributes their lines to
  the original commits.
- Attribution is only as good as your markers. Repositories where agents
  commit without trailers, notes, or distinct authors will undercount AI
  code, and the heuristic tier is explicitly an estimate.

## FAQ

**Does this judge code quality?** No. `survived` measures durability — how
long lines stay unmodified — and reports what happened. Short-lived code can
be scaffolding that served its purpose; long-lived code can be code nobody
dares touch. The numbers are observations, not verdicts.

**Does it send anything anywhere?** No. Zero network I/O — enforced by a
test that fails if any network module is imported.

**Does it write to my repository?** No. The only writes are its own cache
(`.survived/`) and report files you explicitly request with `--out`.

**Why do my percentages differ between runs?** They shouldn't: the human
baseline sample is seeded and deterministic. If history changed (rebase,
force-push), snapshot commits and blame results legitimately change.

**Can it write attribution for future commits?** No — out of scope by
design. Use commit trailers or Git AI-style notes at commit time; `survived`
will pick them up.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
