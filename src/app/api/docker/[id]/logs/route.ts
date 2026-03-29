/**
 * Docker container logs SSE endpoint.
 * GET /api/docker/:id/logs
 *
 * Streams container logs as Server-Sent Events using Docker's follow mode.
 * Connects to Docker API /containers/{id}/logs?follow=true&stdout=1&stderr=1&tail=100
 * Pipes chunks as SSE data frames.
 * Cleans up on request abort AND ReadableStream cancel().
 *
 * Requires: viewer role.
 */
import { withAuth } from '@/lib/auth/withAuth';
import { isDockerAvailable, streamContainerLogs, stripDockerLogHeaders } from '@/lib/docker/client';

/** Container IDs are hex strings or names with alphanumeric/hyphens/underscores/dots. */
const CONTAINER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/;

function isValidContainerId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && CONTAINER_ID_RE.test(id);
}

async function handleGet(
  request: Request,
  context: { params?: { id?: string } },
): Promise<Response> {
  const containerId = context.params?.id;

  if (!containerId || !isValidContainerId(containerId)) {
    return Response.json(
      { error: 'Invalid container ID format' },
      { status: 400 },
    );
  }

  const available = await isDockerAvailable();
  if (!available) {
    return Response.json(
      { error: 'Docker is not available' },
      { status: 503 },
    );
  }

  let dockerStream: import('http').IncomingMessage;
  try {
    dockerStream = await streamContainerLogs(containerId, 100);
  } catch (err) {
    return Response.json(
      { error: 'Failed to connect to container logs', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();

  function cleanup() {
    try {
      dockerStream.destroy();
    } catch {
      // Already destroyed
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ containerId })}\n\n`),
      );

      dockerStream.on('data', (chunk: Buffer) => {
        try {
          const text = stripDockerLogHeaders(chunk);
          if (text) {
            // Split into lines and send each as an SSE data frame
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.length > 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(line)}\n\n`),
                );
              }
            }
          }
        } catch {
          // Ignore encoding errors on individual chunks
        }
      });

      dockerStream.on('end', () => {
        try {
          controller.enqueue(
            encoder.encode(`event: end\ndata: ${JSON.stringify({ containerId })}\n\n`),
          );
          controller.close();
        } catch {
          // Stream may already be closed
        }
      });

      dockerStream.on('error', (err) => {
        try {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`),
          );
          controller.close();
        } catch {
          // Stream may already be closed
        }
        cleanup();
      });

      // Clean up when client disconnects
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
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export const GET = withAuth<{ id: string }>(handleGet, { requiredRole: 'viewer' });
