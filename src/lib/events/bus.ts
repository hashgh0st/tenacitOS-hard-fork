/**
 * Typed EventEmitter singleton for real-time event distribution.
 *
 * All pollers, watchers, and SSE endpoints funnel through this bus.
 * Import `eventBus` directly, or use the typed helper functions
 * `emitEvent`, `onEvent`, `offEvent` for ergonomic access.
 */
import { EventEmitter } from 'events';
import type { Activity } from '@/lib/activity-logger';

// ── Payload types ──────────────────────────────────────────────────────────

export interface SystemMetrics {
  cpu: number;
  ram: { total: number; used: number; free: number };
  disk: { total: number; used: number; free: number };
  network: { rx: number; tx: number } | null;
  pm2Status: PM2Process[] | null;
  dockerStatus?: DockerContainerStatus[] | null;
}

export interface PM2Process {
  name: string;
  pid: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
}

export interface DockerContainerStatus {
  id: string;
  name: string;
  status: string;
  state: string;
}

export interface AgentStatusUpdate {
  agents: AgentState[];
}

export interface AgentState {
  id: string;
  name: string;
  model: string;
  status: 'active' | 'idle' | 'error' | 'stopped';
  lastSeen?: string;
}

export type ActivityEntry = Activity;

export interface Notification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
}

export interface CostSnapshot {
  timestamp: number;
  totalCost: number;
  periodCost: number;
  byAgent: Array<{ agentId: string; cost: number }>;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  resolved: boolean;
}

export interface DockerStatusUpdate {
  containers: DockerContainerStatus[];
}

// ── Event map ──────────────────────────────────────────────────────────────

export interface EventPayloadMap {
  'system:metrics': SystemMetrics;
  'agent:status': AgentStatusUpdate;
  'activity:new': ActivityEntry;
  'notification:new': Notification;
  'cost:update': CostSnapshot;
  'alert:fired': AlertEvent;
  'alert:resolved': AlertEvent;
  'docker:status': DockerStatusUpdate;
}

export type EventName = keyof EventPayloadMap;

// ── Singleton ──────────────────────────────────────────────────────────────

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Reset the singleton (for testing only).
   */
  static resetForTest(): void {
    if (EventBus.instance) {
      EventBus.instance.removeAllListeners();
    }
    EventBus.instance = undefined as unknown as EventBus;
  }
}

export const eventBus = EventBus.getInstance();

// ── Typed helpers ──────────────────────────────────────────────────────────

export function emitEvent<K extends EventName>(
  event: K,
  payload: EventPayloadMap[K],
): boolean {
  return eventBus.emit(event, payload);
}

export function onEvent<K extends EventName>(
  event: K,
  handler: (payload: EventPayloadMap[K]) => void,
): void {
  eventBus.on(event, handler as (...args: unknown[]) => void);
}

export function offEvent<K extends EventName>(
  event: K,
  handler: (payload: EventPayloadMap[K]) => void,
): void {
  eventBus.off(event, handler as (...args: unknown[]) => void);
}
