#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { isGitRepo, isShallowRepo, headBranch } from './git/index.js';
import { scanRepo } from './attribution/scan.js';
import { renderScan } from './report/scan.js';
import { analyseSurvival, type EngineOptions } from './survival/engine.js';
import { renderTerminal } from './report/terminal.js';
import { renderMarkdown } from './report/markdown.js';
import { renderJson } from './report/json.js';
import { renderHtml } from './report/html.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const program = new Command();

interface ReportFlags {
  json?: boolean;
  html?: boolean;
  md?: boolean;
  out?: string;
  heuristics: boolean;
  since?: string;
  maxCommits?: number;
}

program
  .name('survived')
  // Options after a subcommand belong to the subcommand — without this,
  // the root --no-heuristics shadows scan's own flag.
  .enablePositionalOptions()
  .description(
    'Measures how much AI-generated code in a git repository is still alive after 30/60/90 days, next to a human baseline.',
  )
  .version(pkg.version)
  .option('--json', 'emit the full machine-readable result')
  .option('--html', 'emit a single self-contained HTML report with charts')
  .option('--md', 'emit the report as markdown')
  .option('--out <file>', 'write the report to a file instead of stdout')
  .option('--no-heuristics', 'disable the estimated-confidence heuristic detector')
  .option('--since <date>', 'analyse only commits from this ISO date onward')
  .option('--max-commits <n>', 'analyse only the newest N commits', (v) => Number.parseInt(v, 10))
  .action(async (flags: ReportFlags) => {
    const formats = [flags.json && 'json', flags.html && 'html', flags.md && 'md'].filter(Boolean);
    if (formats.length > 1) {
      process.stderr.write('survived: pick one of --json, --html, --md.\n');
      process.exit(2);
    }
    const repo = await requireRepo();
    const opts: EngineOptions = { heuristics: flags.heuristics };
    if (flags.since !== undefined) opts.since = flags.since;
    if (flags.maxCommits !== undefined) opts.maxCommits = flags.maxCommits;
    const report = await analyseSurvival(repo, opts);
    const output = flags.json
      ? renderJson(report)
      : flags.html
        ? renderHtml(report)
        : flags.md
          ? renderMarkdown(report)
          : renderTerminal(report);
    if (flags.out !== undefined) {
      const path = resolve(repo, flags.out);
      await writeFile(path, output);
      process.stderr.write(`survived: report written to ${path}\n`);
    } else {
      process.stdout.write(output);
    }
  });

async function requireRepo(): Promise<string> {
  const cwd = process.cwd();
  if (!(await isGitRepo(cwd))) {
    process.stderr.write(
      'survived: not a git repository. Run survived from inside the repository you want to analyse.\n',
    );
    process.exit(1);
  }
  if (await isShallowRepo(cwd)) {
    process.stderr.write(
      'survived: this is a shallow clone — blame cannot attribute lines without full history.\n' +
        'Fetch the full history first: git fetch --unshallow\n',
    );
    process.exit(1);
  }
  if ((await headBranch(cwd)) === null) {
    process.stderr.write('survived: detached HEAD — analysing the current checkout as-is.\n');
  }
  return cwd;
}

program
  .command('scan')
  .description('print attribution coverage: how many commits and added lines are AI-attributed')
  .option('--no-heuristics', 'disable the estimated-confidence heuristic detector')
  .action(async (opts: { heuristics: boolean }) => {
    const repo = await requireRepo();
    const { summary } = await scanRepo(repo, { heuristics: opts.heuristics });
    process.stdout.write(renderScan(summary));
  });

program.addHelpText(
  'after',
  `
Examples:
  npx survived                          headline report for the current repo
  survived scan                         attribution coverage only (fast spike)
  survived --json > result.json         full machine-readable result
  survived --html --out report.html     self-contained report with charts
  survived --md --out SURVIVAL.md       markdown report
  survived --since 2024-01-01           limit analysis window
  survived --max-commits 5000           cap analysed commits
  survived --no-heuristics              high-confidence attribution only

Exit codes: 0 report produced · 1 unusable repository · 2 usage error`,
);

await program.parseAsync(process.argv);
