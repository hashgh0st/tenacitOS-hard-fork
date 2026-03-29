/**
 * Agent lifecycle control endpoint.
 * POST /api/agents/:id/control  body: { action: 'start' | 'stop' | 'restart' }
 *
 * Requires: operator role.
 * Rate limited: 10 actions/min per user.
 * Validates agent ID format before passing to gateway.
 * Logs all actions to audit trail and activity log.
 */
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import { logActivity } from '@/lib/activities-db';
import { controlAgent, isGatewayAvailable, GatewayError } from '@/lib/gateway/client';
import { isValidAgentId, agentControlLimiter } from '@/lib/gateway/validate';

const VALID_ACTIONS = ['start', 'stop', 'restart'] as const;
type AgentAction = (typeof VALID_ACTIONS)[number];

async function handlePost(
  request: Request,
  context: { params?: { id?: string } },
  auth: AuthContext,
): Promise<Response> {
  const agentId = context.params?.id;

  if (!agentId || !isValidAgentId(agentId)) {
    return Response.json(
      { error: 'Invalid agent ID format' },
      { status: 400 },
    );
  }

  // Rate limit check
  const rateKey = `agent-control:${auth.userId}`;
  const rateCheck = agentControlLimiter.check(rateKey);
  if (!rateCheck.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', retryAfterMs: rateCheck.retryAfterMs },
      { status: 429 },
    );
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.includes(action as AgentAction)) {
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
    action: `agent.${action}`,
    target: agentId,
    details: { agentId, action },
    ipAddress: ip,
    severity: 'info',
  });

  // Record the action for rate limiting
  agentControlLimiter.record(rateKey);

  try {
    await controlAgent(agentId, action as AgentAction);

    logActivity('agent_action', `Agent ${action}: ${agentId}`, 'success', {
      metadata: { agentId, action, user: auth.username },
    });

    return Response.json({ success: true, agentId, action });
  } catch (err) {
    const message =
      err instanceof GatewayError
        ? `Gateway error (${err.status})`
        : 'Agent control failed';

    logActivity('agent_action', `Agent ${action} failed: ${agentId}`, 'error', {
      metadata: { agentId, action, error: message, user: auth.username },
    });

    return Response.json(
      { error: 'Agent control action failed' },
      { status: 502 },
    );
  }
}

export const POST = withAuth<{ id: string }>(handlePost, { requiredRole: 'operator' });
