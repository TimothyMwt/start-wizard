import { describe, expect, it } from 'vitest';
import {
  START_WIZARD_CORE_VERSION,
  defineConfig,
  parseCommonCliArgs,
} from '../src/index.js';

describe('start-wizard-core', () => {
  it('exports something', () => {
    expect(typeof START_WIZARD_CORE_VERSION).toBe('string');
  });

  it('validates config', () => {
    const cfg = defineConfig({
      products: [
        {
          id: 'mobile',
          label: 'Mobile',
          start: () => undefined,
        },
      ],
    });
    expect(cfg.products[0]?.id).toBe('mobile');
    expect(cfg.modes?.map((m) => m.id)).toEqual(['local', 'dev', 'prod']);
  });

  it('parses common args', () => {
    const parsed = parseCommonCliArgs([
      '--product',
      'mobile',
      '--mode',
      'dev',
      '--yes',
      '--',
      '--foo',
      'bar',
    ]);
    expect(parsed.product).toBe('mobile');
    expect(parsed.mode).toBe('dev');
    expect(parsed.yes).toBe(true);
    expect(parsed.passThroughArgs).toEqual(['--foo', 'bar']);
  });
});


