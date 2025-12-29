import {
  describePid,
  formatPortConflicts,
  getListeningPidsOnPort,
  killPid,
} from './ports.js';
import { confirmPrompt, inputPrompt, selectPrompt } from './ttyPrompts.js';
import type { StartWizardPortPlanEntry } from './startWizardConfig.js';

export type PortConflict = {
  port: number;
  desiredService: string;
  flexible: boolean;
  optionName?: string;
  listeners: Array<{ pid: number; command: string }>;
  newPort?: number;
};

export async function collectPortConflicts(
  portPlan: StartWizardPortPlanEntry[]
): Promise<PortConflict[]> {
  const conflicts: PortConflict[] = [];
  for (const entry of portPlan) {
    const pids = getListeningPidsOnPort(entry.port);
    if (!pids.length) continue;
    conflicts.push({
      port: entry.port,
      desiredService: entry.desiredService,
      flexible: Boolean(entry.flexible),
      optionName: entry.optionName,
      listeners: pids.map((pid) => ({ pid, command: describePid(pid) })),
    });
  }
  return conflicts;
}

export async function resolvePortConflictsInteractively({
  conflicts,
  kill,
  yes,
}: {
  conflicts: PortConflict[];
  kill: boolean;
  yes: boolean;
}): Promise<void> {
  if (!conflicts.length) return;

  if (kill && !yes && !process.stdin.isTTY) {
    throw new Error('--kill in non-interactive mode requires --yes');
  }

  console.log(formatPortConflicts(conflicts));
  console.log('');

  for (const conflict of conflicts) {
    const options = [
      { id: 'kill', label: 'Kill processes on this port' },
      ...(conflict.flexible
        ? [{ id: 'change', label: 'Choose a different port' }]
        : []),
      { id: 'abort', label: 'Abort' },
    ];

    const action = kill
      ? { id: 'kill', label: 'Kill' }
      : await selectPrompt({
          title: `Port ${conflict.port} is in use. Action for ${conflict.desiredService}?`,
          options,
        });

    if (!action || action.id === 'abort') {
      throw new Error('Aborted due to port conflict.');
    }

    if (action.id === 'change') {
      const next = await inputPrompt({
        question: `Enter a new port for ${conflict.desiredService}:`,
        defaultValue: String(conflict.port + 1),
        validate: (value) => {
          const n = Number.parseInt(value, 10);
          if (!Number.isFinite(n) || n <= 0) return 'Port must be a positive number.';
          return null;
        },
      });
      conflict.newPort = Number.parseInt(next, 10);
      continue;
    }

    if (action.id === 'kill') {
      if (!kill) {
        const ok = yes
          ? true
          : await confirmPrompt({
              question: `Kill ${conflict.listeners.length} process(es) listening on ${conflict.port}?`,
              defaultValue: false,
            });
        if (!ok) throw new Error('Aborted (user declined to kill processes).');
      }

      for (const listener of conflict.listeners) {
        killPid(listener.pid);
      }
      const remaining = getListeningPidsOnPort(conflict.port);
      if (remaining.length) {
        throw new Error(`Port ${conflict.port} is still in use after kill attempts.`);
      }
    }
  }
}


