'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useSSE, type UseSSEResult } from '@/hooks/useSSE';
import type {
  SystemMetrics,
  AgentStatusUpdate,
  ActivityEntry,
  Notification,
  CostSnapshot,
  DockerStatusUpdate,
  AlertEvent,
} from '@/lib/events/bus';

// ── Context shape ───────────────────────────────────────────────────────────

export interface AlertStreamMessage {
  type: 'fired' | 'resolved';
  data: AlertEvent;
}

interface SSEContextValue {
  system: UseSSEResult<SystemMetrics>;
  agents: UseSSEResult<AgentStatusUpdate>;
  activity: UseSSEResult<ActivityEntry>;
  notifications: UseSSEResult<Notification>;
  costs: UseSSEResult<CostSnapshot>;
  docker: UseSSEResult<DockerStatusUpdate>;
  alerts: UseSSEResult<AlertStreamMessage>;
}

const SSEContext = createContext<SSEContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

/**
 * Wraps the dashboard layout and creates **one** EventSource per stream,
 * shared by all child components. Prevents duplicate connections when
 * navigating between pages.
 */
export function SSEProvider({ children }: { children: React.ReactNode }) {
  const system = useSSE<SystemMetrics>('/api/stream/system');
  const agents = useSSE<AgentStatusUpdate>('/api/stream/agents');
  const activity = useSSE<ActivityEntry>('/api/stream/activity');
  const notifications = useSSE<Notification>('/api/stream/notifications');
  const costs = useSSE<CostSnapshot>('/api/stream/costs');
  const docker = useSSE<DockerStatusUpdate>('/api/stream/docker');
  const alerts = useSSE<AlertStreamMessage>('/api/stream/alerts');

  const value = useMemo<SSEContextValue>(
    () => ({ system, agents, activity, notifications, costs, docker, alerts }),
    [system, agents, activity, notifications, costs, docker, alerts],
  );

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

// ── Typed consumer hooks ────────────────────────────────────────────────────

function useSSEContext(): SSEContextValue {
  const ctx = useContext(SSEContext);
  if (!ctx) {
    throw new Error(
      'SSE hooks must be used inside <SSEProvider>. ' +
        'Wrap your dashboard layout with <SSEProvider>.',
    );
  }
  return ctx;
}

/** Latest system metrics from the SSE stream. */
export function useSystemMetrics(): UseSSEResult<SystemMetrics> {
  return useSSEContext().system;
}

/** Latest agent status update from the SSE stream. */
export function useAgentStatus(): UseSSEResult<AgentStatusUpdate> {
  return useSSEContext().agents;
}

/** Latest activity entry from the SSE stream. */
export function useActivityFeed(): UseSSEResult<ActivityEntry> {
  return useSSEContext().activity;
}

/** Latest notification from the SSE stream. */
export function useNotifications(): UseSSEResult<Notification> {
  return useSSEContext().notifications;
}

/** Latest cost snapshot from the SSE stream. */
export function useCostData(): UseSSEResult<CostSnapshot> {
  return useSSEContext().costs;
}

/** Latest Docker status update from the SSE stream. */
export function useDockerStatus(): UseSSEResult<DockerStatusUpdate> {
  return useSSEContext().docker;
}

/** Latest alert stream message from the SSE stream. */
export function useAlertStream(): UseSSEResult<AlertStreamMessage> {
  return useSSEContext().alerts;
}
