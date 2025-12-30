#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  collectPortConflicts,
  confirmPrompt,
  defineConfig,
  ensureInstall,
  enforceProdGuard,
  inputPrompt,
  isPortOpen,
  parseCommonCliArgs,
  resolvePortConflictsInteractively,
  selectPrompt,
} from '@timothymwt/start-wizard-core';
import type {
  StartWizardConfig,
  StartWizardContext,
  StartWizardOptionSpec,
  StartWizardPortPlanEntry,
  StartWizardProduct,
  StartWizardRunMode,
} from '@timothymwt/start-wizard-core';

const DEFAULT_CONFIG_FILENAME = 'start-wizard.config.mjs';

function isTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function printHelp(): void {
  // Keep short; docs live in repo README.
  console.log(`
Usage:
  start-wizard

Common flags:
  --product <id>
  --mode local|dev|prod
  --install | --no-install
  --kill                           Auto-kill conflicting listeners on required ports
  --yes                            Accept prompts automatically (required with --kill for non-interactive)
  --allow-prod                     Required for non-interactive prod mode
  --config <path>                  Path to start-wizard config (default: find ${DEFAULT_CONFIG_FILENAME} upwards)
  -h, --help

Pass-through:
  start-wizard -- --any-args-after-double-dash
`);
}

