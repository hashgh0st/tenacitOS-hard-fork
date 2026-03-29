import { eventBus, type EventName, type EventPayloadMap } from '@/lib/events/bus';

/**
 * Factory for SSE route handlers that subscribe to the event bus.
 * Each route becomes: export const GET = createSSEHandler('system:metrics');
 */
export function createSSEHandler<K extends EventName>(eventName: K) {
  return async function GET(request: Request): Promise<Response> {
    const encoder = new TextEncoder();

    let handler: ((data: EventPayloadMap[K]) => void) | null = null;

    function cleanup() {
      if (handler) {
        eventBus.off(eventName, handler);
        handler = null;
      }
    }

    const stream = new ReadableStream({
      start(controller) {
        handler = (data: EventPayloadMap[K]) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            // Connection closed — clean up
            cleanup();
          }
        };

        eventBus.on(eventName, handler);

        request.signal.addEventListener('abort', () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  };
}
