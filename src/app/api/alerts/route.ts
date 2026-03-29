/**
 * Alert rules CRUD endpoint.
 *
 * GET  /api/alerts  — List all alert rules (viewer role)
 * POST /api/alerts  — Create a new alert rule (operator role)
 */
import { randomUUID } from 'crypto';
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import { loadRules, addRule } from '@/lib/alerts/storage';
import type { AlertRule, AlertChannel, AlertSeverity } from '@/lib/alerts/types';
import { VALID_OPERATORS, VALID_CHANNELS, VALID_SEVERITIES } from '@/lib/alerts/types';

// ── GET: List all rules ─────────────────────────────────────────────────────

async function handleGet(
  _request: Request,
  _context: { params?: Record<string, string> },
  _auth: AuthContext,
): Promise<Response> {
  const rules = loadRules();
  return Response.json({ rules });
}

// ── POST: Create a new rule ─────────────────────────────────────────────────

async function handlePost(
  request: Request,
  _context: { params?: Record<string, string> },
  auth: AuthContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  const { name, condition, sustained_checks, cooldown_minutes, channels, severity } = body as Record<string, unknown>;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Response.json({ error: 'name is required and must be a non-empty string' }, { status: 400 });
  }

  if (!condition || typeof condition !== 'object' || condition === null) {
    return Response.json({ error: 'condition is required and must be an object' }, { status: 400 });
  }

  const cond = condition as Record<string, unknown>;
  if (!cond.metric || typeof cond.metric !== 'string') {
    return Response.json({ error: 'condition.metric is required' }, { status: 400 });
  }
  if (!cond.operator || !VALID_OPERATORS.includes(cond.operator as typeof VALID_OPERATORS[number])) {
    return Response.json(
      { error: `condition.operator must be one of: ${VALID_OPERATORS.join(', ')}` },
      { status: 400 },
    );
  }
  if (typeof cond.value !== 'number' || isNaN(cond.value)) {
    return Response.json({ error: 'condition.value must be a number' }, { status: 400 });
  }

  if (!Array.isArray(channels) || channels.length === 0) {
    return Response.json({ error: 'channels must be a non-empty array' }, { status: 400 });
  }
  for (const ch of channels) {
    if (!VALID_CHANNELS.includes(ch as AlertChannel)) {
      return Response.json(
        { error: `Invalid channel: ${ch}. Must be one of: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 },
      );
    }
  }

  if (!severity || !VALID_SEVERITIES.includes(severity as AlertSeverity)) {
    return Response.json(
      { error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` },
      { status: 400 },
    );
  }

  const rule: AlertRule = {
    id: randomUUID(),
    name: (name as string).trim(),
    condition: {
      metric: cond.metric as string,
      operator: cond.operator as AlertRule['condition']['operator'],
      value: cond.value as number,
    },
    sustained_checks: typeof sustained_checks === 'number' && sustained_checks >= 1 ? sustained_checks : 1,
    cooldown_minutes: typeof cooldown_minutes === 'number' && cooldown_minutes >= 0 ? cooldown_minutes : 15,
    channels: channels as AlertChannel[],
    severity: severity as AlertSeverity,
    enabled: body.enabled !== false,
    webhook_url: typeof body.webhook_url === 'string' ? body.webhook_url : undefined,
    telegram_chat_id: typeof body.telegram_chat_id === 'string' ? body.telegram_chat_id : undefined,
  };

  addRule(rule);

  const ip = getClientIp(request);
  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: 'alert.rule.created',
    target: rule.id,
    details: { ruleName: rule.name, severity: rule.severity },
    ipAddress: ip,
    severity: 'info',
  });

  return Response.json({ rule }, { status: 201 });
}

export const GET = withAuth(handleGet, { requiredRole: 'viewer' });
export const POST = withAuth(handlePost, { requiredRole: 'operator' });
