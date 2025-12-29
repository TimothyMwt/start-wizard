import { spawn } from 'node:child_process';
import path from 'node:path';

export const START_WIZARD_NEXT_VERSION = '0.0.0';

function ensureNodeModulesBinOnPath(projectDir: string, env: NodeJS.ProcessEnv): void {
  const binDir = path.join(projectDir, 'node_modules', '.bin');
  if (!env.PATH?.includes(binDir)) {
    env.PATH = env.PATH ? `${binDir}${path.delimiter}${env.PATH}` : binDir;
  }
}

export function spawnNextDev({
  projectDir,
  port,
  env: rawEnv,
  extraArgs = [],
}: {
  projectDir: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
  extraArgs?: string[];
}) {
  const env: NodeJS.ProcessEnv = { ...(rawEnv ?? process.env) };
  ensureNodeModulesBinOnPath(projectDir, env);

  const args = ['next', 'dev', ...(port ? ['-p', String(port)] : []), ...extraArgs];
  return spawn('npx', ['--no-install', ...args], {
    cwd: projectDir,
    stdio: 'inherit',
    env,
  });
}



