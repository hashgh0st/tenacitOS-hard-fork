'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type SSEStatus = 'connecting' | 'connected' | 'error';

export interface UseSSEResult<T> {
  data: T | null;
  error: Error | null;
  status: SSEStatus;
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const POLL_INTERVAL_MS = 5_000;

/**
 * Generic SSE client hook.
 *
 * Connects to the given `endpoint` via EventSource.
 * Auto-reconnects with exponential backoff (1s -> 2s -> 4s -> 8s, max 30s).
 * After 3 consecutive failures, falls back to fetch-based polling every 5s.
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
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  // Fetch-based polling fallback
  const startPolling = useCallback(() => {
    if (unmountedRef.current) return;

    const poll = async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (!unmountedRef.current) {
          setData(json);
          setError(null);
          setStatus('connected');
        }
      } catch (err) {
        if (!unmountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus('error');
        }
      }
    };

    // Poll immediately, then every POLL_INTERVAL_MS
    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [endpoint]);

  // Connect (or reconnect) via EventSource
  const connect = useCallback(() => {
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

      if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        // Fall back to polling
        setError(new Error('SSE failed — falling back to polling'));
        setStatus('error');
        startPolling();
        return;
      }

      // Exponential backoff reconnect
      const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
      backoffRef.current = delay * 2;
      setStatus('connecting');

      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [endpoint, closeEventSource, startPolling]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      clearTimers();
      closeEventSource();
    };
  }, [connect, clearTimers, closeEventSource]);

  return { data, error, status };
}
