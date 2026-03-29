/**
 * Approval management endpoint.
 *
 * GET  /api/approvals              — List pending approvals (operator role)
 * POST /api/approvals  body: { approvalId, action, note? }  — Respond to approval (operator role)
 *
 * Calls the OpenClaw gateway for both operations.
 * Logs all actions to audit trail.
 */
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import {
  listApprovals,
  respondToApproval,
  isGatewayAvailable,
  GatewayError,
} from '@/lib/gateway/client';

const VALID_ACTIONS = ['approve', 'deny'] as const;
type ApprovalAction = (typeof VALID_ACTIONS)[number];

/** Approval IDs: alphanumeric with hyphens (UUID-style). */
const APPROVAL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_\-]*$/;

function isValidApprovalId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && APPROVAL_ID_RE.test(id);
}

// ── GET: List pending approvals ──────────────────────────────────────────

async function handleGet(
  _request: Request,
  _context: { params?: Record<string, string> },
  auth: AuthContext,
): Promise<Response> {
  const available = await isGatewayAvailable();
  if (!available) {
    return Response.json(
      { error: 'Agent gateway is not available. Please try again later.' },
      { status: 503 },
    );
  }

  try {
    const approvals = await listApprovals();
    return Response.json({ approvals });
  } catch (err) {
    const detail =
      err instanceof GatewayError
        ? `Gateway error (${err.status})`
        : 'Failed to list approvals';

    logAudit({
      username: auth.username,
      action: 'approvals.list.failed',
      details: { error: detail },
      severity: 'warning',
    });

    return Response.json(
      { error: 'Failed to retrieve approvals' },
      { status: 502 },
    );
  }
}

// ── POST: Respond to an approval ─────────────────────────────────────────

async function handlePost(
  request: Request,
  _context: { params?: Record<string, string> },
  auth: AuthContext,
): Promise<Response> {
  let body: { approvalId?: string; action?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { approvalId, action, note } = body;

  if (!approvalId || !isValidApprovalId(approvalId)) {
    return Response.json(
      { error: 'Invalid approval ID format' },
      { status: 400 },
    );
  }

  if (!action || !VALID_ACTIONS.includes(action as ApprovalAction)) {
    return Response.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  const available = await isGatewayAvailable();
  if (!available) {
    return Response.json(
      { error: 'Agent gateway is not available. Please try again later.' },
      { status: 503 },
    );
  }

  const ip = getClientIp(request);

  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: `approval.${action}`,
    target: approvalId,
    details: { approvalId, action, note: note ?? null },
    ipAddress: ip,
    severity: 'info',
  });

  try {
    await respondToApproval(approvalId, action as ApprovalAction, note);

    return Response.json({ success: true, approvalId, action });
  } catch (err) {
    const detail =
      err instanceof GatewayError
        ? `Gateway error (${err.status})`
        : 'Approval response failed';

    logAudit({
      userId: auth.userId,
      username: auth.username,
      action: `approval.${action}.failed`,
      target: approvalId,
      details: { approvalId, action, error: detail },
      ipAddress: ip,
      severity: 'warning',
    });

    return Response.json(
      { error: 'Failed to respond to approval' },
      { status: 502 },
    );
  }
}

export const GET = withAuth(handleGet, { requiredRole: 'operator' });
export const POST = withAuth(handlePost, { requiredRole: 'operator' });
