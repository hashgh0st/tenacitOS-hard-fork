/**
 * Tests for src/lib/alerts/channels.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AlertRule } from '@/lib/alerts/types';

// ── Mock fs at top level ─────────────────────────────────────────────────────

const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFileSync = vi.fn().mockReturnValue('[]');
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  },
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

// ── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

// ── Mock event bus ───────────────────────────────────────────────────────────

vi.mock('@/lib/events/bus', () => ({
  emitEvent: vi.fn(),
  onEvent: vi.fn(),
  offEvent: vi.fn(),
}));

import { deliverAlert, deliverResolution } from '@/lib/alerts/channels';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'test-rule',
    name: 'Test Alert',
    condition: { metric: 'system.cpu', operator: 'gt', value: 90 },
    sustained_checks: 1,
    cooldown_minutes: 5,
    channels: ['in_app'],
    severity: 'warning',
    enabled: true,
    ...overrides,
  };
}

describe('Alert Channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('[]');
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SMTP_HOST;
  });

  // ── in_app channel ─────────────────────────────────────────────────────

  describe('in_app channel', () => {
    it('writes notification to file', async () => {
      const rule = makeRule({ channels: ['in_app'] });
      await deliverAlert(rule, 95);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('notifications.json'),
        expect.stringContaining('Test Alert'),
        'utf-8',
      );
    });

    it('emits notification:new to event bus', async () => {
      const { emitEvent } = await import('@/lib/events/bus');
      const rule = makeRule({ channels: ['in_app'] });
      await deliverAlert(rule, 95);

      expect(emitEvent).toHaveBeenCalledWith('notification:new', expect.objectContaining({
        title: 'Test Alert',
        read: false,
      }));
    });

    it('maps severity to notification type correctly', async () => {
      const rule = makeRule({ channels: ['in_app'], severity: 'critical' });
      await deliverAlert(rule, 95);

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed[0].type).toBe('error');
    });
  });

  // ── webhook channel ────────────────────────────────────────────────────

  describe('webhook channel', () => {
    it('sends POST with correct payload', async () => {
      const rule = makeRule({
        channels: ['webhook'],
        webhook_url: 'https://hooks.example.com/test',
      });
      await deliverAlert(rule, 95);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.rule).toBe('Test Alert');
      expect(body.severity).toBe('warning');
      expect(body.value).toBe(95);
      expect(body.timestamp).toBeDefined();
    });

    it('does nothing when webhook_url is not set', async () => {
      const rule = makeRule({ channels: ['webhook'] });
      await deliverAlert(rule, 95);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── telegram channel ───────────────────────────────────────────────────

  describe('telegram channel', () => {
    it('sends message to Telegram API', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';
      const rule = makeRule({
        channels: ['telegram'],
        telegram_chat_id: '12345',
      });
      await deliverAlert(rule, 95);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-token-123/sendMessage',
        expect.objectContaining({ method: 'POST' }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe('12345');
      expect(body.text).toContain('Test Alert');
    });

    it('skips when TELEGRAM_BOT_TOKEN is not set', async () => {
      const rule = makeRule({
        channels: ['telegram'],
        telegram_chat_id: '12345',
      });
      await deliverAlert(rule, 95);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips when telegram_chat_id is not set', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      const rule = makeRule({ channels: ['telegram'] });
      await deliverAlert(rule, 95);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── email channel ──────────────────────────────────────────────────────

  describe('email channel', () => {
    it('skips when SMTP_HOST is not configured', async () => {
      const rule = makeRule({ channels: ['email'] });
      await deliverAlert(rule, 95);
      // No error thrown, nothing happens
    });
  });

  // ── deliverResolution ──────────────────────────────────────────────────

  describe('deliverResolution', () => {
    it('sends resolution message via in_app', async () => {
      const rule = makeRule({ channels: ['in_app'] });
      await deliverResolution(rule);

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('Resolved');
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('does not throw when webhook fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const rule = makeRule({
        channels: ['webhook'],
        webhook_url: 'https://hooks.example.com/test',
      });

      await expect(deliverAlert(rule, 95)).resolves.toBeUndefined();
    });
  });
});
