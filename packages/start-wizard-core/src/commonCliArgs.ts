import type { StartWizardRunMode } from './startWizardConfig.js';

export type CommonCliArgs = {
  help: boolean;
  yes: boolean;
  kill: boolean;
  allowProd: boolean;
  install?: boolean;
  product?: string;
  mode?: StartWizardRunMode;
  configPath?: string;
  /**
   * Args before `--` that were not parsed as common flags.
   * Product-specific parsing happens later (in CLI) based on config.
   */
  remaining: string[];
  /**
   * Args after `--` (passed through to the product start command).
   */
  passThroughArgs: string[];
};

function takeValue(argv: string[], i: number): { value: string; nextIndex: number } {
  const value = argv[i + 1];
  if (!value) throw new Error(`Missing value for ${argv[i]}`);
  return { value, nextIndex: i + 1 };
}

export function parseCommonCliArgs(argv: string[]): CommonCliArgs {
  const beforeSeparator: string[] = [];
  const passThroughArgs: string[] = [];
  const sepIndex = argv.indexOf('--');
  if (sepIndex >= 0) {
    beforeSeparator.push(...argv.slice(0, sepIndex));
    passThroughArgs.push(...argv.slice(sepIndex + 1));
  } else {
    beforeSeparator.push(...argv);
  }

  const args: CommonCliArgs = {
    help: false,
    yes: false,
    kill: false,
    allowProd: false,
    remaining: [],
    passThroughArgs,
  };

  for (let i = 0; i < beforeSeparator.length; i += 1) {
    const token = beforeSeparator[i]!;
    if (!token.startsWith('-')) {
      args.remaining.push(token);
      continue;
    }
    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }
    if (token === '--yes') {
      args.yes = true;
      continue;
    }
    if (token === '--kill') {
      args.kill = true;
      continue;
    }
    if (token === '--allow-prod') {
      args.allowProd = true;
      continue;
    }
    if (token === '--install') {
      args.install = true;
      continue;
    }
    if (token === '--no-install') {
      args.install = false;
      continue;
    }
    if (token.startsWith('--product=')) {
      args.product = token.split('=')[1];
      continue;
    }
    if (token === '--product') {
      const { value, nextIndex } = takeValue(beforeSeparator, i);
      args.product = value;
      i = nextIndex;
      continue;
    }
    if (token.startsWith('--mode=')) {
      args.mode = token.split('=')[1] as StartWizardRunMode;
      continue;
    }
    if (token === '--mode') {
      const { value, nextIndex } = takeValue(beforeSeparator, i);
      args.mode = value as StartWizardRunMode;
      i = nextIndex;
      continue;
    }
    if (token.startsWith('--config=')) {
      args.configPath = token.split('=')[1];
      continue;
    }
    if (token === '--config') {
      const { value, nextIndex } = takeValue(beforeSeparator, i);
      args.configPath = value;
      i = nextIndex;
      continue;
    }

    // Keep unknown tokens for product-specific parsing.
    args.remaining.push(token);
  }

  return args;
}


