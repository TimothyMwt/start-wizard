import { describe, expect, test, vi } from 'vitest';

const events: string[] = [];
const collectCalls: number[][] = [];
const resolveCalls: number[][] = [];

vi.mock('@timothymwt/start-wizard-core', async () => {
  const actual = await vi.importActual<
    typeof import('@timothymwt/start-wizard-core')
  >('@timothymwt/start-wizard-core');

  return {
    ...actual,
    defineConfig: (raw: unknown) => raw as any,
    ensureInstall: vi.fn(async () => {}),
    enforceProdGuard: vi.fn(async ({ allowProd }: any) => allowProd ?? false),
    collectPortConflicts: vi.fn(async (plan: any[]) => {
      const ports = plan.map((p) => p.port);
      collectCalls.push(ports);
      events.push(`collect:${ports.join(',')}`);
      // Return a fake conflict per plan so resolve can distinguish calls.
      return ports.map((port: number) => ({
        port,
        desiredService: 'test',
        flexible: false,
        listeners: [{ pid: 123, command: 'test' }],
      }));
    }),
    resolvePortConflictsInteractively: vi.fn(async ({ conflicts }: any) => {
      const ports = (conflicts ?? []).map((c: any) => c.port);
      resolveCalls.push(ports);
      events.push(`resolve:${ports.join(',')}`);
    }),
    // Avoid real TTY prompting in tests.
    selectPrompt: vi.fn(async () => {
      throw new Error('selectPrompt should not be called in this test');
    }),
    confirmPrompt: vi.fn(async () => true),
    inputPrompt: vi.fn(async () => ''),
    isPortOpen: vi.fn(async () => false),
  };
});

// Import after mocks are registered.
import { runStartWizard } from '../src/cli.js';

describe('start-wizard-cli flow', () => {
  test('resolves product port conflicts before starting local stack (and excludes local stack ports)', async () => {
    events.length = 0;
    collectCalls.length = 0;
    resolveCalls.length = 0;

    const tmpDir = await import('node:fs/promises').then(async (fsp) => {
      const os = await import('node:os');
      const path = await import('node:path');
      const dir = await fsp.mkdtemp(
        path.join(os.tmpdir(), 'start-wizard-cli-test-')
      );
      return dir;
    });

    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const configPath = path.join(tmpDir, 'start-wizard.config.mjs');

    await fs.writeFile(
      configPath,
      `
        import { defineConfig } from '@timothymwt/start-wizard-core';
        export default defineConfig({
          version: 1,
          modes: [{ id: 'local', label: 'Local' }],
          localStack: {
            ports: () => [{ port: 9099, desiredService: 'firebase-auth-emulator' }],
            start: async () => { /* replaced at runtime */ },
          },
          products: [{
            id: 'p',
            label: 'P',
            portPlan: () => [
              { port: 9099, desiredService: 'firebase-auth-emulator' },
              { port: 3888, desiredService: 'waitlist-web', flexible: true, optionName: 'port' },
            ],
            start: async () => {},
          }],
        });
      `,
      'utf8'
    );

    // Rewrite config with a deterministic event marker written to globalThis.
    await fs.writeFile(
      configPath,
      `
        import { defineConfig } from '@timothymwt/start-wizard-core';
        export default defineConfig({
          version: 1,
          modes: [{ id: 'local', label: 'Local' }],
          localStack: {
            ports: () => [{ port: 9099, desiredService: 'firebase-auth-emulator' }],
            start: async () => { globalThis.__SW_TEST_EVENTS?.push('localStackStart'); },
          },
          products: [{
            id: 'p',
            label: 'P',
            portPlan: () => [
              { port: 9099, desiredService: 'firebase-auth-emulator' },
              { port: 3888, desiredService: 'waitlist-web', flexible: true, optionName: 'port' },
            ],
            start: async () => {},
          }],
        });
      `,
      'utf8'
    );

    try {
      (globalThis as any).__SW_TEST_EVENTS = events;
      await runStartWizard({
        cwd: tmpDir,
        argv: [
          '--config',
          configPath,
          '--product',
          'p',
          '--mode',
          'local',
          '--yes',
        ],
      });
    } finally {
      delete (globalThis as any).__SW_TEST_EVENTS;
    }

    // Ensure local stack ports are excluded from *product* conflict checking.
    // First collect call is product ports; second collect call is localStack pre-start ports.
    expect(collectCalls[0]).toEqual([3888]);
    expect(collectCalls[1]).toEqual([9099]);

    // Product conflict resolution (3888) should happen before local stack starts.
    const productResolveIdx = events.indexOf('resolve:3888');
    expect(productResolveIdx).toBeGreaterThanOrEqual(0);

    const localStackStartIdx = events.indexOf('localStackStart');
    expect(localStackStartIdx).toBeGreaterThanOrEqual(0);
    expect(localStackStartIdx).toBeGreaterThan(productResolveIdx);
  });
});
