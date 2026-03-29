/**
 * Hot-swap an agent's model.
 * PATCH /api/agents/:id/model  body: { model: string }
 *
 * Requires: operator role.
 * Rate limited: 10 actions/min per user.
 * Validates agent ID format before passing to gateway.
 * Logs all actions to audit trail.
 */
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import { swapModel, isGatewayAvailable, GatewayError } from '@/lib/gateway/client';
import { isValidAgentId, agentControlLimiter } from '@/lib/gateway/validate';

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
  const rateKey = `agent-model:${auth.userId}`;
  const rateCheck = agentControlLimiter.check(rateKey);
  if (!rateCheck.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', retryAfterMs: rateCheck.retryAfterMs },
      { status: 429 },
    );
  }

  let body: { model?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const model = body.model;
  if (!model || typeof model !== 'string' || model.trim().length === 0) {
    return Response.json(
      { error: 'Model is required and must be a non-empty string' },
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
    action: 'agent.model.swap',
    target: agentId,
    details: { agentId, model },
    ipAddress: ip,
    severity: 'info',
  });

  // Record the action for rate limiting
  agentControlLimiter.record(rateKey);

  try {
    await swapModel(agentId, model);

    return Response.json({ success: true, agentId, model });
  } catch (err) {
    const detail =
      err instanceof GatewayError
        ? `Gateway error (${err.status})`
        : 'Model swap failed';

    logAudit({
      userId: auth.userId,
      username: auth.username,
      action: 'agent.model.swap.failed',
      target: agentId,
      details: { agentId, model, error: detail },
      ipAddress: ip,
      severity: 'warning',
    });

    return Response.json(
      { error: 'Failed to swap agent model' },
      { status: 502 },
    );
  }
}

export const PATCH = withAuth<{ id: string }>(handlePost, { requiredRole: 'operator' });
