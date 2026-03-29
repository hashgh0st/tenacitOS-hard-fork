/**
 * Alert history endpoint.
 *
 * GET /api/alerts/history?ruleId=&severity=&from=&to=&limit=&offset=
 *
 * Returns paginated alert history entries.
 */
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { getAlertHistory, initAlertDb } from '@/lib/alerts/storage';

// Ensure the DB schema is initialized
try {
  initAlertDb();
} catch {
  // DB init may fail in build; will retry on first request
}

async function handleGet(
  request: Request,
  _context: { params?: Record<string, string> },
  _auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);

  const ruleId = url.searchParams.get('ruleId') ?? undefined;
  const severity = url.searchParams.get('severity') ?? undefined;
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  try {
    initAlertDb();
    const result = getAlertHistory({ ruleId, severity, from, to, limit, offset });
    return Response.json(result);
  } catch (err) {
    console.error('Failed to query alert history:', err);
    return Response.json({ error: 'Failed to query alert history' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { requiredRole: 'viewer' });
