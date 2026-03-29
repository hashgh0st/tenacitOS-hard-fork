/**
 * Alert evaluation engine.
 *
 * Runs a 10-second loop that evaluates all enabled alert rules against
 * current metric values, fires alerts when conditions are sustained,
 * and auto-resolves when conditions clear.
 */
import { emitEvent } from '@/lib/events/bus';
import { resolveMetric } from './resolvers';
import { loadRules } from './storage';
import { recordAlert, resolveAlert } from './storage';
import { deliverAlert, deliverResolution } from './channels';
import type { AlertRule } from './types';

// ── Per-rule evaluation state ────────────────────────────────────────────────

interface RuleState {
  consecutiveFailures: number;
  lastFiredAt: number | null;
  active: boolean;
}

const state = new Map<string, RuleState>();

function getState(ruleId: string): RuleState {
  let s = state.get(ruleId);
  if (!s) {
    s = { consecutiveFailures: 0, lastFiredAt: null, active: false };
    state.set(ruleId, s);
  }
  return s;
}

// ── Condition evaluation ─────────────────────────────────────────────────────

export function evaluateCondition(
  value: number,
  operator: AlertRule['condition']['operator'],
  threshold: number,
): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    case 'eq':
      return value === threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    default:
      return false;
  }
}

// ── Core evaluation loop ─────────────────────────────────────────────────────

export async function evaluateRules(
  loadRulesFn: () => AlertRule[] = loadRules,
  resolveMetricFn: (path: string) => Promise<number | null> = resolveMetric,
  recordAlertFn: typeof recordAlert = recordAlert,
  resolveAlertFn: typeof resolveAlert = resolveAlert,
  deliverAlertFn: typeof deliverAlert = deliverAlert,
  deliverResolutionFn: typeof deliverResolution = deliverResolution,
  nowFn: () => number = Date.now,
): Promise<void> {
  const rules = loadRulesFn().filter((r) => r.enabled);
  const currentRuleIds = new Set(rules.map((r) => r.id));

  // Prune state for deleted rules
  for (const ruleId of state.keys()) {
    if (!currentRuleIds.has(ruleId)) {
      state.delete(ruleId);
    }
  }

  for (const rule of rules) {
    try {
      const value = await resolveMetricFn(rule.condition.metric);
      if (value === null) continue; // metric unavailable, skip

      const conditionMet = evaluateCondition(value, rule.condition.operator, rule.condition.value);
      const s = getState(rule.id);

      if (conditionMet) {
        s.consecutiveFailures++;

        const inCooldown =
          s.lastFiredAt !== null &&
          nowFn() - s.lastFiredAt < rule.cooldown_minutes * 60 * 1000;

        if (
          s.consecutiveFailures >= rule.sustained_checks &&
          !s.active &&
          !inCooldown
        ) {
          // FIRE
          s.active = true;
          s.lastFiredAt = nowFn();

          const alertId = `alert-${rule.id}-${nowFn()}`;
          const message = `${rule.name}: ${rule.condition.metric} is ${value} (threshold: ${rule.condition.operator} ${rule.condition.value})`;
          const timestamp = new Date(nowFn()).toISOString();

          emitEvent('alert:fired', {
            id: alertId,
            ruleId: rule.id,
            severity: rule.severity,
            message,
            timestamp,
            resolved: false,
          });

          await deliverAlertFn(rule, value);

          recordAlertFn({
            id: alertId,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message,
            metricValue: value,
            thresholdValue: rule.condition.value,
            firedAt: timestamp,
            resolvedAt: null,
          });
        }
      } else {
        if (s.active) {
          // RESOLVE
          s.active = false;
          s.consecutiveFailures = 0;

          const timestamp = new Date(nowFn()).toISOString();

          emitEvent('alert:resolved', {
            id: `resolved-${rule.id}-${nowFn()}`,
            ruleId: rule.id,
            severity: rule.severity,
            message: `Resolved: ${rule.name}`,
            timestamp,
            resolved: true,
          });

          await deliverResolutionFn(rule);
          resolveAlertFn(rule.id);
        } else {
          // Not active, condition not met → reset
          s.consecutiveFailures = 0;
        }
      }
    } catch (err) {
      console.error(`[alert-engine] Error evaluating rule ${rule.id}:`, err);
    }
  }
}

// ── Start / Stop ─────────────────────────────────────────────────────────────

const EVAL_INTERVAL_MS = 10_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startAlertEngine(): void {
  if (intervalId) return; // already running
  intervalId = setInterval(() => void evaluateRules(), EVAL_INTERVAL_MS);
}

export function stopAlertEngine(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  state.clear();
}

/**
 * Expose internal state map for testing.
 */
export function _getState(): Map<string, RuleState> {
  return state;
}
