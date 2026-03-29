import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';

// Mock child_process.execFile before importing pollers
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs for /proc/net/dev reads and openclaw.json reads
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(actual.readFileSync),
      existsSync: vi.fn(actual.existsSync),
    },
    readFileSync: vi.fn(actual.readFileSync),
    existsSync: vi.fn(actual.existsSync),
  };
});

// Mock the event bus to capture emissions
vi.mock('@/lib/events/bus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/events/bus')>();
  return {
    ...actual,
    emitEvent: vi.fn(),
  };
});

// Mock paths
vi.mock('@/lib/paths', () => ({
  OPENCLAW_CONFIG: '/mock/.openclaw/openclaw.json',
}));

import { execFile } from 'child_process';
import fs from 'fs';
import { emitEvent } from '@/lib/events/bus';
import {
  startPollers,
  stopPollers,
  _calculateCpuPercent,
  _collectDisk,
  _collectPM2,
  _collectRam,
  _collectAgentStatus,
  _collectNetwork,
} from '@/lib/events/pollers';

// Helper: make the execFile mock invoke its callback with given stdout
function mockExecFileSuccess(stdout: string): void {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _cmd: string,
      _args: string[],
      callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      if (typeof callback === 'function') {
        callback(null, { stdout, stderr: '' });
      }
    },
  );
}

function mockExecFileFailure(err: Error): void {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _cmd: string,
      _args: string[],
      callback: (err: Error | null) => void,
    ) => {
      if (typeof callback === 'function') {
        callback(err);
      }
    },
  );
}

