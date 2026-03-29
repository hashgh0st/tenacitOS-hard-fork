/**
 * Route handler auth wrapper — runs in Node.js runtime (not Edge).
 *
 * Validates the session token from the tenacitos_session cookie against
 * auth.db using better-sqlite3. Returns 401/403 JSON on failure,
 * or calls the handler with an AuthContext on success.
 */
import type { NextRequest } from 'next/server';
import { validateSession } from '@/lib/auth/session';
import { hasPermission, isValidRole, type Role } from '@/lib/auth/roles';
import { logAudit } from '@/lib/auth/audit';

export type AuthContext = {
  userId: string;
  username: string;
  role: Role;
};

type RouteParams = Record<string, string>;

type RouteContext<TParams extends RouteParams = RouteParams> = {
  params?: Promise<TParams> | TParams;
};

type ResolvedRouteContext<TParams extends RouteParams = RouteParams> = {
  params?: TParams;
};

type AuthenticatedHandler<TParams extends RouteParams = RouteParams> = (
  request: Request,
  context: ResolvedRouteContext<TParams>,
  auth: AuthContext,
) => Response | Promise<Response>;

interface WithAuthOptions {
  requiredRole?: Role;
}

export function getClientIp(request: Request): string {
  const headers = new Headers(request.headers);
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');
    if (name === 'tenacitos_session') {
      return valueParts.join('=') || null;
    }
  }
  return null;
}

/**
 * Wrap a route handler with session validation and optional role checking.
 *
 * Usage:
 *   export const GET = withAuth(async (request, context, auth) => {
 *     return Response.json({ user: auth.username });
 *   }, { requiredRole: 'admin' });
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options?: WithAuthOptions,
): (request: NextRequest, context: RouteContext) => Promise<Response>;
export function withAuth<TParams extends RouteParams>(
  handler: AuthenticatedHandler<TParams>,
  options?: WithAuthOptions,
): (request: NextRequest, context: RouteContext<TParams>) => Promise<Response>;
export function withAuth<TParams extends RouteParams>(
  handler: AuthenticatedHandler<TParams>,
  options?: WithAuthOptions,
): (request: NextRequest, context: RouteContext<TParams>) => Promise<Response> {
  return async (request: NextRequest, context: RouteContext<TParams>) => {
    const ip = getClientIp(request);

    const token = getSessionToken(request);
    if (!token) {
      logAudit({
        username: 'anonymous',
        action: 'auth.rejected',
        details: { reason: 'no_session_cookie' },
        ipAddress: ip,
        severity: 'warning',
      });

      return Response.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const session = validateSession(token);
    if (!session) {
      logAudit({
        username: 'anonymous',
        action: 'auth.rejected',
        details: { reason: 'invalid_or_expired_session' },
        ipAddress: ip,
        severity: 'warning',
      });

      return Response.json(
        { error: 'Unauthorized', message: 'Invalid or expired session' },
        { status: 401 },
      );
    }

    if (!isValidRole(session.role)) {
      logAudit({
        username: session.username,
        action: 'auth.rejected',
        details: { reason: 'invalid_session_role', role: session.role },
        ipAddress: ip,
        severity: 'critical',
      });

      return Response.json(
        { error: 'Unauthorized', message: 'Invalid session role' },
        { status: 401 },
      );
    }

    const auth: AuthContext = {
      userId: session.userId,
      username: session.username,
      role: session.role,
    };
    if (options?.requiredRole && !hasPermission(auth.role, options.requiredRole)) {
      logAudit({
        userId: auth.userId,
        username: auth.username,
        action: 'auth.forbidden',
        details: {
          reason: 'insufficient_role',
          userRole: auth.role,
          requiredRole: options.requiredRole,
        },
        ipAddress: ip,
        severity: 'warning',
      });

      return Response.json(
        { error: 'Forbidden', message: 'Insufficient permissions' },
        { status: 403 },
      );
    }

    const params = context?.params ? await context.params : undefined;
    return handler(request, { params }, auth);
  };
}
