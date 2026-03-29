/**
 * GET /api/auth/me
 *
 * Return the current user's context.
 * Used by the client-side useAuth hook.
 *
 * Requires authentication (any role).
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getDb } from '@/lib/auth/db';

export const GET = withAuth(async (_request, _context, auth) => {
  const db = getDb();

  // Fetch additional user details (totp_enabled)
  const user = db
    .prepare('SELECT totp_enabled FROM users WHERE id = ?')
    .get(auth.userId) as { totp_enabled: number } | undefined;

  return NextResponse.json({
    userId: auth.userId,
    username: auth.username,
    role: auth.role,
    totpEnabled: user ? !!user.totp_enabled : false,
  });
});
