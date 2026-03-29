/**
 * Docker container action endpoint.
 * POST /api/docker/:id  body: { action: 'start' | 'stop' | 'restart' }
 *
 * Requires: operator role.
 * Validates container ID format before passing to Docker API.
 * Logs all actions to audit trail and activity log.
 */
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import { logActivity } from '@/lib/activities-db';
import { containerAction, isDockerAvailable } from '@/lib/docker/client';

const VALID_ACTIONS = ['start', 'stop', 'restart'] as const;
type ContainerAction = (typeof VALID_ACTIONS)[number];

/** Container IDs are hex strings (64 chars full, or short prefix). Names are alphanumeric with hyphens/underscores/dots. */
const CONTAINER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/;

function isValidContainerId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && CONTAINER_ID_RE.test(id);
}

async function handlePost(
  request: Request,
  context: { params?: { id?: string } },
  auth: AuthContext,
): Promise<Response> {
  const containerId = context.params?.id;

  if (!containerId || !isValidContainerId(containerId)) {
    return Response.json(
      { error: 'Invalid container ID format' },
      { status: 400 },
    );
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.includes(action as ContainerAction)) {
    return Response.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
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

  const ip = getClientIp(request);

  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: `docker.container.${action}`,
    target: containerId,
    details: { containerId, action },
    ipAddress: ip,
    severity: 'info',
  });

  try {
    await containerAction(containerId, action as ContainerAction);

    logActivity('command', `Docker container ${action}: ${containerId}`, 'success', {
      metadata: { containerId, action, user: auth.username },
    });

    return Response.json({ success: true, containerId, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    logActivity('command', `Docker container ${action} failed: ${containerId}`, 'error', {
      metadata: { containerId, action, error: message, user: auth.username },
    });

    return Response.json(
      { error: `Container ${action} failed`, details: message },
      { status: 500 },
    );
  }
}

export const POST = withAuth<{ id: string }>(handlePost, { requiredRole: 'operator' });