function findUpwards(startDir: string, filename: string): string | null {
  for (let dir = path.resolve(startDir); ; ) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveConfigPath({
  cwd,
  configPathArg,
}: {
  cwd: string;
  configPathArg?: string;
}): { repoRoot: string; configPath: string } {
  if (configPathArg) {
    const resolved = path.isAbsolute(configPathArg)
      ? configPathArg
      : path.resolve(cwd, configPathArg);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`);
    }
    return { repoRoot: path.dirname(resolved), configPath: resolved };
  }

  const found = findUpwards(cwd, DEFAULT_CONFIG_FILENAME);
  if (!found) {
    throw new Error(
      `Unable to find ${DEFAULT_CONFIG_FILENAME}. Run from your repo root or pass --config <path>.`
    );
  }
  return { repoRoot: path.dirname(found), configPath: found };
}

async function loadConfig(configPath: string): Promise<StartWizardConfig> {
  const url = pathToFileURL(configPath);
  // Bust module cache for repeated runs in the same node process (rare but safe).
  const mod = await import(`${url.href}?t=${Date.now()}`);
  const raw = (mod as { default?: unknown }).default;
  return defineConfig(raw as StartWizardConfig);
}

function requireMode(value: unknown): StartWizardRunMode {
  if (value === 'local' || value === 'dev' || value === 'prod') return value;
  throw new Error(`Invalid mode "${String(value)}". Expected local|dev|prod.`);
}

async function selectProduct(
  config: StartWizardConfig,
  productArg?: string
): Promise<StartWizardProduct> {
  if (productArg) {
    const product = config.products.find((p) => p.id === productArg);
    if (!product) {
      throw new Error(
        `Unknown product "${productArg}". Available: ${config.products
          .map((p) => p.id)
          .join(', ')}`
      );
    }
    return product;
  }

  if (!isTty()) {
    throw new Error(
      `Missing --product in non-interactive mode. Available: ${config.products
        .map((p) => p.id)
        .join(', ')}`
    );
  }

  const choice = await selectPrompt({
    title: 'Which product do you want to start?',
    options: config.products.map((p) => ({ id: p.id, label: p.label })),
    defaultIndex: 0,
  });
  if (!choice) throw new Error('Aborted.');
  const product = config.products.find((p) => p.id === choice.id);
  if (!product) throw new Error('Selected product not found.');
  return product;
}

async function selectMode(
  config: StartWizardConfig,
  modeArg?: string
): Promise<StartWizardRunMode> {
  if (modeArg) return requireMode(modeArg);

  if (!isTty()) {
    throw new Error('Missing --mode in non-interactive mode (local|dev|prod).');
  }

  const choice = await selectPrompt({
    title: 'Which backend mode?',
    options: (config.modes ?? []).map((m) => ({ id: m.id, label: m.label })),
    defaultIndex: 1, // dev
  });
  if (!choice) throw new Error('Aborted.');
  return requireMode(choice.id);
}

function parseOptionTokens(
  specs: StartWizardOptionSpec[] | undefined,
  tokens: string[]
): Record<string, unknown> {
  if (!specs?.length) {
    if (tokens.length) throw new Error(`Unknown args: ${tokens.join(' ')}`);
    return {};
  }
  const byFlag = new Map<string, StartWizardOptionSpec>();
  for (const spec of specs) {
    if (spec.flag) byFlag.set(spec.flag, spec);
  }

  const values: Record<string, unknown> = {};
  const unknown: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (!token.startsWith('-')) {
      unknown.push(token);
      continue;
    }
    if (token.startsWith('--no-')) {
      const flagName = token.slice('--no-'.length);
      const spec = byFlag.get(flagName);
      if (!spec || spec.kind !== 'boolean') {
        unknown.push(token);
        continue;
      }
      values[spec.name] = false;
      continue;
    }
    if (!token.startsWith('--')) {
      unknown.push(token);
      continue;
    }

    const eqIdx = token.indexOf('=');
    const flagName = (
      eqIdx >= 0 ? token.slice(2, eqIdx) : token.slice(2)
    ).trim();
    const inlineValue = eqIdx >= 0 ? token.slice(eqIdx + 1) : null;
    const spec = byFlag.get(flagName);
    if (!spec) {
      unknown.push(token);
      continue;
    }

    if (spec.kind === 'boolean') {
      if (inlineValue === null) {
        values[spec.name] = true;
      } else {
        const v = inlineValue.trim().toLowerCase();
        if (v === 'true' || v === '1') values[spec.name] = true;
        else if (v === 'false' || v === '0') values[spec.name] = false;
        else
          throw new Error(
            `Invalid boolean for --${flagName}: "${inlineValue}"`
          );
      }
      continue;
    }

    const rawValue =
      inlineValue !== null ? inlineValue : (tokens[i + 1] ?? null);
    if (rawValue === null) throw new Error(`Missing value for --${flagName}`);
    if (inlineValue === null) i += 1;

    if (spec.kind === 'string') {
      values[spec.name] = String(rawValue);
      continue;
    }
    if (spec.kind === 'number') {
      const n = Number.parseInt(String(rawValue), 10);
      if (!Number.isFinite(n))
        throw new Error(`Invalid number for --${flagName}: "${rawValue}"`);
      values[spec.name] = n;
      continue;
    }
    if (spec.kind === 'select') {
      values[spec.name] = String(rawValue);
      continue;
    }
    unknown.push(token);
  }

  if (unknown.length) {
    throw new Error(`Unknown args: ${unknown.join(' ')}`);
  }

  return values;
}

async function fillOptionDefaultsAndPrompts(
  specs: StartWizardOptionSpec[] | undefined,
  values: Record<string, unknown>,
  productId: string
): Promise<Record<string, unknown>> {
  if (!specs?.length) return values;

  for (const spec of specs) {
    if (values[spec.name] !== undefined) continue;

    if (spec.kind === 'boolean') {
      const v = spec.prompt
        ? await confirmPrompt({
            question: spec.prompt.question,
            defaultValue:
              spec.prompt.defaultValue ?? spec.defaultValue ?? false,
          })
        : (spec.defaultValue ?? false);
      values[spec.name] = v;
      continue;
    }

    if (spec.kind === 'select') {
      const allowed = new Set(spec.options.map((o) => o.id));
      const defaultId =
        spec.defaultId ??
        spec.options[spec.prompt?.defaultIndex ?? 0]?.id ??
        spec.options[0]?.id;
      if (!defaultId)
        throw new Error(`Invalid select spec for ${productId}.${spec.name}`);

      if (!isTty() && !spec.prompt) {
        values[spec.name] = defaultId;
        continue;
      }
      if (!isTty() && spec.prompt) {
        values[spec.name] = defaultId;
        continue;
      }

      const choice = await selectPrompt({
        title: spec.prompt?.title ?? `${spec.name}?`,
        options: spec.options.map((o) => ({ id: o.id, label: o.label })),
        defaultIndex:
          spec.prompt?.defaultIndex ??
          Math.max(
            0,
            spec.options.findIndex((o) => o.id === defaultId)
          ),
      });
      if (!choice) throw new Error('Aborted.');
      values[spec.name] = choice.id;
      if (!allowed.has(choice.id)) {
        throw new Error(
          `Invalid value for ${productId}.${spec.name}: "${choice.id}"`
        );
      }
      continue;
    }

    if (spec.kind === 'string') {
      const defaultValue = spec.prompt?.defaultValue ?? spec.defaultValue ?? '';
      if (!isTty()) {
        if (spec.required && defaultValue.trim() === '') {
          throw new Error(`Missing required option: ${productId}.${spec.name}`);
        }
        values[spec.name] = defaultValue;
        continue;
      }
      if (spec.prompt) {
        const v = await inputPrompt({
          question: spec.prompt.question,
          defaultValue,
          validate: (value) => {
            if (spec.required && value.trim() === '')
              return 'Value is required.';
            return null;
          },
        });
        values[spec.name] = v;
        continue;
      }
      if (spec.required)
        throw new Error(`Missing required option: ${productId}.${spec.name}`);
      values[spec.name] = defaultValue;
      continue;
    }

    if (spec.kind === 'number') {
      const defaultValue =
        spec.prompt?.defaultValue ??
        (spec.defaultValue !== undefined ? String(spec.defaultValue) : '');
      if (!isTty()) {
        if (spec.required && defaultValue.trim() === '') {
          throw new Error(`Missing required option: ${productId}.${spec.name}`);
        }
        const n =
          defaultValue.trim() === ''
            ? undefined
            : Number.parseInt(defaultValue, 10);
        if (n !== undefined && (!Number.isFinite(n) || n <= 0)) {
          throw new Error(
            `Invalid number default for ${productId}.${spec.name}`
          );
        }
        values[spec.name] = n ?? spec.defaultValue;
        continue;
      }
      if (spec.prompt) {
        const entered = await inputPrompt({
          question: spec.prompt.question,
          defaultValue,
          validate: (value) => {
            if (spec.required && value.trim() === '')
              return 'Value is required.';
            const n = Number.parseInt(value, 10);
            if (!Number.isFinite(n) || n <= 0)
              return 'Must be a positive number.';
            if (spec.min !== undefined && n < spec.min)
              return `Must be >= ${spec.min}.`;
            if (spec.max !== undefined && n > spec.max)
              return `Must be <= ${spec.max}.`;
            return null;
          },
        });
        values[spec.name] = Number.parseInt(entered, 10);
        continue;
      }
      if (spec.required)
        throw new Error(`Missing required option: ${productId}.${spec.name}`);
      if (spec.defaultValue !== undefined)
        values[spec.name] = spec.defaultValue;
      continue;
    }
  }

  // Validate select option values and number bounds after filling.
  for (const spec of specs) {
    const v = values[spec.name];
    if (v === undefined) continue;
    if (spec.kind === 'select') {
      const allowed = new Set(spec.options.map((o) => o.id));
      if (!allowed.has(String(v))) {
        throw new Error(
          `Invalid value for ${productId}.${spec.name}: "${String(v)}". Allowed: ${[
            ...allowed,
          ].join(', ')}`
        );
      }
    }
    if (spec.kind === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n))
        throw new Error(`Invalid number for ${productId}.${spec.name}`);
      if (spec.min !== undefined && n < spec.min)
        throw new Error(`${productId}.${spec.name} must be >= ${spec.min}`);
      if (spec.max !== undefined && n > spec.max)
        throw new Error(`${productId}.${spec.name} must be <= ${spec.max}`);
    }
  }

  return values;
}

function validatePortPlan(
  plan: StartWizardPortPlanEntry[] | undefined
): StartWizardPortPlanEntry[] {
  if (!plan) return [];
  if (!Array.isArray(plan)) throw new Error('portPlan must return an array.');
  return plan.map((p, i) => {
    if (!p || typeof p !== 'object')
      throw new Error(`portPlan[${i}] must be an object.`);
    const port = (p as StartWizardPortPlanEntry).port;
    const desiredService = (p as StartWizardPortPlanEntry).desiredService;
    if (!Number.isFinite(port) || port <= 0)
      throw new Error(`portPlan[${i}].port must be a positive number.`);
    if (typeof desiredService !== 'string' || desiredService.trim() === '') {
      throw new Error(
        `portPlan[${i}].desiredService must be a non-empty string.`
      );
    }
    return p as StartWizardPortPlanEntry;
  });
}

async function handleLocalStack({
  config,
  baseCtx,
  stackPorts,
}: {
  config: StartWizardConfig;
  baseCtx: StartWizardContext;
  stackPorts: StartWizardPortPlanEntry[];
}): Promise<{ ignorePorts: Set<number> }> {
  if (baseCtx.mode !== 'local') return { ignorePorts: new Set() };
  if (!config.localStack?.start) return { ignorePorts: new Set() };

  // In local mode, localStack owns these ports. We should never treat them as
  // product-level conflicts after the stack is started/reused.
  const ignorePorts = new Set<number>(stackPorts.map((p) => p.port));

  const anyUp = await (async () => {
    for (const entry of stackPorts) {
      if (await isPortOpen({ port: entry.port, timeoutMs: 500 })) return true;
    }
    return false;
  })();

  if (anyUp && isTty()) {
    const choice = await selectPrompt({
      title:
        'Local backend services detected (ports in use). What do you want to do?',
      options: [
        { id: 'reuse', label: 'Reuse running local services' },
        {
          id: 'restart',
          label: 'Restart them (stop existing listeners, then start fresh)',
        },
      ],
      defaultIndex: 0,
    });
    if (!choice) throw new Error('Aborted.');
    if (choice.id === 'reuse') {
      return { ignorePorts };
    }
    if (choice.id === 'restart') {
      if (config.localStack.stop) {
        await config.localStack.stop(baseCtx);
      }
      // Fail-fast: if any localStack ports are still held after stop, resolve
      // them *before* starting anything that will spam logs to the TTY.
      const conflictsAfterStop = await collectPortConflicts(stackPorts);
      await resolvePortConflictsInteractively({
        conflicts: conflictsAfterStop,
        kill: baseCtx.args.kill,
        yes: baseCtx.args.yes,
      });
      await config.localStack.start(baseCtx);
      return { ignorePorts };
    }
  }

  if (anyUp && !isTty()) {
    // Non-interactive: default to reuse to avoid accidental kills.
    return { ignorePorts };
  }

  const shouldStart = baseCtx.args.yes
    ? true
    : await confirmPrompt({
        question:
          'No local backend detected. Start required local services now?',
        defaultValue: true,
      });
  if (!shouldStart) throw new Error('Aborted (local backend not started).');

  // Resolve any unexpected conflicts *before* starting the stack (so the user
  // can actually interact with prompts without concurrent log spam).
  const conflictsBeforeStart = await collectPortConflicts(stackPorts);
  await resolvePortConflictsInteractively({
    conflicts: conflictsBeforeStart,
    kill: baseCtx.args.kill,
    yes: baseCtx.args.yes,
  });

  await config.localStack.start(baseCtx);
  return { ignorePorts };
}

export async function runStartWizard({
  argv,
  cwd,
}: {
  argv: string[];
  cwd: string;
}): Promise<void> {
  const parsed = parseCommonCliArgs(argv);
  if (parsed.help) {
    printHelp();
    return;
  }

  const { repoRoot, configPath } = resolveConfigPath({
    cwd,
    configPathArg: parsed.configPath,
  });

  const config = await loadConfig(configPath);

  const product = await selectProduct(config, parsed.product);
  const mode = await selectMode(config, parsed.mode);

  const allowProd = await enforceProdGuard({
    mode,
    allowProd: parsed.allowProd,
    yes: parsed.yes,
  });

  await ensureInstall({
    repoRoot,
    installChoice: parsed.install,
    yes: parsed.yes,
  });

  const optionValuesFromFlags = parseOptionTokens(
    product.options,
    parsed.remaining
  );
  const options = await fillOptionDefaultsAndPrompts(
    product.options,
    optionValuesFromFlags,
    product.id
  );

  const baseCtx: StartWizardContext = {
    repoRoot,
    productId: product.id,
    mode,
    args: {
      yes: parsed.yes,
      kill: parsed.kill,
      allowProd,
      install: parsed.install,
      rawArgv: argv,
    },
    options,
    passThroughArgs: parsed.passThroughArgs,
  };

  const stackPorts =
    baseCtx.mode === 'local'
      ? validatePortPlan(config.localStack?.ports?.(baseCtx))
      : [];
  const stackIgnorePorts = new Set<number>(stackPorts.map((p) => p.port));

  // IMPORTANT: resolve product port conflicts *before* starting the local stack,
  // otherwise background logs will corrupt interactive prompts.
  const productPortPlan = validatePortPlan(product.portPlan?.(baseCtx)).filter(
    (p) => !(baseCtx.mode === 'local' && stackIgnorePorts.has(p.port))
  );
  const productConflicts = await collectPortConflicts(productPortPlan);
  await resolvePortConflictsInteractively({
    conflicts: productConflicts,
    kill: parsed.kill,
    yes: parsed.yes,
  });

  // Apply flexible port changes back into ctx.options when mapped.
  for (const conflict of productConflicts) {
    if (Number.isFinite(conflict.newPort) && conflict.optionName) {
      baseCtx.options[conflict.optionName] = conflict.newPort;
    }
  }

  await handleLocalStack({ config, baseCtx, stackPorts });

  console.log('');
  console.log('Starting…');
  console.log(`  repoRoot=${repoRoot}`);
  console.log(`  product=${product.id}`);
  console.log(`  mode=${mode}`);
  console.log('');

  await product.start(baseCtx);
}

async function main(): Promise<void> {
  await runStartWizard({ argv: process.argv.slice(2), cwd: process.cwd() });
}

// Only auto-run when executed as a CLI entrypoint, not when imported (e.g. tests).
const isEntrypoint = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return pathToFileURL(entry).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  main().catch((err) => {
    console.error(`\n❌ start-wizard failed: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
