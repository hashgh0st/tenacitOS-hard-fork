/**
 * Docker overview endpoint.
 * GET /api/docker
 *
 * Returns containers, images, system info, disk usage, and Docker state.
 * Gracefully degrades when Docker is not configured or unreachable.
 *
 * Requires: viewer role (minimum).
 */
import { withAuth } from '@/lib/auth/withAuth';
import {
  getDockerState,
  listContainers,
  listImages,
  getSystemInfo,
  getDiskUsage,
} from '@/lib/docker/client';

async function handleGet(): Promise<Response> {
  const state = await getDockerState();

  if (state !== 'available') {
    return Response.json({ state });
  }

  try {
    const [containers, images, systemInfo, diskUsage] = await Promise.all([
      listContainers(),
      listImages(),
      getSystemInfo(),
      getDiskUsage(),
    ]);

    return Response.json({ state, containers, images, systemInfo, diskUsage });
  } catch (err) {
    // If fetching data fails after state check, treat as unreachable
    return Response.json({
      state: 'unreachable' as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export const GET = withAuth(handleGet, { requiredRole: 'viewer' });
