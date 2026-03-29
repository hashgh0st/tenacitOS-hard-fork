import { eventBus } from '@/lib/events/bus';
import type { AgentStatusUpdate } from '@/lib/events/bus';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const handler = (data: AgentStatusUpdate) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Connection may have closed — ignore encoding errors
        }
      };

      eventBus.on('agent:status', handler);

      request.signal.addEventListener('abort', () => {
        eventBus.off('agent:status', handler);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
