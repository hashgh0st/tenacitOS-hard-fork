/**
 * Send a message to an agent.
 * POST /api/agents/:id/message  body: { message: string }
 *
 * Requires: operator role.
 * Rate limited: 10 actions/min per user.
 * Validates agent ID format before passing to gateway.
 * Logs all actions to audit trail.
 */
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import { sendMessage, isGatewayAvailable, GatewayError } from '@/lib/gateway/client';
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
  const rateKey = `agent-message:${auth.userId}`;
  const rateCheck = agentControlLimiter.check(rateKey);
  if (!rateCheck.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', retryAfterMs: rateCheck.retryAfterMs },
      { status: 429 },
    );
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = body.message;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return Response.json(
      { error: 'Message is required and must be a non-empty string' },
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
    action: 'agent.message',
    target: agentId,
    details: { agentId, messageLength: message.length },
    ipAddress: ip,
    severity: 'info',
  });

  // Record the action for rate limiting
  agentControlLimiter.record(rateKey);

  try {
    await sendMessage(agentId, message);

    return Response.json({ success: true, agentId });
  } catch (err) {
    const detail =
      err instanceof GatewayError
        ? `Gateway error (${err.status})`
        : 'Send message failed';

    logAudit({
      userId: auth.userId,
      username: auth.username,
      action: 'agent.message.failed',
      target: agentId,
      details: { agentId, error: detail },
      ipAddress: ip,
      severity: 'warning',
    });

    return Response.json(
      { error: 'Failed to send message to agent' },
      { status: 502 },
    );
  }
}

export const POST = withAuth<{ id: string }>(handlePost, { requiredRole: 'operator' });
