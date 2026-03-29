/**
 * POST /api/auth/invite/validate
 *
 * Validate an invitation token without consuming it.
 * Body: { token }
 *
 * Returns { valid: true, role } if the token is valid and unused,
 * or { valid: false, error } otherwise.
 *
 * Public endpoint — no auth required (the registering user has no account yet).
 */
import { NextResponse } from 'next/server';
import { getDb, initAuthDb } from '@/lib/auth/db';
import { createHash } from 'crypto';

export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { token } = body;

  if (!token) {
    return NextResponse.json(
      { valid: false, error: 'Token is required' },
      { status: 400 },
    );
  }

  const db = getDb();
  initAuthDb(db);

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const invitation = db
    .prepare(
      `SELECT id, role, expires_at, used_at FROM invitations WHERE token_hash = ?`,
    )
    .get(tokenHash) as
    | { id: string; role: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!invitation) {
    return NextResponse.json(
      { valid: false, error: 'Invalid invitation token' },
      { status: 400 },
    );
  }

  if (invitation.used_at) {
    return NextResponse.json(
      { valid: false, error: 'This invitation has already been used' },
      { status: 400 },
    );
  }

  // Handle both ISO strings and SQLite datetime strings
  const expiresAtStr = invitation.expires_at.endsWith('Z')
    ? invitation.expires_at
    : invitation.expires_at + 'Z';
  const expiresAt = new Date(expiresAtStr);
  if (expiresAt <= new Date()) {
    return NextResponse.json(
      { valid: false, error: 'This invitation has expired' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    valid: true,
    role: invitation.role,
  });
}
