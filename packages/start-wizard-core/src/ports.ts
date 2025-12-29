import { execFileSync } from 'node:child_process';
import net from 'node:net';

export async function isPortOpen({
  host = '127.0.0.1',
  port,
  timeoutMs = 400,
}: {
  host?: string;
  port: number;
  timeoutMs?: number;
}): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.end();
      resolve(true);
    });
    const fail = () => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(false);
    };
    socket.on('error', fail);
    socket.on('timeout', fail);
  });
}

export async function waitForPortOpen({
  host = '127.0.0.1',
  port,
  timeoutMs = 20_000,
  intervalMs = 250,
}: {
  host?: string;
  port: number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen({ host, port, timeoutMs: 500 })) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function safeExecFileSync(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function getListeningPidsOnPort(port: number): number[] {
  // macOS/Linux: lsof is the most reliable.
  const out = safeExecFileSync('lsof', ['-ti', `:${port}`]);
  if (!out) return [];
  return out
    .split(/\s+/)
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
}

export function describePid(pid: number): string {
  const cmdline =
    safeExecFileSync('ps', ['-o', 'command=', '-p', String(pid)]) ||
    safeExecFileSync('ps', ['-o', 'comm=', '-p', String(pid)]);
  return cmdline || '(unknown)';
}

export function killPid(pid: number, { dryRun = false }: { dryRun?: boolean } = {}): void {
  if (dryRun) return;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL'] as const) {
    try {
      process.kill(pid, signal);
      if (signal === 'SIGKILL') return;
    } catch {
      // ignore
    }
  }
}

export type PortConflictSummary = {
  port: number;
  desiredService: string;
  listeners: Array<{ pid: number; command: string }>;
};

export function formatPortConflicts(conflicts: PortConflictSummary[]): string {
  const lines: string[] = [];
  lines.push('Port conflicts detected:');
  for (const c of conflicts) {
    lines.push(`- ${c.port} (${c.desiredService}) is in use by:`);
    for (const proc of c.listeners) {
      lines.push(`    pid ${proc.pid}: ${proc.command}`);
    }
  }
  return lines.join('\n');
}


