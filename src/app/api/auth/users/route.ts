/**
 * User management API routes.
 *
 * GET  /api/auth/users          — List all users (admin only)
 * PATCH /api/auth/users         — Update user role or active status (admin only)
 *   Body: { userId, role?, isActive? }
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getDb, initAuthDb } from '@/lib/auth/db';
import { isValidRole } from '@/lib/auth/roles';
import { logAudit } from '@/lib/auth/audit';

export const GET = withAuth(
  async () => {
    const db = getDb();
    initAuthDb(db);

    const users = db
      .prepare(
        `SELECT id, username, role, totp_enabled, created_at, last_login, is_active
         FROM users
         ORDER BY created_at ASC`,
      )
      .all() as Array<{
      id: string;
      username: string;
      role: string;
      totp_enabled: number;
      created_at: string;
      last_login: string | null;
      is_active: number;
    }>;

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        totpEnabled: !!u.totp_enabled,
        createdAt: u.created_at,
        lastLogin: u.last_login,
        isActive: !!u.is_active,
      })),
    });
  },
  { requiredRole: 'admin' },
);

export const PATCH = withAuth(
  async (request, _context, auth) => {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    let body: { userId?: string; role?: string; isActive?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const { userId, role, isActive } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 },
      );
    }

    const db = getDb();
    initAuthDb(db);

    // Look up the target user
    const targetUser = db
      .prepare('SELECT id, username, role FROM users WHERE id = ?')
      .get(userId) as { id: string; username: string; role: string } | undefined;

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      );
    }

    // Prevent admin from deactivating themselves
    if (isActive === false && userId === auth.userId) {
      return NextResponse.json(
        { success: false, error: 'You cannot deactivate your own account' },
        { status: 400 },
      );
    }

    // Update role if provided
    if (role !== undefined) {
      if (!isValidRole(role)) {
        return NextResponse.json(
          { success: false, error: 'Invalid role. Must be admin, operator, or viewer' },
          { status: 400 },
        );
      }

      db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(
        role,
        userId,
      );

      logAudit({
        userId: auth.userId,
        username: auth.username,
        action: 'user.role_changed',
        target: targetUser.username,
        details: { from: targetUser.role, to: role },
        ipAddress: ip,
      });
    }

    // Update active status if provided
    if (isActive !== undefined) {
      db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(
        isActive ? 1 : 0,
        userId,
      );

      logAudit({
        userId: auth.userId,
        username: auth.username,
        action: isActive ? 'user.activated' : 'user.deactivated',
        target: targetUser.username,
        ipAddress: ip,
      });
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: 'admin' },
);
