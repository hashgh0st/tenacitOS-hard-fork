import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '@/lib/events/bus';

describe('SSE stream routes', () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
  });

  it('system route returns SSE headers', async () => {
    const { GET } = await import('@/app/api/stream/system/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/system', {
      signal: controller.signal,
    });

    const response = await GET(request);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');

    controller.abort();
  });

  it('agents route returns SSE headers', async () => {
    const { GET } = await import('@/app/api/stream/agents/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/agents', {
      signal: controller.signal,
    });

    const response = await GET(request);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    controller.abort();
  });

  it('activity route returns SSE headers', async () => {
    const { GET } = await import('@/app/api/stream/activity/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/activity', {
      signal: controller.signal,
    });

    const response = await GET(request);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    controller.abort();
  });

  it('notifications route returns SSE headers', async () => {
    const { GET } = await import('@/app/api/stream/notifications/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/notifications', {
      signal: controller.signal,
    });

    const response = await GET(request);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    controller.abort();
  });

  it('costs route returns SSE headers', async () => {
    const { GET } = await import('@/app/api/stream/costs/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/costs', {
      signal: controller.signal,
    });

    const response = await GET(request);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    controller.abort();
  });

  it('system route streams events from event bus', async () => {
    const { GET } = await import('@/app/api/stream/system/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/system', {
      signal: controller.signal,
    });

    const response = await GET(request);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    // Emit an event
    const metrics = {
      cpu: 42,
      ram: { total: 16000, used: 8000, free: 8000 },
      disk: { total: 500000, used: 250000, free: 250000 },
      network: { rx: 1.5, tx: 0.8 },
      pm2Status: null,
    };

    eventBus.emit('system:metrics', metrics);

    // Read from the stream
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('data: ');
    expect(text).toContain('"cpu":42');
    expect(text).toContain('\n\n');

    const parsed = JSON.parse(text.replace('data: ', '').trim());
    expect(parsed.cpu).toBe(42);
    expect(parsed.ram.total).toBe(16000);

    controller.abort();
  });

  it('cleans up listener on abort', async () => {
    const { GET } = await import('@/app/api/stream/system/route');

    const listenersBefore = eventBus.listenerCount('system:metrics');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/system', {
      signal: controller.signal,
    });

    await GET(request);

    const listenersAfterConnect = eventBus.listenerCount('system:metrics');
    expect(listenersAfterConnect).toBe(listenersBefore + 1);

    controller.abort();

    // Give the abort handler time to fire
    await new Promise((r) => setTimeout(r, 10));

    const listenersAfterAbort = eventBus.listenerCount('system:metrics');
    expect(listenersAfterAbort).toBe(listenersBefore);
  });

  it('all routes export dynamic = force-dynamic', async () => {
    const system = await import('@/app/api/stream/system/route');
    const agents = await import('@/app/api/stream/agents/route');
    const activity = await import('@/app/api/stream/activity/route');
    const notifications = await import('@/app/api/stream/notifications/route');
    const costs = await import('@/app/api/stream/costs/route');

    expect(system.dynamic).toBe('force-dynamic');
    expect(agents.dynamic).toBe('force-dynamic');
    expect(activity.dynamic).toBe('force-dynamic');
    expect(notifications.dynamic).toBe('force-dynamic');
    expect(costs.dynamic).toBe('force-dynamic');
  });

  it('cost route streams cost:update events', async () => {
    const { GET } = await import('@/app/api/stream/costs/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/costs', {
      signal: controller.signal,
    });

    const response = await GET(request);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const snapshot = {
      timestamp: Date.now(),
      totalCost: 123.45,
      periodCost: 12.34,
      byAgent: [{ agentId: 'claude', cost: 100 }],
    };

    eventBus.emit('cost:update', snapshot);

    const { value } = await reader.read();
    const text = decoder.decode(value);
    const parsed = JSON.parse(text.replace('data: ', '').trim());

    expect(parsed.totalCost).toBe(123.45);
    expect(parsed.byAgent[0].agentId).toBe('claude');

    controller.abort();
  });

  it('agent route streams agent:status events', async () => {
    const { GET } = await import('@/app/api/stream/agents/route');

    const controller = new AbortController();
    const request = new Request('http://localhost/api/stream/agents', {
      signal: controller.signal,
    });

    const response = await GET(request);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const update = {
      agents: [
        { id: 'a1', name: 'Claude', model: 'opus', status: 'active' as const },
      ],
    };

    eventBus.emit('agent:status', update);

    const { value } = await reader.read();
    const text = decoder.decode(value);
    const parsed = JSON.parse(text.replace('data: ', '').trim());

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0].name).toBe('Claude');

    controller.abort();
  });
});
