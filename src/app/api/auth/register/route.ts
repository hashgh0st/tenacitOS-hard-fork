/**
 * POST /api/auth/register
 *
 * Register a new user via an invitation token.
 * Body: { token, username, password }
 *
 * Validates the invitation (not expired, not used), creates the user
 * with the invitation's role, and marks the invitation as consumed.
 */
import { NextResponse } from 'next/server';
import { getDb, initAuthDb } from '@/lib/auth/db';
import { hashPassword } from '@/lib/auth/password';
import { logAudit } from '@/lib/auth/audit';
import { isValidRole } from '@/lib/auth/roles';
import { createHash } from 'crypto';

const MIN_PASSWORD_LENGTH = 16;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

export async function POST(request: Request) {
  let body: { token?: string; username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { token, username, password } = body;

  if (!token || !username || !password) {
    return NextResponse.json(
      { success: false, error: 'Token, username, and password are required' },
      { status: 400 },
    );
  }

  // Validate username format
  if (!USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Username must be 3-32 characters, alphanumeric, hyphens, or underscores',
      },
      { status: 400 },
    );
  }

  // Validate password length
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const db = getDb();
  initAuthDb(db);

  // Hash the invitation token to look it up in the database
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Look up the invitation
  const invitation = db
    .prepare(
      `SELECT id, role, expires_at, used_at FROM invitations WHERE token_hash = ?`,
    )
    .get(tokenHash) as
    | { id: string; role: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!invitation) {
    return NextResponse.json(
      { success: false, error: 'Invalid invitation token' },
      { status: 400 },
    );
  }

  if (invitation.used_at) {
    return NextResponse.json(
      { success: false, error: 'This invitation has already been used' },
      { status: 400 },
    );
  }

  // Handle both ISO strings (with Z) and SQLite datetime strings (without Z, always UTC)
  const expiresAtStr = invitation.expires_at.endsWith('Z')
    ? invitation.expires_at
    : invitation.expires_at + 'Z';
  const expiresAt = new Date(expiresAtStr);
  if (expiresAt <= new Date()) {
    return NextResponse.json(
      { success: false, error: 'This invitation has expired' },
      { status: 400 },
    );
  }

  if (!isValidRole(invitation.role)) {
    return NextResponse.json(
      { success: false, error: 'Invalid role in invitation' },
      { status: 400 },
    );
  }

  // Check if username is already taken
  const existingUser = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(username) as { id: string } | undefined;

  if (existingUser) {
    return NextResponse.json(
      { success: false, error: 'Username is already taken' },
      { status: 409 },
    );
  }

  // Hash password and create user
  const passwordHash = await hashPassword(password);

  const createUserAndConsumeInvite = db.transaction(() => {
    const userId = db
      .prepare(
        `INSERT INTO users (username, password_hash, role)
         VALUES (?, ?, ?)
         RETURNING id`,
      )
      .get(username, passwordHash, invitation.role) as { id: string };

    // Mark invitation as used
    db.prepare(
      `UPDATE invitations SET used_at = datetime('now'), used_by = ? WHERE id = ?`,
    ).run(userId.id, invitation.id);

    return userId.id;
  });

  const userId = createUserAndConsumeInvite();

  logAudit({
    userId,
    username: username,
    action: 'user.registered',
    details: { role: invitation.role, invitationId: invitation.id },
  });

  return NextResponse.json({
    success: true,
    user: { username, role: invitation.role },
  });
}
