export const START_WIZARD_CORE_VERSION = '0.0.0';

export { defineConfig } from './startWizardConfig.js';
export type {
  StartWizardConfig,
  StartWizardContext,
  StartWizardLocalStack,
  StartWizardMode,
  StartWizardModeSpec,
  StartWizardOptionSpec,
  StartWizardPortPlanEntry,
  StartWizardProduct,
  StartWizardProductOptionValues,
  StartWizardRunMode,
} from './startWizardConfig.js';

export {
  confirmPrompt,
  inputPrompt,
  selectPrompt,
  type SelectPromptOption,
} from './ttyPrompts.js';
export {
  describePid,
  formatPortConflicts,
  getListeningPidsOnPort,
  isPortOpen,
  killPid,
  waitForPortOpen,
} from './ports.js';
export { parseCommonCliArgs, type CommonCliArgs } from './commonCliArgs.js';
export {
  collectPortConflicts,
  resolvePortConflictsInteractively,
  type PortConflict,
} from './portConflicts.js';
export { enforceProdGuard } from './prodGuard.js';
export { ensureInstall } from './install.js';
export { runCommandOrThrow } from './runner.js';


