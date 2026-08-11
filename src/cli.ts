#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { isGitRepo, headBranch } from './git/index.js';
import { scanRepo } from './attribution/scan.js';
import { renderScan } from './report/scan.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const program = new Command();

program
  .name('survived')
  .description(
    'Measures how much AI-generated code in a git repository is still alive after 30/60/90 days, next to a human baseline.',
  )
  .version(pkg.version)
  .action(async () => {
    const cwd = process.cwd();
    if (!(await isGitRepo(cwd))) {
      process.stderr.write(
        'survived: not a git repository. Run survived from inside the repository you want to analyse.\n',
      );
      process.exit(1);
    }
    const branch = await headBranch(cwd);
    process.stdout.write(
      `git repository detected (branch: ${branch ?? 'detached HEAD'}). Run "survived --help" for available commands.\n`,
    );
  });

async function requireRepo(): Promise<string> {
  const cwd = process.cwd();
  if (!(await isGitRepo(cwd))) {
    process.stderr.write(
      'survived: not a git repository. Run survived from inside the repository you want to analyse.\n',
    );
    process.exit(1);
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

await program.parseAsync(process.argv);
