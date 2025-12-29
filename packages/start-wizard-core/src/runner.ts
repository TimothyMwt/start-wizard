import { spawnSync } from 'node:child_process';

export function runCommandOrThrow(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): void {
  const res = spawnSync(command, args, {
    cwd: opts.cwd,
    stdio: 'inherit',
    env: opts.env ?? process.env,
  });
  if (res.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (exit ${
        res.status ?? 'unknown'
      })`
    );
  }
}


