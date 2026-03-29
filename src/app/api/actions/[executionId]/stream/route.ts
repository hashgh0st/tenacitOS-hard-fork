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
  context: { params?: { executionId?: string } },
): Promise<Response> {
  const executionId = context.params?.executionId;

  if (!executionId) {
    return new Response(JSON.stringify({ error: 'Missing executionId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const outputEvent = `action:output:${executionId}`;
  const completeEvent = `action:complete:${executionId}`;

  // Hoisted so both start() and cancel() can access them
  let onOutput: ((data: string) => void) | null = null;
  let onComplete: ((data: { status: string; exitCode?: number; output?: string }) => void) | null = null;

  function cleanup() {
    if (onOutput) eventBus.off(outputEvent, onOutput);
    if (onComplete) eventBus.off(completeEvent, onComplete);
    onOutput = null;
    onComplete = null;
  }

  const stream = new ReadableStream({
    start(controller) {
      onOutput = (data: string) => {
        try {
          controller.enqueue(
            encoder.encode(`event: output\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      onComplete = (data: { status: string; exitCode?: number; output?: string }) => {
        try {
          controller.enqueue(
            encoder.encode(`event: complete\ndata: ${JSON.stringify(data)}\n\n`),
          );
          controller.close();
        } catch {
          // Stream may have been closed
        }
        cleanup();
      };

      eventBus.on(outputEvent, onOutput);
      eventBus.on(completeEvent, onComplete);

      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ executionId })}\n\n`),
      );
    },
    cancel() {
      cleanup();
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

export const GET = withAuth<{ executionId: string }>(handleGet);
