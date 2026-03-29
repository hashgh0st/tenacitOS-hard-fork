/**
 * Tests for src/lib/alerts/engine.ts
 *
 * Uses vi.useFakeTimers() for interval control and dependency injection
 * for all side effects (storage, delivery, metrics).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import { evaluateRules, evaluateCondition, stopAlertEngine, startAlertEngine, _getState } from '@/lib/alerts/engine';
import type { AlertRule } from '@/lib/alerts/types';
import type { recordAlert, resolveAlert } from '@/lib/alerts/storage';
import type { deliverAlert, deliverResolution } from '@/lib/alerts/channels';

// ── Mock event bus ───────────────────────────────────────────────────────────

vi.mock('@/lib/events/bus', () => ({
  emitEvent: vi.fn(),
  onEvent: vi.fn(),
  offEvent: vi.fn(),
}));

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

describe('evaluateCondition', () => {
  it('gt: true when value > threshold', () => {
    expect(evaluateCondition(91, 'gt', 90)).toBe(true);
    expect(evaluateCondition(90, 'gt', 90)).toBe(false);
    expect(evaluateCondition(89, 'gt', 90)).toBe(false);
  });

  it('lt: true when value < threshold', () => {
    expect(evaluateCondition(89, 'lt', 90)).toBe(true);
    expect(evaluateCondition(90, 'lt', 90)).toBe(false);
    expect(evaluateCondition(91, 'lt', 90)).toBe(false);
  });

  it('eq: true when value === threshold', () => {
    expect(evaluateCondition(90, 'eq', 90)).toBe(true);
    expect(evaluateCondition(91, 'eq', 90)).toBe(false);
  });

  it('gte: true when value >= threshold', () => {
    expect(evaluateCondition(91, 'gte', 90)).toBe(true);
    expect(evaluateCondition(90, 'gte', 90)).toBe(true);
    expect(evaluateCondition(89, 'gte', 90)).toBe(false);
  });

  it('lte: true when value <= threshold', () => {
    expect(evaluateCondition(89, 'lte', 90)).toBe(true);
    expect(evaluateCondition(90, 'lte', 90)).toBe(true);
    expect(evaluateCondition(91, 'lte', 90)).toBe(false);
  });
});

describe('evaluateRules', () => {
  let mockDeliverAlert: MockedFunction<typeof deliverAlert>;
  let mockDeliverResolution: MockedFunction<typeof deliverResolution>;
  let mockRecordAlert: MockedFunction<typeof recordAlert>;
  let mockResolveAlert: MockedFunction<typeof resolveAlert>;
  let currentTime: number;

  beforeEach(() => {
    stopAlertEngine(); // clear state between tests
    mockDeliverAlert = vi.fn<typeof deliverAlert>().mockResolvedValue(undefined);
    mockDeliverResolution = vi.fn<typeof deliverResolution>().mockResolvedValue(undefined);
    mockRecordAlert = vi.fn<typeof recordAlert>();
    mockResolveAlert = vi.fn<typeof resolveAlert>();
    currentTime = Date.now();
  });

  afterEach(() => {
    stopAlertEngine();
  });

  async function runEval(
    rules: AlertRule[],
    metricValue: number | null = 95,
    nowOverride?: number,
  ): Promise<void> {
    await evaluateRules(
      () => rules,
      async () => metricValue,
      mockRecordAlert,
      mockResolveAlert,
      mockDeliverAlert,
      mockDeliverResolution,
      () => nowOverride ?? currentTime,
    );
  }

  // ── Basic firing ───────────────────────────────────────────────────────

  it('fires alert when condition is met and sustained_checks reached', async () => {
    const rule = makeRule({ sustained_checks: 1 });
    await runEval([rule], 95);

    expect(mockDeliverAlert).toHaveBeenCalledWith(rule, 95);
    expect(mockRecordAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'test-rule',
        severity: 'warning',
        metricValue: 95,
        thresholdValue: 90,
      }),
    );
  });

  it('emits alert:fired event on fire', async () => {
    const { emitEvent } = await import('@/lib/events/bus');
    const rule = makeRule({ sustained_checks: 1 });
    await runEval([rule], 95);

    expect(emitEvent).toHaveBeenCalledWith('alert:fired', expect.objectContaining({
      ruleId: 'test-rule',
      severity: 'warning',
      resolved: false,
    }));
  });

  // ── Sustained checks ──────────────────────────────────────────────────

  it('does not fire until sustained_checks consecutive failures', async () => {
    const rule = makeRule({ sustained_checks: 3 });

    // Check 1 and 2: condition met but not enough
    await runEval([rule], 95);
    expect(mockDeliverAlert).not.toHaveBeenCalled();

    await runEval([rule], 95);
    expect(mockDeliverAlert).not.toHaveBeenCalled();

    // Check 3: should fire now
    await runEval([rule], 95);
    expect(mockDeliverAlert).toHaveBeenCalledOnce();
  });

  it('resets consecutive failures when condition clears before reaching threshold', async () => {
    const rule = makeRule({ sustained_checks: 3 });

    await runEval([rule], 95); // failure 1
    await runEval([rule], 95); // failure 2
    await runEval([rule], 50); // clears — reset
    await runEval([rule], 95); // failure 1 again
    await runEval([rule], 95); // failure 2 again

    expect(mockDeliverAlert).not.toHaveBeenCalled();
  });

  // ── Cooldown ───────────────────────────────────────────────────────────

  it('does not re-fire within cooldown window', async () => {
    const rule = makeRule({ sustained_checks: 1, cooldown_minutes: 5 });

    // Fire
    await runEval([rule], 95, currentTime);
    expect(mockDeliverAlert).toHaveBeenCalledOnce();

    // Resolve
    await runEval([rule], 50, currentTime + 1000);

    // Try to fire again within 5 min
    await runEval([rule], 95, currentTime + 2 * 60 * 1000);
    expect(mockDeliverAlert).toHaveBeenCalledOnce(); // still only once
  });

  it('re-fires after cooldown expires', async () => {
    const rule = makeRule({ sustained_checks: 1, cooldown_minutes: 5 });

    // Fire
    await runEval([rule], 95, currentTime);
    expect(mockDeliverAlert).toHaveBeenCalledOnce();

    // Resolve
    await runEval([rule], 50, currentTime + 1000);

    // After cooldown
    await runEval([rule], 95, currentTime + 6 * 60 * 1000);
    expect(mockDeliverAlert).toHaveBeenCalledTimes(2);
  });

  // ── Auto-resolve ───────────────────────────────────────────────────────

  it('resolves when condition clears while active', async () => {
    const { emitEvent } = await import('@/lib/events/bus');
    const rule = makeRule({ sustained_checks: 1 });

    // Fire
    await runEval([rule], 95);
    expect(mockDeliverAlert).toHaveBeenCalledOnce();

    // Condition clears
    await runEval([rule], 50);
    expect(mockDeliverResolution).toHaveBeenCalledWith(rule);
    expect(mockResolveAlert).toHaveBeenCalledWith('test-rule');
    expect(emitEvent).toHaveBeenCalledWith('alert:resolved', expect.objectContaining({
      ruleId: 'test-rule',
      resolved: true,
    }));
  });

  // ── Null metric ────────────────────────────────────────────────────────

  it('skips rule when metric resolves to null', async () => {
    const rule = makeRule({ sustained_checks: 1 });
    await runEval([rule], null);

    expect(mockDeliverAlert).not.toHaveBeenCalled();
    expect(mockRecordAlert).not.toHaveBeenCalled();
  });

  // ── Disabled rules ─────────────────────────────────────────────────────

  it('skips disabled rules', async () => {
    const rule = makeRule({ enabled: false });
    await runEval([rule], 95);
    expect(mockDeliverAlert).not.toHaveBeenCalled();
  });

  // ── Multiple rules ─────────────────────────────────────────────────────

  it('evaluates multiple rules independently', async () => {
    const rule1 = makeRule({ id: 'rule-1', sustained_checks: 1 });
    const rule2 = makeRule({
      id: 'rule-2',
      name: 'Rule 2',
      condition: { metric: 'system.cpu', operator: 'lt', value: 10 },
      sustained_checks: 1,
    });

    // Both get value 95
    // rule-1 (gt 90) should fire, rule-2 (lt 10) should not
    await evaluateRules(
      () => [rule1, rule2],
      async () => 95,
      mockRecordAlert,
      mockResolveAlert,
      mockDeliverAlert,
      mockDeliverResolution,
      () => currentTime,
    );

    expect(mockDeliverAlert).toHaveBeenCalledOnce();
    expect(mockDeliverAlert).toHaveBeenCalledWith(rule1, 95);
  });

  // ── State cleanup ──────────────────────────────────────────────────────

  it('cleans up state for removed rules', async () => {
    const rule = makeRule({ id: 'temporary', sustained_checks: 1 });

    // Evaluate with the rule → creates state
    await runEval([rule], 95);
    expect(_getState().has('temporary')).toBe(true);

    // Evaluate without the rule → state should be cleaned
    await runEval([], 95);
    expect(_getState().has('temporary')).toBe(false);
  });

  // ── Does not fire when already active ──────────────────────────────────

  it('does not re-fire when already active', async () => {
    const rule = makeRule({ sustained_checks: 1 });

    await runEval([rule], 95);
    expect(mockDeliverAlert).toHaveBeenCalledOnce();

    // Still failing — should not fire again
    await runEval([rule], 95);
    expect(mockDeliverAlert).toHaveBeenCalledOnce();
  });
});

describe('startAlertEngine / stopAlertEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopAlertEngine();
  });

  afterEach(() => {
    stopAlertEngine();
    vi.useRealTimers();
  });

  it('starts interval that can be stopped', () => {
    startAlertEngine();
    // Should not throw when calling stop
    stopAlertEngine();
  });

  it('stopAlertEngine clears state', () => {
    // Manually add state
    _getState().set('test', { consecutiveFailures: 5, lastFiredAt: null, active: true });
    expect(_getState().size).toBe(1);

    stopAlertEngine();
    expect(_getState().size).toBe(0);
  });

  it('does not start multiple intervals', () => {
    startAlertEngine();
    startAlertEngine(); // second call should be no-op
    stopAlertEngine();
  });
});
