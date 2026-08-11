import { spawn } from 'node:child_process';

export class GitError extends Error {
  constructor(
    readonly gitArgs: string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(`git ${gitArgs.join(' ')} failed (exit ${exitCode}): ${stderr.trim()}`);
    this.name = 'GitError';
  }
}

export interface RunGitOptions {
  stdin?: string;
  /** Exit codes besides 0 that resolve instead of throwing. */
  allowExitCodes?: number[];
}

interface RunGitResult {
  stdout: Buffer;
  exitCode: number;
}

function runGitRaw(repoPath: string, args: string[], opts: RunGitOptions = {}): Promise<RunGitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoPath });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', reject);
    if (opts.stdin !== undefined) child.stdin.write(opts.stdin);
    child.stdin.end();
    child.on('close', (code) => {
      if (code === 0 || (code !== null && opts.allowExitCodes?.includes(code))) {
        resolve({ stdout: Buffer.concat(out), exitCode: code ?? 0 });
      } else {
        reject(new GitError(args, code, Buffer.concat(err).toString('utf8')));
      }
    });
  });
}

export async function runGit(repoPath: string, args: string[], opts?: RunGitOptions): Promise<string> {
  const { stdout } = await runGitRaw(repoPath, args, opts);
  return stdout.toString('utf8');
}

export async function runGitBuffer(repoPath: string, args: string[], opts?: RunGitOptions): Promise<Buffer> {
  const { stdout } = await runGitRaw(repoPath, args, opts);
  return stdout;
}

export async function runGitExitCode(repoPath: string, args: string[], opts?: RunGitOptions): Promise<{ stdout: string; exitCode: number }> {
  const { stdout, exitCode } = await runGitRaw(repoPath, args, opts);
  return { stdout: stdout.toString('utf8'), exitCode };
}
