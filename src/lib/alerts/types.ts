/**
 * Alert engine types and interfaces.
 */

export interface AlertCondition {
  metric: string;       // dot-notation: 'system.cpu', 'cost.daily.total', etc.
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
}

export type AlertChannel = 'in_app' | 'webhook' | 'telegram' | 'email';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  sustained_checks: number;   // must fail N consecutive checks before firing
  cooldown_minutes: number;   // suppress re-fire for this duration
  channels: AlertChannel[];
  severity: AlertSeverity;
  enabled: boolean;
  webhook_url?: string;
  telegram_chat_id?: string;
}

export const VALID_OPERATORS = ['gt', 'lt', 'eq', 'gte', 'lte'] as const;
export const VALID_CHANNELS: AlertChannel[] = ['in_app', 'webhook', 'telegram', 'email'];
export const VALID_SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical'];

export interface AlertHistoryEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  metricValue: number;
  thresholdValue: number;
  firedAt: string;
  resolvedAt: string | null;
}
