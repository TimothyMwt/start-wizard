import readline from 'node:readline';

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export type SelectPromptOption = { id: string; label: string };

function renderSelect({
  title,
  options,
  selectedIndex,
  hint,
}: {
  title: string;
  options: SelectPromptOption[];
  selectedIndex: number;
  hint?: string;
}): string {
  const lines: string[] = [];
  lines.push(title);
  lines.push('');
  for (let i = 0; i < options.length; i += 1) {
    const prefix = i === selectedIndex ? '❯' : ' ';
    lines.push(`${prefix} ${options[i]?.label ?? String(options[i])}`);
  }
  if (hint) {
    lines.push('');
    lines.push(hint);
  }
  return lines.join('\n');
}

function clearScreen(): void {
  // ANSI clear screen + cursor to top-left
  process.stdout.write('\x1b[2J\x1b[0;0H');
}

/**
 * Arrow-key select prompt.
 *
 * - Requires TTY.
 * - Returns the selected option object, or null on Ctrl+C.
 */
export async function selectPrompt({
  title,
  options,
  defaultIndex = 0,
  hint = 'Use ↑/↓ and Enter.',
}: {
  title: string;
  options: SelectPromptOption[];
  defaultIndex?: number;
  hint?: string;
}): Promise<SelectPromptOption | null> {
  if (!isInteractive()) {
    throw new Error(`Cannot prompt without a TTY: ${title}`);
  }
  if (!Array.isArray(options) || options.length < 2) {
    throw new Error('selectPrompt requires at least 2 options.');
  }
  const normalizedDefaultIndex =
    defaultIndex >= 0 && defaultIndex < options.length ? defaultIndex : 0;
  let selectedIndex = normalizedDefaultIndex;

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  const cleanup = () => {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // ignore
    }
    process.stdin.removeAllListeners('keypress');
  };

  try {
    clearScreen();
    process.stdout.write(
      `${renderSelect({ title, options, selectedIndex, hint })}\n`
    );

    return await new Promise((resolve) => {
      process.stdin.on('keypress', (_str, key) => {
        if (!key) return;
        if (key.name === 'up') {
          selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        } else if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % options.length;
        } else if (key.name === 'return') {
          resolve(options[selectedIndex] ?? null);
          return;
        } else if (key.name === 'c' && key.ctrl) {
          process.exitCode = 130;
          resolve(null);
          return;
        } else {
          return;
        }

        clearScreen();
        process.stdout.write(
          `${renderSelect({ title, options, selectedIndex, hint })}\n`
        );
      });
    });
  } finally {
    cleanup();
  }
}

export async function confirmPrompt({
  question,
  defaultValue = true,
}: {
  question: string;
  defaultValue?: boolean;
}): Promise<boolean> {
  if (!isInteractive()) {
    return defaultValue;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const suffix = defaultValue ? '(Y/n)' : '(y/N)';
  return await new Promise((resolve) => {
    rl.question(`${question} ${suffix} `, (answer) => {
      rl.close();
      const trimmed = (answer ?? '').trim().toLowerCase();
      if (!trimmed) return resolve(defaultValue);
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

export async function inputPrompt({
  question,
  defaultValue = '',
  validate,
}: {
  question: string;
  defaultValue?: string;
  validate?: (value: string) => string | null;
}): Promise<string> {
  if (!isInteractive()) {
    if (validate) {
      const err = validate(defaultValue);
      if (err) throw new Error(err);
    }
    return defaultValue;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return await new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      const value = (answer ?? '').trim() || String(defaultValue);
      if (validate) {
        const err = validate(value);
        if (err) {
          throw new Error(err);
        }
      }
      resolve(value);
    });
  });
}


