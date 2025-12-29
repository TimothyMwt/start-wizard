export type StartWizardRunMode = 'local' | 'dev' | 'prod';

export type StartWizardMode = StartWizardRunMode;

export type StartWizardModeSpec = {
  id: StartWizardRunMode;
  label: string;
};

export type StartWizardPortPlanEntry = {
  port: number;
  desiredService: string;
  /**
   * If true, the wizard may offer a “choose a different port” option.
   * If false/omitted, port conflicts must be resolved by killing or aborting.
   */
  flexible?: boolean;
  /**
   * Optional link back to a product option name.
   * If the wizard user chooses a different port for this entry, the CLI can
   * update `ctx.options[optionName]` automatically.
   */
  optionName?: string;
};

export type StartWizardProductOptionValues = Record<string, unknown>;

export type StartWizardOptionCommon = {
  /**
   * Logical option name used as the key in `ctx.options`.
   * Must be unique within a product.
   */
  name: string;
  /** Optional CLI flag name without leading dashes, e.g. `port` for `--port` */
  flag?: string;
  description?: string;
};

export type StartWizardOptionSpec =
  | (StartWizardOptionCommon & {
      kind: 'string';
      defaultValue?: string;
      required?: boolean;
      prompt?: { question: string; defaultValue?: string };
    })
  | (StartWizardOptionCommon & {
      kind: 'number';
      defaultValue?: number;
      required?: boolean;
      min?: number;
      max?: number;
      prompt?: { question: string; defaultValue?: string };
    })
  | (StartWizardOptionCommon & {
      kind: 'boolean';
      defaultValue?: boolean;
      prompt?: { question: string; defaultValue?: boolean };
    })
  | (StartWizardOptionCommon & {
      kind: 'select';
      options: Array<{ id: string; label: string }>;
      defaultId?: string;
      prompt?: { title: string; defaultIndex?: number };
    });

export type StartWizardLocalStack = {
  /**
   * Called by the CLI when `mode=local` and the user wants to start/restart the
   * shared local backend stack (emulators + API).
   */
  start?: (ctx: StartWizardContext) => Promise<void> | void;
  /**
   * Called by the CLI when `mode=local` and the user explicitly chooses restart
   * or when the CLI needs to stop the shared local stack before starting fresh.
   */
  stop?: (ctx: StartWizardContext) => Promise<void> | void;
  /**
   * Optional ports that represent the shared local stack.
   * If provided, the CLI can detect whether a local stack is already running
   * and offer “reuse” vs “restart”.
   */
  ports?: (ctx: StartWizardContext) => StartWizardPortPlanEntry[];
};

export type StartWizardContext = {
  repoRoot: string;
  productId: string;
  mode: StartWizardRunMode;
  /**
   * Parsed common CLI args (always present).
   * Product-specific options live in `options`.
   */
  args: {
    yes: boolean;
    kill: boolean;
    allowProd: boolean;
    install?: boolean;
    /**
     * Raw argv (excluding `node` and script path).
     * Useful for pass-through behaviors.
     */
    rawArgv: string[];
  };
  /**
   * Product-defined option values collected via flags/prompts.
   */
  options: StartWizardProductOptionValues;
  /**
   * Any args after `--` are passed through verbatim for repo-specific start commands.
   */
  passThroughArgs: string[];
};

export type StartWizardProduct = {
  id: string;
  label: string;
  /**
   * Optional product-specific options (for flags + prompts).
   * The CLI is responsible for collecting these into `ctx.options`.
   */
  options?: StartWizardOptionSpec[];
  /**
   * Port plan for this product, used for conflict detection.
   * If omitted, the CLI will not perform port conflict checks for this product.
   */
  portPlan?: (ctx: StartWizardContext) => StartWizardPortPlanEntry[];
  /**
   * Start the product (e.g. spawn Next/Expo/custom command).
   * Must throw on failure (fail-fast).
   */
  start: (ctx: StartWizardContext) => Promise<void> | void;
};

export type StartWizardConfig = {
  /**
   * Optional config version to support future breaking changes.
   * v0.1 uses version 1.
   */
  version?: 1;
  /**
   * The set of products available in this repo.
   */
  products: StartWizardProduct[];
  /**
   * Optional mode definitions (labels). Defaults to local/dev/prod.
   */
  modes?: StartWizardModeSpec[];
  /**
   * Optional shared local backend stack controls.
   */
  localStack?: StartWizardLocalStack;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  assert(typeof value === 'string' && value.trim() !== '', `${name} must be a non-empty string.`);
}

function assertId(value: unknown, name: string): asserts value is string {
  assertNonEmptyString(value, name);
  // Keep ids CLI-friendly and stable.
  assert(/^[a-z][a-z0-9-]*$/.test(value), `${name} must match /^[a-z][a-z0-9-]*$/.`);
}

