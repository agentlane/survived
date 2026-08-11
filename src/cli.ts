#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { isGitRepo, headBranch } from './git/index.js';

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

await program.parseAsync(process.argv);
