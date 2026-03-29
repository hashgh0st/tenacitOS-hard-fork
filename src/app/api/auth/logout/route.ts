/**
 * POST /api/auth/logout
 *
 * Delete the session from the database and clear the cookie.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deleteSession } from '@/lib/auth/session';
import { logAudit } from '@/lib/auth/audit';
import { validateSession } from '@/lib/auth/session';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const sessionToken = request.cookies.get('tenacitos_session')?.value;

  if (sessionToken) {
    // Try to identify who is logging out for the audit log
    const session = validateSession(sessionToken);

    // Delete the session from the database
    deleteSession(sessionToken);

    logAudit({
      userId: session?.userId,
      username: session?.username ?? 'unknown',
      action: 'logout',
      ipAddress: ip,
    });
  }

  const response = NextResponse.json({ success: true });

  // Clear the session cookie
  response.cookies.set('tenacitos_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
}
