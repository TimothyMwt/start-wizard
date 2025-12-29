import { confirmPrompt } from './ttyPrompts.js';
import type { StartWizardRunMode } from './startWizardConfig.js';

/**
 * Enforce production guardrails.
 *
 * - In non-interactive mode, `--allow-prod` is required.
 * - In interactive mode, prompt unless `--allow-prod` or `--yes` is provided.
 */
export async function enforceProdGuard({
  mode,
  allowProd,
  yes,
}: {
  mode: StartWizardRunMode;
  allowProd: boolean;
  yes: boolean;
}): Promise<boolean> {
  if (mode !== 'prod') return allowProd;

  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isTty) {
    if (!allowProd) {
      throw new Error(
        'Refusing to run in prod mode without --allow-prod in non-interactive mode.'
      );
    }
    return true;
  }

  if (allowProd || yes) return true;

  const ok = await confirmPrompt({
    question: 'Prod mode will hit production services. Continue?',
    defaultValue: false,
  });
  if (!ok) {
    throw new Error('Aborted (prod mode not confirmed).');
  }
  return true;
}


