/**
 * SSE endpoint for streaming action output.
 * GET /api/actions/:executionId/stream
 *
 * Subscribes to event bus for execution-specific events:
 *   action:output:{executionId}  — stdout/stderr data chunks
 *   action:complete:{executionId} — final status
 *
 * Cleans up listeners when the client disconnects.
 */
import { withAuth } from '@/lib/auth/withAuth';
import { eventBus } from '@/lib/events/bus';

async function handleGet(
  _request: Request,
  context: { params?: Record<string, string> },
): Promise<Response> {
  const executionId = context.params?.executionId;

  if (!executionId) {
    return new Response(JSON.stringify({ error: 'Missing executionId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const outputEvent = `action:output:${executionId}`;
      const completeEvent = `action:complete:${executionId}`;

      function onOutput(data: string) {
        try {
          controller.enqueue(
            encoder.encode(`event: output\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream may have been closed
          cleanup();
        }
      }

      function onComplete(data: { status: string; exitCode?: number; output?: string }) {
        try {
          controller.enqueue(
            encoder.encode(`event: complete\ndata: ${JSON.stringify(data)}\n\n`),
          );
          controller.close();
        } catch {
          // Stream may have been closed
        }
        cleanup();
      }

      function cleanup() {
        eventBus.off(outputEvent, onOutput);
        eventBus.off(completeEvent, onComplete);
      }

      eventBus.on(outputEvent, onOutput);
      eventBus.on(completeEvent, onComplete);

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ executionId })}\n\n`),
      );

      // If the stream is cancelled (client disconnects), clean up
      // Note: This is handled by the cancel() method below
    },
    cancel() {
      // Clean up all listeners for this execution
      eventBus.removeAllListeners(`action:output:${executionId}`);
      eventBus.removeAllListeners(`action:complete:${executionId}`);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export const GET = withAuth(handleGet);
