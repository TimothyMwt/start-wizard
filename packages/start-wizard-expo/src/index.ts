import { spawn } from 'node:child_process';
import path from 'node:path';

export const START_WIZARD_EXPO_VERSION = '0.0.0';

function ensureNodeModulesBinOnPath(projectDir: string, env: NodeJS.ProcessEnv): void {
  const binDir = path.join(projectDir, 'node_modules', '.bin');
  if (!env.PATH?.includes(binDir)) {
    env.PATH = env.PATH ? `${binDir}${path.delimiter}${env.PATH}` : binDir;
  }
}

export function spawnExpoStart({
  projectDir,
  env: rawEnv,
  devClient,
  go,
  extraArgs = [],
}: {
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  devClient?: boolean;
  go?: boolean;
  extraArgs?: string[];
}) {
  const env: NodeJS.ProcessEnv = { ...(rawEnv ?? process.env) };
  ensureNodeModulesBinOnPath(projectDir, env);

  const flags: string[] = [];
  if (devClient) flags.push('--dev-client');
  if (go) flags.push('--go');

  return spawn('npx', ['--no-install', 'expo', 'start', ...flags, ...extraArgs], {
    cwd: projectDir,
    stdio: 'inherit',
    env,
  });
}



