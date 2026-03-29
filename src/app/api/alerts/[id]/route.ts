/**
 * Single alert rule operations.
 *
 * GET    /api/alerts/:id  — Get single rule (viewer role)
 * PUT    /api/alerts/:id  — Update rule (operator role)
 * PATCH  /api/alerts/:id  — Toggle enabled (operator role)
 * DELETE /api/alerts/:id  — Delete rule (operator role)
 */
import { withAuth, type AuthContext, getClientIp } from '@/lib/auth/withAuth';
import { logAudit } from '@/lib/auth/audit';
import { getRuleById, updateRule, deleteRule } from '@/lib/alerts/storage';
import type { AlertChannel, AlertSeverity } from '@/lib/alerts/types';
import { VALID_OPERATORS, VALID_CHANNELS, VALID_SEVERITIES } from '@/lib/alerts/types';

type RouteParams = { id: string };

// ── GET: Single rule ────────────────────────────────────────────────────────

async function handleGet(
  _request: Request,
  context: { params?: RouteParams },
  _auth: AuthContext,
): Promise<Response> {
  const id = context.params?.id;
  if (!id) {
    return Response.json({ error: 'Missing rule id' }, { status: 400 });
  }

  const rule = getRuleById(id);
  if (!rule) {
    return Response.json({ error: 'Rule not found' }, { status: 404 });
  }

  return Response.json({ rule });
}

// ── PUT: Update rule ────────────────────────────────────────────────────────

async function handlePut(
  request: Request,
  context: { params?: RouteParams },
  auth: AuthContext,
): Promise<Response> {
  const id = context.params?.id;
  if (!id) {
    return Response.json({ error: 'Missing rule id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate optional fields if present
  if (body.condition !== undefined) {
    const cond = body.condition as Record<string, unknown>;
    if (typeof cond !== 'object' || cond === null) {
      return Response.json({ error: 'condition must be an object' }, { status: 400 });
    }
    if (cond.operator !== undefined && !VALID_OPERATORS.includes(cond.operator as typeof VALID_OPERATORS[number])) {
      return Response.json(
        { error: `condition.operator must be one of: ${VALID_OPERATORS.join(', ')}` },
        { status: 400 },
      );
    }
  }

  if (body.channels !== undefined) {
    if (!Array.isArray(body.channels)) {
      return Response.json({ error: 'channels must be an array' }, { status: 400 });
    }
    for (const ch of body.channels) {
      if (!VALID_CHANNELS.includes(ch as AlertChannel)) {
        return Response.json(
          { error: `Invalid channel: ${ch}. Must be one of: ${VALID_CHANNELS.join(', ')}` },
          { status: 400 },
        );
      }
    }
  }

  if (body.severity !== undefined && !VALID_SEVERITIES.includes(body.severity as AlertSeverity)) {
    return Response.json(
      { error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` },
      { status: 400 },
    );
  }

  const updated = updateRule(id, body);
  if (!updated) {
    return Response.json({ error: 'Rule not found' }, { status: 404 });
  }

  const ip = getClientIp(request);
  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: 'alert.rule.updated',
    target: id,
    details: { fields: Object.keys(body) },
    ipAddress: ip,
    severity: 'info',
  });

  return Response.json({ rule: updated });
}

// ── PATCH: Toggle enabled ───────────────────────────────────────────────────

async function handlePatch(
  request: Request,
  context: { params?: RouteParams },
  auth: AuthContext,
): Promise<Response> {
  const id = context.params?.id;
  if (!id) {
    return Response.json({ error: 'Missing rule id' }, { status: 400 });
  }

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return Response.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  const updated = updateRule(id, { enabled: body.enabled });
  if (!updated) {
    return Response.json({ error: 'Rule not found' }, { status: 404 });
  }

  const ip = getClientIp(request);
  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: body.enabled ? 'alert.rule.enabled' : 'alert.rule.disabled',
    target: id,
    details: { ruleName: updated.name, enabled: body.enabled },
    ipAddress: ip,
    severity: 'info',
  });

  return Response.json({ rule: updated });
}

// ── DELETE: Remove rule ─────────────────────────────────────────────────────

async function handleDelete(
  request: Request,
  context: { params?: RouteParams },
  auth: AuthContext,
): Promise<Response> {
  const id = context.params?.id;
  if (!id) {
    return Response.json({ error: 'Missing rule id' }, { status: 400 });
  }

  const existing = getRuleById(id);
  const deleted = deleteRule(id);
  if (!deleted) {
    return Response.json({ error: 'Rule not found' }, { status: 404 });
  }

  const ip = getClientIp(request);
  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: 'alert.rule.deleted',
    target: id,
    details: { ruleName: existing?.name ?? id },
    ipAddress: ip,
    severity: 'info',
  });

  return Response.json({ success: true });
}

export const GET = withAuth<RouteParams>(handleGet, { requiredRole: 'viewer' });
export const PUT = withAuth<RouteParams>(handlePut, { requiredRole: 'operator' });
export const PATCH = withAuth<RouteParams>(handlePatch, { requiredRole: 'operator' });
export const DELETE = withAuth<RouteParams>(handleDelete, { requiredRole: 'operator' });
