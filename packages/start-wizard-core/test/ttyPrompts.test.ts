import { describe, expect, test, vi } from 'vitest';

import { selectPrompt } from '../src/ttyPrompts.js';

function setLooseProp(obj: object, key: string, value: unknown): () => void {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  Object.defineProperty(obj, key, {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    if (desc) Object.defineProperty(obj, key, desc);
    else delete (obj as Record<string, unknown>)[key];
  };
}

describe('ttyPrompts.selectPrompt', () => {
  test('resumes stdin when paused (so keypresses are handled after readline closes)', async () => {
    const restores: Array<() => void> = [];

    // Force interactive mode.
    restores.push(setLooseProp(process.stdin, 'isTTY', true));
    restores.push(setLooseProp(process.stdout, 'isTTY', true));

    // Silence prompt rendering for the test.
    restores.push(
      setLooseProp(process.stdout, 'write', () => true)
    );

    // Stub TTY-only APIs.
    const resumeSpy = vi.fn();
    const pauseSpy = vi.fn();
    const setRawModeSpy = vi.fn();
    const isPausedSpy = vi.fn(() => true);

    restores.push(setLooseProp(process.stdin, 'resume', resumeSpy));
    restores.push(setLooseProp(process.stdin, 'pause', pauseSpy));
    restores.push(setLooseProp(process.stdin, 'setRawMode', setRawModeSpy));
    restores.push(setLooseProp(process.stdin, 'isPaused', isPausedSpy));
    restores.push(setLooseProp(process.stdin, 'isRaw', false));

    try {
      const p = selectPrompt({
        title: 'Pick one',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        defaultIndex: 0,
      });

      // Ensure stdin was resumed before we resolve.
      // Note: Node's `readline.emitKeypressEvents()` may also call `resume()` internally,
      // so we only assert the important contract (resumed at least once).
      expect(resumeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Resolve by simulating Enter key.
      process.nextTick(() => {
        const emitter = process.stdin as unknown as {
          emit: (event: string, ...args: unknown[]) => boolean;
        };
        emitter.emit('keypress', '', { name: 'return' });
      });

      const choice = await p;
      expect(choice?.id).toBe('a');
      expect(setRawModeSpy).toHaveBeenCalled();
      expect(pauseSpy).toHaveBeenCalledTimes(1);
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  });
});


