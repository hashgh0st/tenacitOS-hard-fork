/**
 * Docker prune endpoint.
 * POST /api/docker/prune
 *
 * Prunes stopped containers and dangling images.
 * Requires: operator role.
 * Logs to audit trail.
 */
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import { logActivity } from '@/lib/activities-db';
import { isDockerAvailable, pruneContainers, pruneImages } from '@/lib/docker/client';

async function handlePost(
  request: Request,
  _context: { params?: Record<string, string> },
  auth: AuthContext,
): Promise<Response> {
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
    action: 'docker.prune',
    details: { type: 'containers+images' },
    ipAddress: ip,
    severity: 'warning',
  });

  try {
    const [containers, images] = await Promise.all([
      pruneContainers(),
      pruneImages(),
    ]);

    logActivity('command', 'Docker prune: containers + images', 'success', {
      metadata: {
        containersDeleted: containers.ContainersDeleted?.length ?? 0,
        containerSpaceReclaimed: containers.SpaceReclaimed,
        imagesDeleted: images.ImagesDeleted?.length ?? 0,
        imageSpaceReclaimed: images.SpaceReclaimed,
        user: auth.username,
      },
    });

    return Response.json({ containers, images });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    logActivity('command', 'Docker prune failed', 'error', {
      metadata: { error: message, user: auth.username },
    });

    return Response.json(
      { error: 'Docker prune failed', details: message },
      { status: 500 },
    );
  }
}

export const POST = withAuth(handlePost, { requiredRole: 'operator' });
