// @vitest-environment happy-dom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSSE, type UseSSEResult } from '@/hooks/useSSE';

type Payload = { count: number };
type ESHandler = ((event: MessageEvent) => void) | ((event: Event) => void) | null;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState: number;
  onopen: ESHandler = null;
  onmessage: ESHandler = null;
  onerror: ESHandler = null;

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockEventSource.CONNECTING;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  simulateOpen() {
    this.readyState = MockEventSource.OPEN;
    if (this.onopen) {
      (this.onopen as (event: Event) => void)(new Event('open'));
    }
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      (this.onmessage as (event: MessageEvent) => void)(
        new MessageEvent('message', { data }),
      );
    }
  }

  simulateError() {
    if (this.onerror) {
      (this.onerror as (event: Event) => void)(new Event('error'));
    }
  }
}

function HookHarness({
  endpoint,
  onChange,
}: {
  endpoint: string;
  onChange: (state: UseSSEResult<Payload>) => void;
}) {
  const state = useSSE<Payload>(endpoint);

  useEffect(() => {
    onChange(state);
  }, [state, onChange]);

  return null;
}

describe('useSSE', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }

    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }

    root = null;
    container = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function renderHook(onChange: (state: UseSSEResult<Payload>) => void) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        React.createElement(HookHarness, {
          endpoint: '/api/stream/test',
          onChange,
        }),
      );
    });
  }

  it('updates state from SSE open and message events', async () => {
    let latestState: UseSSEResult<Payload> | null = null;

    await renderHook((state) => {
      latestState = state;
    });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(latestState?.status).toBe('connecting');

    await act(async () => {
      MockEventSource.instances[0].simulateOpen();
      MockEventSource.instances[0].simulateMessage(JSON.stringify({ count: 7 }));
    });

    expect(latestState?.status).toBe('connected');
    expect(latestState?.error).toBeNull();
    expect(latestState?.data).toEqual({ count: 7 });
  });

  it('retries SSE after repeated failures without falling back to fetch', async () => {
    let latestState: UseSSEResult<Payload> | null = null;

    await renderHook((state) => {
      latestState = state;
    });

    await act(async () => {
      MockEventSource.instances[0].simulateError();
    });
    expect(latestState?.status).toBe('connecting');

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    await act(async () => {
      MockEventSource.instances[1].simulateError();
    });
    expect(latestState?.status).toBe('connecting');

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(MockEventSource.instances).toHaveLength(3);

    await act(async () => {
      MockEventSource.instances[2].simulateError();
    });
    expect(latestState?.status).toBe('error');
    expect(latestState?.error?.message).toContain('retrying');
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(MockEventSource.instances).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
