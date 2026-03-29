import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FSWatcher } from 'chokidar';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Build a fake FSWatcher that stores handlers by event name
function createMockWatcher(): FSWatcher & { _handlers: Record<string, Array<(...args: unknown[]) => void>>; _trigger: (event: string, ...args: unknown[]) => void } {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    _handlers: handlers,
    _trigger(event: string, ...args: unknown[]) {
      for (const h of handlers[event] ?? []) h(...args);
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
      return this;
    },
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as FSWatcher & { _handlers: Record<string, Array<(...args: unknown[]) => void>>; _trigger: (event: string, ...args: unknown[]) => void };
}

let mockWatchers: ReturnType<typeof createMockWatcher>[] = [];

vi.mock('chokidar', () => ({
  watch: vi.fn(() => {
    const w = createMockWatcher();
    mockWatchers.push(w);
    return w;
  }),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(),
      existsSync: vi.fn(() => true),
    },
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
  };
});

vi.mock('@/lib/events/bus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/events/bus')>();
  return {
    ...actual,
    emitEvent: vi.fn(),
  };
});

vi.mock('@/lib/paths', () => ({
  OPENCLAW_CONFIG: '/mock/.openclaw/openclaw.json',
}));

import { watch } from 'chokidar';
import fs from 'fs';
import { emitEvent } from '@/lib/events/bus';
import {
  startWatchers,
  stopWatchers,
  _diffActivities,
  _diffNotifications,
  _ACTIVITIES_PATH,
  _NOTIFICATIONS_PATH,
} from '@/lib/events/watchers';

describe('Watchers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatchers = [];
    // Default: directories exist, files are empty arrays
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('[]');
  });

  afterEach(async () => {
    await stopWatchers();
  });

  describe('startWatchers', () => {
    it('creates chokidar watchers with correct options', () => {
      startWatchers();

      // Should have called watch() 3 times (activities, notifications, openclaw config)
      expect(watch).toHaveBeenCalledTimes(3);

      // Verify awaitWriteFinish config
      const calls = (watch as ReturnType<typeof vi.fn>).mock.calls;
      for (const [, opts] of calls) {
        expect(opts).toMatchObject({
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 100,
            pollInterval: 50,
          },
        });
      }
    });

    it('skips watchers when parent directory does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      startWatchers();
      expect(watch).not.toHaveBeenCalled();
    });
  });

  describe('stopWatchers', () => {
    it('calls close() on all watchers', async () => {
      startWatchers();
      expect(mockWatchers.length).toBe(3);

      await stopWatchers();
      for (const w of mockWatchers) {
        expect(w.close).toHaveBeenCalled();
      }
    });
  });

  describe('Activity diff logic', () => {
    it('emits activity:new for new entries detected by id', () => {
      // Seed last-known state by starting watchers with initial data
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify([
          { id: 'a1', timestamp: '2026-01-01', type: 'file', description: 'existing', status: 'success', duration_ms: null, tokens_used: null, metadata: null },
        ]),
      );
      startWatchers();
      vi.clearAllMocks();

      // Now simulate a file change with one new entry prepended
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify([
          { id: 'a2', timestamp: '2026-01-02', type: 'search', description: 'new one', status: 'success', duration_ms: null, tokens_used: null, metadata: null },
          { id: 'a1', timestamp: '2026-01-01', type: 'file', description: 'existing', status: 'success', duration_ms: null, tokens_used: null, metadata: null },
        ]),
      );

      _diffActivities(_ACTIVITIES_PATH);

      expect(emitEvent).toHaveBeenCalledTimes(1);
      expect(emitEvent).toHaveBeenCalledWith(
        'activity:new',
        expect.objectContaining({ id: 'a2', description: 'new one' }),
      );
    });

    it('does not emit when file is truncated (length decreases)', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify([
          { id: 'a1', timestamp: '2026-01-01', type: 'file', description: 'one', status: 'success', duration_ms: null, tokens_used: null, metadata: null },
          { id: 'a2', timestamp: '2026-01-01', type: 'file', description: 'two', status: 'success', duration_ms: null, tokens_used: null, metadata: null },
        ]),
      );
      startWatchers();
      vi.clearAllMocks();

      // File shrinks
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify([
          { id: 'a1', timestamp: '2026-01-01', type: 'file', description: 'one', status: 'success', duration_ms: null, tokens_used: null, metadata: null },
        ]),
      );

      _diffActivities(_ACTIVITIES_PATH);
      expect(emitEvent).not.toHaveBeenCalled();
    });
  });

  describe('Notification diff logic', () => {
    it('emits notification:new for new entries', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify([
          { id: 'n1', timestamp: '2026-01-01', title: 'old', message: 'msg', type: 'info', read: false },
        ]),
      );
      startWatchers();
      vi.clearAllMocks();

      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify([
          { id: 'n2', timestamp: '2026-01-02', title: 'new', message: 'msg2', type: 'success', read: false },
          { id: 'n1', timestamp: '2026-01-01', title: 'old', message: 'msg', type: 'info', read: false },
        ]),
      );

      _diffNotifications(_NOTIFICATIONS_PATH);

      expect(emitEvent).toHaveBeenCalledTimes(1);
      expect(emitEvent).toHaveBeenCalledWith(
        'notification:new',
        expect.objectContaining({ id: 'n2', title: 'new' }),
      );
    });
  });

  describe('Graceful degradation', () => {
    it('does not crash when JSON parse fails on change', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('[]');
      startWatchers();
      vi.clearAllMocks();

      // File contains invalid JSON
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('NOT JSON');

      expect(() => _diffActivities(_ACTIVITIES_PATH)).not.toThrow();
      expect(emitEvent).not.toHaveBeenCalled();
    });
  });
});