function validateModeSpecs(modes: unknown): StartWizardModeSpec[] {
  if (modes === undefined) {
    return [
      { id: 'local', label: 'local (local API + emulators)' },
      { id: 'dev', label: 'dev (cloud dev backend)' },
      { id: 'prod', label: 'prod (cloud prod backend)' },
    ];
  }
  assert(Array.isArray(modes) && modes.length > 0, 'modes must be a non-empty array.');
  const seen = new Set<string>();
  return modes.map((m, i) => {
    assert(isPlainObject(m), `modes[${i}] must be an object.`);
    const id = m.id;
    assert(id === 'local' || id === 'dev' || id === 'prod', `modes[${i}].id must be local|dev|prod.`);
    assertNonEmptyString(m.label, `modes[${i}].label`);
    assert(!seen.has(id), `Duplicate mode id: ${id}`);
    seen.add(id);
    return { id, label: m.label };
  });
}

function validateOptionSpec(opt: unknown, idx: number): StartWizardOptionSpec {
  assert(isPlainObject(opt), `options[${idx}] must be an object.`);
  assertNonEmptyString(opt.name, `options[${idx}].name`);
  const flag = opt.flag;
  if (flag !== undefined) {
    assertNonEmptyString(flag, `options[${idx}].flag`);
    assert(/^[a-z0-9][a-z0-9-]*$/.test(flag), `options[${idx}].flag must match /^[a-z0-9][a-z0-9-]*$/.`);
  }

  const kind = opt.kind;
  assert(typeof kind === 'string', `options[${idx}].kind is required.`);

  if (kind === 'string') return opt as StartWizardOptionSpec;
  if (kind === 'number') return opt as StartWizardOptionSpec;
  if (kind === 'boolean') return opt as StartWizardOptionSpec;
  if (kind === 'select') {
    const options = (opt as Record<string, unknown>).options;
    assert(Array.isArray(options) && options.length >= 2, `options[${idx}].options must be an array (min 2).`);
    const ids = new Set<string>();
    for (let j = 0; j < options.length; j += 1) {
      const entry = options[j];
      assert(isPlainObject(entry), `options[${idx}].options[${j}] must be an object.`);
      assertNonEmptyString(entry.id, `options[${idx}].options[${j}].id`);
      assertNonEmptyString(entry.label, `options[${idx}].options[${j}].label`);
      assert(!ids.has(entry.id), `options[${idx}].options has duplicate id: ${entry.id}`);
      ids.add(entry.id);
    }
    return opt as StartWizardOptionSpec;
  }

  throw new Error(`options[${idx}].kind must be one of: string, number, boolean, select.`);
}

function validateProduct(p: unknown, idx: number): StartWizardProduct {
  assert(isPlainObject(p), `products[${idx}] must be an object.`);
  assertId(p.id, `products[${idx}].id`);
  assertNonEmptyString(p.label, `products[${idx}].label`);
  assert(typeof p.start === 'function', `products[${idx}].start must be a function.`);

  if (p.options !== undefined) {
    assert(Array.isArray(p.options), `products[${idx}].options must be an array.`);
    const seenNames = new Set<string>();
    const seenFlags = new Set<string>();
    for (let i = 0; i < p.options.length; i += 1) {
      const opt = validateOptionSpec(p.options[i], i);
      assert(!seenNames.has(opt.name), `Duplicate option name "${opt.name}" in product "${p.id}".`);
      seenNames.add(opt.name);
      if (opt.flag) {
        assert(!seenFlags.has(opt.flag), `Duplicate option flag "${opt.flag}" in product "${p.id}".`);
        seenFlags.add(opt.flag);
      }
    }
  }

  if (p.portPlan !== undefined) {
    assert(typeof p.portPlan === 'function', `products[${idx}].portPlan must be a function.`);
  }

  return p as StartWizardProduct;
}

function validateConfigOrThrow(config: unknown): StartWizardConfig {
  assert(isPlainObject(config), 'Config must be an object.');
  const version = config.version;
  if (version !== undefined) {
    assert(version === 1, 'config.version must be 1 (or omitted).');
  }

  assert(Array.isArray(config.products) && config.products.length > 0, 'config.products must be a non-empty array.');
  const products = config.products.map((p, i) => validateProduct(p, i));

  const modes = validateModeSpecs(config.modes);

  if (config.localStack !== undefined) {
    assert(isPlainObject(config.localStack), 'config.localStack must be an object.');
    if (config.localStack.start !== undefined) {
      assert(typeof config.localStack.start === 'function', 'config.localStack.start must be a function.');
    }
    if (config.localStack.stop !== undefined) {
      assert(typeof config.localStack.stop === 'function', 'config.localStack.stop must be a function.');
    }
    if (config.localStack.ports !== undefined) {
      assert(typeof config.localStack.ports === 'function', 'config.localStack.ports must be a function.');
    }
  }

  return {
    version: 1,
    products,
    modes,
    localStack: config.localStack as StartWizardLocalStack | undefined,
  };
}

/**
 * Define a repo’s `start-wizard.config.mjs` with runtime validation.
 *
 * Usage (repo root):
 * ```js
 * import { defineConfig } from '@timothymwt/start-wizard-core';
 * export default defineConfig({ products: [...] });
 * ```
 */
export function defineConfig(config: StartWizardConfig): StartWizardConfig {
  return validateConfigOrThrow(config);
}


