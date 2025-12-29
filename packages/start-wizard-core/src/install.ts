import fs from 'node:fs';
import path from 'node:path';
import { confirmPrompt } from './ttyPrompts.js';
import { runCommandOrThrow } from './runner.js';

function hasNodeModules(repoRoot: string): boolean {
  return fs.existsSync(path.join(repoRoot, 'node_modules'));
}

/**
 * Ensure dependencies are installed (optional prompt).
 *
 * - If `installChoice === false`, do nothing.
 * - If `node_modules` exists and `installChoice` is undefined, do nothing.
 * - If `installChoice === true`, run `npm ci` immediately.
 * - Otherwise, prompt (or auto-accept in `--yes` mode).
 */
export async function ensureInstall({
  repoRoot,
  installChoice,
  yes,
}: {
  repoRoot: string;
  installChoice?: boolean;
  yes: boolean;
}): Promise<void> {
  if (installChoice === false) return;

  const hasDeps = hasNodeModules(repoRoot);
  if (hasDeps && installChoice !== true) return;

  const shouldInstall =
    installChoice === true ||
    (yes
      ? true
      : await confirmPrompt({
          question: hasDeps ? 'Re-run npm ci?' : 'Run npm ci now?',
          defaultValue: true,
        }));

  if (!shouldInstall) return;

  console.log('\nRunning npm ci...\n');
  runCommandOrThrow('npm', ['ci'], { cwd: repoRoot });
}


