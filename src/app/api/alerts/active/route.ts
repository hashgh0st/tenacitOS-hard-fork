/**
 * Active (unresolved) alerts endpoint.
 *
 * GET /api/alerts/active — Returns currently unresolved alerts.
 */
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { getActiveAlerts, initAlertDb } from '@/lib/alerts/storage';

// Ensure the DB schema is initialized
try {
  initAlertDb();
} catch {
  // DB init may fail in build; will retry on first request
}

async function handleGet(
  _request: Request,
  _context: { params?: Record<string, string> },
  _auth: AuthContext,
): Promise<Response> {
  try {
    initAlertDb();
    const alerts = getActiveAlerts();
    return Response.json({ alerts });
  } catch (err) {
    console.error('Failed to fetch active alerts:', err);
    return Response.json({ error: 'Failed to fetch active alerts' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { requiredRole: 'viewer' });
