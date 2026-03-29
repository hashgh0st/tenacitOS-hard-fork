/**
 * System Metrics Poller & Agent Status Poller.
 *
 * Periodically collects OS-level metrics and agent status,
 * then emits them to the event bus for SSE distribution.
 *
 * System metrics: every 2 seconds
 * Agent status:   every 5 seconds
 */
import os from 'os';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { emitEvent } from './bus';
import type { SystemMetrics, PM2Process, AgentState } from './bus';
import { OPENCLAW_CONFIG } from '@/lib/paths';

const execFileAsync = promisify(execFile);

// ── CPU delta tracking ─────────────────────────────────────────────────────

interface CpuSnapshot {
  idle: number;
  total: number;
}

let prevCpuSnapshot: CpuSnapshot | null = null;

function takeCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

function calculateCpuPercent(): number {
  const current = takeCpuSnapshot();
  if (!prevCpuSnapshot) {
    prevCpuSnapshot = current;
    // First reading: use load average as approximation
    const cores = os.cpus().length;
    return Math.min(Math.round((os.loadavg()[0] / cores) * 100), 100);
  }
  const idleDelta = current.idle - prevCpuSnapshot.idle;
  const totalDelta = current.total - prevCpuSnapshot.total;
  prevCpuSnapshot = current;
  if (totalDelta === 0) return 0;
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
}

// ── RAM ────────────────────────────────────────────────────────────────────

function collectRam(): { total: number; used: number; free: number } {
  const total = os.totalmem();
  const free = os.freemem();
  return { total, used: total - free, free };
}

// ── Disk ───────────────────────────────────────────────────────────────────

async function collectDisk(): Promise<{ total: number; used: number; free: number }> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '/']);
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return { total: 0, used: 0, free: 0 };
    const parts = lines[1].trim().split(/\s+/);
    // df -k outputs 1K blocks: [filesystem, 1K-blocks, used, available, ...]
    const total = parseInt(parts[1], 10) * 1024;
    const used = parseInt(parts[2], 10) * 1024;
    const free = parseInt(parts[3], 10) * 1024;
    return { total, used, free };
  } catch {
    return { total: 0, used: 0, free: 0 };
  }
}

// ── Network (Linux only) ───────────────────────────────────────────────────

let prevNetBytes: { rx: number; tx: number; ts: number } | null = null;

async function collectNetwork(): Promise<{ rx: number; tx: number } | null> {
  try {
    const data = fs.readFileSync('/proc/net/dev', 'utf-8');
    const lines = data.trim().split('\n').slice(2); // skip headers
    let rx = 0;
    let tx = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const iface = parts[0].replace(':', '');
      if (iface === 'lo') continue;
      rx += parseInt(parts[1], 10) || 0;
      tx += parseInt(parts[9], 10) || 0;
    }
    const now = Date.now();
    if (!prevNetBytes) {
      prevNetBytes = { rx, tx, ts: now };
      return { rx: 0, tx: 0 };
    }
    const dtSec = (now - prevNetBytes.ts) / 1000;
    const result =
      dtSec > 0
        ? { rx: Math.max(0, (rx - prevNetBytes.rx) / dtSec), tx: Math.max(0, (tx - prevNetBytes.tx) / dtSec) }
        : { rx: 0, tx: 0 };
    prevNetBytes = { rx, tx, ts: now };
    return result;
  } catch {
    // macOS or permission error — gracefully return null
    return null;
  }
}

// ── PM2 ────────────────────────────────────────────────────────────────────

async function collectPM2(): Promise<PM2Process[] | null> {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist']);
    const list = JSON.parse(stdout) as Array<{
      name: string;
      pid: number | null;
      pm2_env: {
        status: string;
        pm_uptime?: number;
        restart_time?: number;
      };
      monit?: { cpu: number; memory: number };
    }>;
    return list.map((p) => ({
      name: p.name,
      pid: p.pid ?? 0,
      status: p.pm2_env?.status ?? 'unknown',
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      uptime: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
    }));
  } catch {
    return null;
  }
}

// ── Agent status ───────────────────────────────────────────────────────────

function collectAgentStatus(): AgentState[] {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG, 'utf-8');
    const config = JSON.parse(raw);
    // openclaw.json may have an `agents` array or be a single-agent config
    const agents: AgentState[] = [];
    if (Array.isArray(config.agents)) {
      for (const a of config.agents) {
        agents.push({
          id: a.id ?? a.name ?? 'unknown',
          name: a.name ?? a.id ?? 'unnamed',
          model: a.model ?? 'unknown',
          status: a.status ?? 'idle',
          lastSeen: a.lastSeen,
        });
      }
    } else if (config.name || config.id) {
      agents.push({
        id: config.id ?? config.name ?? 'default',
        name: config.name ?? config.id ?? 'default',
        model: config.model ?? 'unknown',
        status: config.status ?? 'idle',
        lastSeen: config.lastSeen,
      });
    }
    return agents;
  } catch {
    return [];
  }
}

// ── Poller orchestration ───────────────────────────────────────────────────

let systemInterval: ReturnType<typeof setInterval> | null = null;
let agentInterval: ReturnType<typeof setInterval> | null = null;

async function pollSystemMetrics(): Promise<void> {
  try {
    const [disk, network, pm2Status] = await Promise.all([
      collectDisk(),
      collectNetwork(),
      collectPM2(),
    ]);
    const metrics: SystemMetrics = {
      cpu: calculateCpuPercent(),
      ram: collectRam(),
      disk,
      network,
      pm2Status,
    };
    emitEvent('system:metrics', metrics);
  } catch {
    // Never crash the poller
  }
}

function pollAgentStatus(): void {
  try {
    const agents = collectAgentStatus();
    emitEvent('agent:status', { agents });
  } catch {
    // Never crash the poller
  }
}

export function startPollers(): void {
  if (systemInterval || agentInterval) return; // already running

  // Fire immediately, then on interval
  void pollSystemMetrics();
  pollAgentStatus();

  systemInterval = setInterval(() => void pollSystemMetrics(), 2000);
  agentInterval = setInterval(pollAgentStatus, 5000);
}

export function stopPollers(): void {
  if (systemInterval) {
    clearInterval(systemInterval);
    systemInterval = null;
  }
  if (agentInterval) {
    clearInterval(agentInterval);
    agentInterval = null;
  }
  // Reset state for clean restart
  prevCpuSnapshot = null;
  prevNetBytes = null;
}

// Exported for testing
export { calculateCpuPercent as _calculateCpuPercent };
export { collectDisk as _collectDisk };
export { collectPM2 as _collectPM2 };
export { collectRam as _collectRam };
export { collectNetwork as _collectNetwork };
export { collectAgentStatus as _collectAgentStatus };
export { pollSystemMetrics as _pollSystemMetrics };