describe('Pollers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stopPollers(); // ensure clean state
  });

  afterEach(() => {
    stopPollers();
    vi.useRealTimers();
  });

  describe('CPU calculation', () => {
    it('returns a percentage between 0 and 100', () => {
      vi.spyOn(os, 'cpus').mockReturnValue([
        { model: 'test', speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
        { model: 'test', speed: 2400, times: { user: 200, nice: 0, sys: 50, idle: 750, irq: 0 } },
      ]);
      vi.spyOn(os, 'loadavg').mockReturnValue([1.0, 0.5, 0.3]);

      // First call uses load-average approximation (no previous snapshot)
      const first = _calculateCpuPercent();
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(100);

      // Second call computes delta between snapshots
      vi.spyOn(os, 'cpus').mockReturnValue([
        { model: 'test', speed: 2400, times: { user: 150, nice: 0, sys: 60, idle: 890, irq: 0 } },
        { model: 'test', speed: 2400, times: { user: 250, nice: 0, sys: 60, idle: 790, irq: 0 } },
      ]);
      const second = _calculateCpuPercent();
      expect(second).toBeGreaterThanOrEqual(0);
      expect(second).toBeLessThanOrEqual(100);
    });
  });

  describe('RAM collection', () => {
    it('returns total, used, and free memory from os module', () => {
      vi.spyOn(os, 'totalmem').mockReturnValue(8_000_000_000);
      vi.spyOn(os, 'freemem').mockReturnValue(3_000_000_000);

      const ram = _collectRam();
      expect(ram.total).toBe(8_000_000_000);
      expect(ram.free).toBe(3_000_000_000);
      expect(ram.used).toBe(5_000_000_000);
    });
  });

  describe('Disk collection', () => {
    it('parses df -k output correctly', async () => {
      const dfOutput =
        'Filesystem     1K-blocks     Used Available Use% Mounted on\n' +
        '/dev/sda1      103079200 52345600  50733600  51% /\n';
      mockExecFileSuccess(dfOutput);

      const disk = await _collectDisk();
      expect(disk.total).toBe(103079200 * 1024);
      expect(disk.used).toBe(52345600 * 1024);
      expect(disk.free).toBe(50733600 * 1024);
    });

    it('returns zeros when df fails', async () => {
      mockExecFileFailure(new Error('command not found'));
      const disk = await _collectDisk();
      expect(disk).toEqual({ total: 0, used: 0, free: 0 });
    });
  });

  describe('PM2 collection', () => {
    it('parses pm2 jlist JSON output', async () => {
      const pm2Output = JSON.stringify([
        {
          name: 'brain',
          pid: 1234,
          pm2_env: { status: 'online', pm_uptime: Date.now() - 60000, restart_time: 2 },
          monit: { cpu: 5, memory: 100_000_000 },
        },
      ]);
      mockExecFileSuccess(pm2Output);

      const result = await _collectPM2();
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('brain');
      expect(result![0].pid).toBe(1234);
      expect(result![0].status).toBe('online');
      expect(result![0].cpu).toBe(5);
      expect(result![0].memory).toBe(100_000_000);
    });

    it('returns null when PM2 is not available', async () => {
      mockExecFileFailure(new Error('pm2: command not found'));
      const result = await _collectPM2();
      expect(result).toBeNull();
    });
  });

  describe('Network collection', () => {
    it('parses /proc/net/dev on Linux', async () => {
      const procNetDev = [
        'Inter-|   Receive                                                |  Transmit',
        ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets',
        '    lo: 1000     10    0    0    0     0          0         0     1000      10',
        '  eth0: 500000   300    0    0    0     0          0         0   200000     150',
      ].join('\n');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(procNetDev);

      // First call establishes baseline (returns zeros)
      const first = await _collectNetwork();
      expect(first).toEqual({ rx: 0, tx: 0 });

      // Advance time so delta calculation works (dtSec > 0)
      await vi.advanceTimersByTimeAsync(2000);

      // Second call returns delta
      const procNetDev2 = procNetDev.replace('500000', '600000').replace('200000', '250000');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(procNetDev2);

      const second = await _collectNetwork();
      expect(second).not.toBeNull();
      // Delta is 100000 bytes over 2 seconds = 50000 bytes/sec
      expect(second!.rx).toBe(50000);
      // Delta is 50000 bytes over 2 seconds = 25000 bytes/sec
      expect(second!.tx).toBe(25000);
    });

    it('returns null on macOS (no /proc/net/dev)', async () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      const result = await _collectNetwork();
      expect(result).toBeNull();
    });
  });

  describe('Agent status collection', () => {
    it('reads agents array from openclaw.json', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          agents: [
            { id: 'a1', name: 'Agent One', model: 'claude-3-opus', status: 'active' },
            { id: 'a2', name: 'Agent Two', model: 'claude-3-sonnet', status: 'idle' },
          ],
        }),
      );

      const agents = _collectAgentStatus();
      expect(agents).toHaveLength(2);
      expect(agents[0]).toEqual({
        id: 'a1',
        name: 'Agent One',
        model: 'claude-3-opus',
        status: 'active',
        lastSeen: undefined,
      });
    });

    it('returns empty array when config file is missing', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const agents = _collectAgentStatus();
      expect(agents).toEqual([]);
    });
  });

  describe('startPollers / stopPollers lifecycle', () => {
    it('emits system:metrics and agent:status on start', async () => {
      vi.spyOn(os, 'cpus').mockReturnValue([
        { model: 'test', speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
      ]);
      vi.spyOn(os, 'loadavg').mockReturnValue([0.5, 0.3, 0.2]);
      vi.spyOn(os, 'totalmem').mockReturnValue(8e9);
      vi.spyOn(os, 'freemem').mockReturnValue(4e9);
      mockExecFileSuccess(
        'Filesystem 1K-blocks Used Available\n/dev/sda1 100000 50000 50000\n',
      );
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('proc/net/dev')) throw new Error('macOS');
        if (typeof p === 'string' && p.includes('openclaw.json')) return '{}';
        throw new Error('ENOENT');
      });

      startPollers();

      // Let initial async poll settle
      await vi.advanceTimersByTimeAsync(100);

      expect(emitEvent).toHaveBeenCalledWith(
        'system:metrics',
        expect.objectContaining({
          cpu: expect.any(Number),
          ram: expect.objectContaining({ total: 8e9 }),
        }),
      );

      expect(emitEvent).toHaveBeenCalledWith(
        'agent:status',
        expect.objectContaining({ agents: expect.any(Array) }),
      );
    });

    it('stops emitting after stopPollers is called', async () => {
      vi.spyOn(os, 'cpus').mockReturnValue([
        { model: 'test', speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
      ]);
      vi.spyOn(os, 'loadavg').mockReturnValue([0.5, 0.3, 0.2]);
      vi.spyOn(os, 'totalmem').mockReturnValue(8e9);
      vi.spyOn(os, 'freemem').mockReturnValue(4e9);
      mockExecFileSuccess('Filesystem 1K-blocks Used Available\n/dev/sda1 100000 50000 50000\n');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      startPollers();
      await vi.advanceTimersByTimeAsync(100);

      const callCount = (emitEvent as ReturnType<typeof vi.fn>).mock.calls.length;
      stopPollers();

      // Advance well past several poll intervals
      await vi.advanceTimersByTimeAsync(10_000);
      expect((emitEvent as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });
  });
});
