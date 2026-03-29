/**
 * POST /api/auth/invite
 *
 * Generate an invitation link for a new user.
 * Body: { role } — the role to assign to the invited user.
 *
 * Requires admin role.
 *
 * Returns { token, expiresAt } — the caller constructs the URL.
 * The token is plaintext (returned once); only its SHA-256 hash is stored.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getDb, initAuthDb } from '@/lib/auth/db';
import { isValidRole } from '@/lib/auth/roles';
import { logAudit } from '@/lib/auth/audit';
import { randomBytes, createHash } from 'crypto';

const INVITATION_EXPIRY_DAYS = 7;

export const POST = withAuth(
  async (request, _context, auth) => {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    let body: { role?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const { role } = body;

    if (!role || !isValidRole(role)) {
      return NextResponse.json(
        { success: false, error: 'Valid role is required (admin, operator, or viewer)' },
        { status: 400 },
      );
    }

    const db = getDb();
    initAuthDb(db);

    // Generate a 32-byte random token
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    db.prepare(
      `INSERT INTO invitations (token_hash, role, created_by, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(tokenHash, role, auth.userId, expiresAt.toISOString());

    logAudit({
      userId: auth.userId,
      username: auth.username,
      action: 'invitation.created',
      details: { role, expiresAt: expiresAt.toISOString() },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
    });
  },
  { requiredRole: 'admin' },
);
