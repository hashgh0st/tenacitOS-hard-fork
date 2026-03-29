'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

export type SSEStatus = 'connecting' | 'connected' | 'error';

export interface UseSSEResult<T> {
  data: T | null;
  error: Error | null;
  status: SSEStatus;
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Generic SSE client hook.
 *
 * Connects to the given `endpoint` via EventSource.
 * Auto-reconnects with exponential backoff (1s -> 2s -> 4s -> 8s, max 30s).
 * After repeated failures, surfaces an error but keeps retrying SSE.
 * Cleans up on unmount.
 */
export function useSSE<T>(endpoint: string): UseSSEResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<SSEStatus>('connecting');

  // Refs survive re-renders and allow cleanup from any closure
  const esRef = useRef<EventSource | null>(null);
  const failCountRef = useRef(0);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  // Connect (or reconnect) via EventSource
  const connect = useCallback(function connectEventSource() {
    if (unmountedRef.current) return;

    closeEventSource();
    setStatus('connecting');

    const es = new EventSource(endpoint);
    esRef.current = es;

    es.onopen = () => {
      if (unmountedRef.current) return;
      failCountRef.current = 0;
      backoffRef.current = INITIAL_BACKOFF_MS;
      setStatus('connected');
      setError(null);
    };

    es.onmessage = (event: MessageEvent) => {
      if (unmountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data) as T;
        setData(parsed);
        setError(null);
        setStatus('connected');
      } catch (err) {
        // Ignore individual parse errors — don't crash the stream
        console.warn('[useSSE] Failed to parse message:', err);
      }
    };

    es.onerror = () => {
      if (unmountedRef.current) return;

      closeEventSource();
      failCountRef.current += 1;

      // Exponential backoff reconnect
      const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
      backoffRef.current = delay * 2;
      setError(new Error('SSE connection lost; retrying'));
      setStatus(failCountRef.current >= MAX_CONSECUTIVE_FAILURES ? 'error' : 'connecting');

      reconnectTimerRef.current = setTimeout(connectEventSource, delay);
    };
  }, [endpoint, closeEventSource]);

  useEffect(() => {
    unmountedRef.current = false;
    failCountRef.current = 0;
    backoffRef.current = INITIAL_BACKOFF_MS;
    connect();

    return () => {
      unmountedRef.current = true;
      clearTimers();
      closeEventSource();
    };
  }, [connect, clearTimers, closeEventSource]);

  return useMemo(() => ({ data, error, status }), [data, error, status]);
}
