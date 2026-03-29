/**
 * Tests for src/lib/auth/withAuth.ts
 *
 * Validates session extraction, role enforcement, and audit logging.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initAuthDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';

// Mock getDb to return our in-memory database
let testDb: Database.Database;

vi.mock('@/lib/auth/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/db')>('@/lib/auth/db');
  return {
    ...actual,
    getDb: () => testDb,
  };
});

describe('withAuth', () => {
  const TEST_USER_ID = 'user-withauth-001';
  const TEST_IP = '10.0.0.1';
  const TEST_UA = 'TestAgent/1.0';

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initAuthDb(testDb);

    // Create test users
    testDb.prepare(
      "INSERT INTO users (id, username, password_hash, role) VALUES (?, 'admin_user', 'hash', 'admin')",
    ).run(TEST_USER_ID);

    testDb.prepare(
      "INSERT INTO users (id, username, password_hash, role) VALUES ('user-viewer-001', 'viewer_user', 'hash', 'viewer')",
    ).run();
  });

  afterEach(() => {
    testDb.close();
  });

  function makeRequest(sessionToken?: string, headers?: Record<string, string>): Request {
    const h = new Headers(headers);
    if (sessionToken) {
      h.set('cookie', `tenacitos_session=${sessionToken}`);
    }
    return new Request('http://localhost/api/test', { headers: h });
  }

  it('returns 401 when no session cookie is present', async () => {
    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const response = await wrapped(makeRequest(), { params: {} });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when session token is invalid', async () => {
    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const response = await wrapped(makeRequest('invalid-token-here'), { params: {} });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.message).toContain('Invalid or expired');
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler with auth context for valid session', async () => {
    const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

    let capturedAuth: AuthContext | null = null;
    const handler = vi.fn((_req: Request, _ctx: { params?: Record<string, string> }, auth: AuthContext) => {
      capturedAuth = auth;
      return Response.json({ ok: true });
    });

    const wrapped = withAuth(handler);
    const response = await wrapped(makeRequest(token), { params: {} });

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(capturedAuth).not.toBeNull();
    expect(capturedAuth!.userId).toBe(TEST_USER_ID);
    expect(capturedAuth!.username).toBe('admin_user');
    expect(capturedAuth!.role).toBe('admin');
  });

  it('returns 403 when user role is insufficient', async () => {
    const { token } = createSession('user-viewer-001', TEST_IP, TEST_UA, false, testDb);

    const handler = vi.fn();
    const wrapped = withAuth(handler, { requiredRole: 'admin' });

    const response = await wrapped(makeRequest(token), { params: {} });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Forbidden');
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows access when user role meets required level', async () => {
    const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

    const handler = vi.fn(() => Response.json({ ok: true }));
    const wrapped = withAuth(handler, { requiredRole: 'operator' });

    const response = await wrapped(makeRequest(token), { params: {} });

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns 401 for expired session', async () => {
    const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

    // Manually expire the session
    testDb.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour')").run();

    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const response = await wrapped(makeRequest(token), { params: {} });

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('logs audit event for rejected auth (no cookie)', async () => {
    const handler = vi.fn();
    const wrapped = withAuth(handler);

    await wrapped(makeRequest(), { params: {} });

    const logs = testDb.prepare("SELECT * FROM audit_log WHERE action = 'auth.rejected'").all() as {
      action: string;
      severity: string;
    }[];
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].severity).toBe('warning');
  });

  it('logs audit event for forbidden access', async () => {
    const { token } = createSession('user-viewer-001', TEST_IP, TEST_UA, false, testDb);

    const handler = vi.fn();
    const wrapped = withAuth(handler, { requiredRole: 'admin' });

    await wrapped(makeRequest(token), { params: {} });

    const logs = testDb.prepare("SELECT * FROM audit_log WHERE action = 'auth.forbidden'").all() as {
      action: string;
      username: string;
    }[];
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].username).toBe('viewer_user');
  });

  it('handles multiple cookies correctly', async () => {
    const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

    const handler = vi.fn(() => Response.json({ ok: true }));
    const wrapped = withAuth(handler);

    const request = new Request('http://localhost/api/test', {
      headers: {
        cookie: `other_cookie=foo; tenacitos_session=${token}; another=bar`,
      },
    });

    const response = await wrapped(request, { params: {} });
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});
