import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  eventBus,
  emitEvent,
  onEvent,
  offEvent,
  type SystemMetrics,
  type Notification,
  type AlertEvent,
} from '@/lib/events/bus';

describe('EventBus', () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
  });

  it('returns the same singleton instance across calls', async () => {
    // Both the named export and getInstance() should be identical
    const { eventBus: bus1 } = await import('@/lib/events/bus');
    const { eventBus: bus2 } = await import('@/lib/events/bus');
    expect(bus1).toBe(bus2);
  });

  it('has maxListeners set to 100', () => {
    expect(eventBus.getMaxListeners()).toBe(100);
  });

  it('delivers typed payloads via emitEvent + onEvent', () => {
    const received: SystemMetrics[] = [];
    const handler = (data: SystemMetrics) => received.push(data);
    onEvent('system:metrics', handler);

    const metrics: SystemMetrics = {
      cpu: 42,
      ram: { total: 8e9, used: 4e9, free: 4e9 },
      disk: { total: 100e9, used: 50e9, free: 50e9 },
      network: { rx: 1024, tx: 2048 },
      pm2Status: null,
    };
    emitEvent('system:metrics', metrics);

    expect(received).toHaveLength(1);
    expect(received[0].cpu).toBe(42);
    expect(received[0].ram.total).toBe(8e9);

    offEvent('system:metrics', handler);
  });

  it('removes listener via offEvent', () => {
    const calls: string[] = [];
    const handler = (n: Notification) => calls.push(n.title);

    onEvent('notification:new', handler);
    emitEvent('notification:new', {
      id: '1',
      timestamp: '',
      title: 'first',
      message: '',
      type: 'info',
      read: false,
    });
    expect(calls).toEqual(['first']);

    offEvent('notification:new', handler);
    emitEvent('notification:new', {
      id: '2',
      timestamp: '',
      title: 'second',
      message: '',
      type: 'info',
      read: false,
    });
    expect(calls).toEqual(['first']); // no second call
  });

  it('does not leak events between different event types', () => {
    const metricsHandler = vi.fn();
    const alertHandler = vi.fn();

    onEvent('system:metrics', metricsHandler);
    onEvent('alert:fired', alertHandler);

    const alert: AlertEvent = {
      id: 'a1',
      ruleId: 'r1',
      severity: 'critical',
      message: 'disk full',
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    emitEvent('alert:fired', alert);

    expect(metricsHandler).not.toHaveBeenCalled();
    expect(alertHandler).toHaveBeenCalledWith(alert);

    offEvent('system:metrics', metricsHandler);
    offEvent('alert:fired', alertHandler);
  });

  it('handles 100 listeners without warning', () => {
    const spy = vi.spyOn(process, 'emitWarning');
    const handlers: Array<() => void> = [];

    for (let i = 0; i < 100; i++) {
      const h = () => {};
      handlers.push(h);
      onEvent('system:metrics', h);
    }

    expect(spy).not.toHaveBeenCalled();

    // Clean up
    for (const h of handlers) {
      offEvent('system:metrics', h);
    }
    spy.mockRestore();
  });
});
