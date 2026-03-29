/**
 * POST /api/auth/setup
 *
 * First-run setup: create the initial admin account.
 * Body: { username, password }
 *
 * Only works when no users exist (needsSetup() === true).
 * After creating the admin, logs the user in (sets session cookie).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb, initAuthDb, needsSetup } from '@/lib/auth/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { logAudit } from '@/lib/auth/audit';

const MIN_PASSWORD_LENGTH = 16;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const db = getDb();
  initAuthDb(db);

  // Only allow if no users exist
  if (!needsSetup(db)) {
    return NextResponse.json(
      { success: false, error: 'Setup has already been completed' },
      { status: 403 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: 'Username and password are required' },
      { status: 400 },
    );
  }

  if (!USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Username must be 3-32 characters, alphanumeric, hyphens, or underscores',
      },
      { status: 400 },
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  const userId = db
    .prepare(
      `INSERT INTO users (username, password_hash, role)
       VALUES (?, ?, 'admin')
       RETURNING id`,
    )
    .get(username, passwordHash) as { id: string };

  logAudit({
    userId: userId.id,
    username,
    action: 'setup.admin_created',
    ipAddress: ip,
  });

  // Create a session so the user can proceed to TOTP setup
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const session = createSession(userId.id, ip, userAgent);

  const response = NextResponse.json({
    success: true,
    user: { username, role: 'admin' },
  });

  response.cookies.set('tenacitos_session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60,
    path: '/',
  });

  return response;
}
