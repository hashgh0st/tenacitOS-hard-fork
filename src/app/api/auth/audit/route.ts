/**
 * GET /api/auth/audit
 *
 * Query audit log entries with filtering and pagination.
 * Admin only.
 *
 * Query params:
 *   page     — Page number (default 1)
 *   limit    — Items per page (default 50, max 100)
 *   action   — Filter by action type (exact match)
 *   username — Filter by username (exact match)
 *   severity — Filter by severity (info, warning, critical)
 *   from     — Start date (ISO 8601)
 *   to       — End date (ISO 8601)
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getDb, initAuthDb } from '@/lib/auth/db';

export const GET = withAuth(
  async (request) => {
    const db = getDb();
    initAuthDb(db);

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const action = url.searchParams.get('action');
    const username = url.searchParams.get('username');
    const severity = url.searchParams.get('severity');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    // Build WHERE clause dynamically
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (username) {
      conditions.push('username = ?');
      params.push(username);
    }
    if (severity) {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (from) {
      conditions.push('timestamp >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('timestamp <= ?');
      params.push(to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`)
      .get(...params) as { count: number };

    // Get paginated entries
    const entries = db
      .prepare(
        `SELECT id, timestamp, user_id, username, action, target, details, ip_address, severity
         FROM audit_log
         ${whereClause}
         ORDER BY timestamp DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<{
      id: number;
      timestamp: string;
      user_id: string | null;
      username: string;
      action: string;
      target: string | null;
      details: string | null;
      ip_address: string | null;
      severity: string;
    }>;

    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        userId: e.user_id,
        username: e.username,
        action: e.action,
        target: e.target,
        details: e.details ? JSON.parse(e.details) : null,
        ipAddress: e.ip_address,
        severity: e.severity,
      })),
      pagination: {
        page,
        limit,
        total: countRow.count,
        totalPages: Math.ceil(countRow.count / limit),
      },
    });
  },
  { requiredRole: 'admin' },
);
