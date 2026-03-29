/**
 * Combined SSE stream for alert events (fired + resolved).
 *
 * Emits: { type: 'fired'|'resolved', data: AlertEvent }
 */
import { eventBus } from '@/lib/events/bus';
import type { AlertEvent } from '@/lib/events/bus';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let onFired: ((data: AlertEvent) => void) | null = null;
  let onResolved: ((data: AlertEvent) => void) | null = null;

  function cleanup() {
    if (onFired) { eventBus.off('alert:fired', onFired); onFired = null; }
    if (onResolved) { eventBus.off('alert:resolved', onResolved); onResolved = null; }
  }

  const stream = new ReadableStream({
    start(controller) {
      onFired = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'fired', data })}\n\n`));
        } catch { cleanup(); }
      };
      onResolved = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'resolved', data })}\n\n`));
        } catch { cleanup(); }
      };
      eventBus.on('alert:fired', onFired);
      eventBus.on('alert:resolved', onResolved);
      request.signal.addEventListener('abort', () => { cleanup(); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
