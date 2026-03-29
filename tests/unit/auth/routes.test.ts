/**
 * Tests for auth API routes
 *
 * Tests login, logout, register, invite, and me endpoints.
 * Uses in-memory SQLite and mocks getDb to isolate from filesystem.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initAuthDb } from '@/lib/auth/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { createHash, randomBytes } from 'crypto';

let testDb: Database.Database;

vi.mock('@/lib/auth/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/db')>('@/lib/auth/db');
  return {
    ...actual,
    getDb: () => testDb,
  };
});

const TEST_PASSWORD = 'this-is-a-very-secure-password-16chars';
const TEST_USER_ID = 'user-route-001';
const TEST_IP = '127.0.0.1';
const TEST_UA = 'TestAgent/1.0';

describe('Auth API routes', () => {
  beforeEach(async () => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initAuthDb(testDb);

    // Create a test admin user
    const hash = await hashPassword(TEST_PASSWORD);
    testDb.prepare(
      "INSERT INTO users (id, username, password_hash, role) VALUES (?, 'testadmin', ?, 'admin')",
    ).run(TEST_USER_ID, hash);
  });

  afterEach(() => {
    testDb.close();
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('returns success with valid credentials', async () => {
      const { POST } = await import('@/app/api/auth/login/route');

      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'testadmin', password: TEST_PASSWORD }),
      });

      // NextRequest needs to be created for this route handler
      const { NextRequest } = await import('next/server');
      const nextReq = new NextRequest(request);

      const response = await POST(nextReq);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.user.username).toBe('testadmin');
      expect(body.user.role).toBe('admin');

      // Should set session cookie
      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('tenacitos_session=');
      expect(setCookie).toContain('HttpOnly');
    });

    it('returns 401 with wrong password', async () => {
      const { POST } = await import('@/app/api/auth/login/route');
      const { NextRequest } = await import('next/server');

      const request = new NextRequest(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'testadmin', password: 'wrong-password-here!!' }),
        }),
      );

      const response = await POST(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it('returns 401 for nonexistent user', async () => {
      const { POST } = await import('@/app/api/auth/login/route');
      const { NextRequest } = await import('next/server');

      const request = new NextRequest(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'nobody', password: TEST_PASSWORD }),
        }),
      );

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('returns 400 when missing fields', async () => {
      const { POST } = await import('@/app/api/auth/login/route');
      const { NextRequest } = await import('next/server');

      const request = new NextRequest(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'testadmin' }),
        }),
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('logs successful login to audit', async () => {
      const { POST } = await import('@/app/api/auth/login/route');
      const { NextRequest } = await import('next/server');

      const request = new NextRequest(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'testadmin', password: TEST_PASSWORD }),
        }),
      );

      await POST(request);

      const logs = testDb.prepare("SELECT * FROM audit_log WHERE action = 'login.success'").all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('logs failed login to audit', async () => {
      const { POST } = await import('@/app/api/auth/login/route');
      const { NextRequest } = await import('next/server');

      const request = new NextRequest(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'testadmin', password: 'wrong-password-here!!' }),
        }),
      );

      await POST(request);

      const logs = testDb.prepare("SELECT * FROM audit_log WHERE action = 'login.failed'").all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie and deletes session from DB', async () => {
      const { POST } = await import('@/app/api/auth/logout/route');
      const { NextRequest } = await import('next/server');

      // Create a session first
      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

      // Verify session exists
      const countBefore = (
        testDb.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }
      ).c;
      expect(countBefore).toBe(1);

      const request = new NextRequest(
        new Request('http://localhost/api/auth/logout', { method: 'POST' }),
      );
      request.cookies.set('tenacitos_session', token);

      const response = await POST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);

      // Session should be deleted from DB
      const countAfter = (
        testDb.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }
      ).c;
      expect(countAfter).toBe(0);

      // Cookie should be cleared
      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('tenacitos_session=');
      expect(setCookie).toContain('Max-Age=0');
    });

    it('logs logout to audit', async () => {
      const { POST } = await import('@/app/api/auth/logout/route');
      const { NextRequest } = await import('next/server');

      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

      const request = new NextRequest(
        new Request('http://localhost/api/auth/logout', { method: 'POST' }),
      );
      request.cookies.set('tenacitos_session', token);

      await POST(request);

      const logs = testDb.prepare("SELECT * FROM audit_log WHERE action = 'logout'").all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/auth/register', () => {
    it('creates a user with a valid invitation token', async () => {
      const { POST } = await import('@/app/api/auth/register/route');

      // Create an invitation
      const inviteToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      testDb.prepare(
        'INSERT INTO invitations (token_hash, role, created_by, expires_at) VALUES (?, ?, ?, ?)',
      ).run(tokenHash, 'operator', TEST_USER_ID, expiresAt.toISOString());

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          username: 'newoperator',
          password: 'a-very-long-password-here',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.user.username).toBe('newoperator');
      expect(body.user.role).toBe('operator');

      // User should exist in DB
      const user = testDb.prepare("SELECT role FROM users WHERE username = 'newoperator'").get() as {
        role: string;
      };
      expect(user.role).toBe('operator');

      // Invitation should be marked as used
      const invite = testDb.prepare('SELECT used_at FROM invitations WHERE token_hash = ?').get(tokenHash) as {
        used_at: string | null;
      };
      expect(invite.used_at).not.toBeNull();
    });

    it('rejects short passwords (< 16 chars)', async () => {
      const { POST } = await import('@/app/api/auth/register/route');

      const inviteToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      testDb.prepare(
        'INSERT INTO invitations (token_hash, role, created_by, expires_at) VALUES (?, ?, ?, ?)',
      ).run(tokenHash, 'viewer', TEST_USER_ID, expiresAt.toISOString());

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          username: 'shortpw',
          password: 'tooshort',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('16 characters');
    });

    it('rejects invalid invitation token', async () => {
      const { POST } = await import('@/app/api/auth/register/route');

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: 'fake-token',
          username: 'baduser',
          password: 'a-very-long-password-here',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('Invalid invitation');
    });

    it('rejects expired invitation', async () => {
      const { POST } = await import('@/app/api/auth/register/route');

      const inviteToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
      const expiredAt = new Date(Date.now() - 60 * 1000); // expired 1 minute ago

      testDb.prepare(
        'INSERT INTO invitations (token_hash, role, created_by, expires_at) VALUES (?, ?, ?, ?)',
      ).run(tokenHash, 'viewer', TEST_USER_ID, expiredAt.toISOString());

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          username: 'expired_invite_user',
          password: 'a-very-long-password-here',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('expired');
    });

    it('rejects already-used invitation', async () => {
      const { POST } = await import('@/app/api/auth/register/route');

      const inviteToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      testDb.prepare(
        "INSERT INTO invitations (token_hash, role, created_by, expires_at, used_at) VALUES (?, ?, ?, ?, datetime('now'))",
      ).run(tokenHash, 'viewer', TEST_USER_ID, expiresAt.toISOString());

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          username: 'used_invite_user',
          password: 'a-very-long-password-here',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('already been used');
    });

    it('rejects duplicate username', async () => {
      const { POST } = await import('@/app/api/auth/register/route');

      const inviteToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      testDb.prepare(
        'INSERT INTO invitations (token_hash, role, created_by, expires_at) VALUES (?, ?, ?, ?)',
      ).run(tokenHash, 'viewer', TEST_USER_ID, expiresAt.toISOString());

      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          username: 'testadmin', // already exists
          password: 'a-very-long-password-here',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(409);

      const body = await response.json();
      expect(body.error).toContain('already taken');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user context for valid session', async () => {
      const { GET } = await import('@/app/api/auth/me/route');

      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

      const request = new Request('http://localhost/api/auth/me', {
        headers: { cookie: `tenacitos_session=${token}` },
      });

      const response = await GET(request, { params: {} });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.userId).toBe(TEST_USER_ID);
      expect(body.username).toBe('testadmin');
      expect(body.role).toBe('admin');
      expect(body.totpEnabled).toBe(false);
    });

    it('returns 401 without session', async () => {
      const { GET } = await import('@/app/api/auth/me/route');

      const request = new Request('http://localhost/api/auth/me');

      const response = await GET(request, { params: {} });
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/invite', () => {
    it('creates invitation with valid admin session', async () => {
      const { POST } = await import('@/app/api/auth/invite/route');

      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

      const request = new Request('http://localhost/api/auth/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `tenacitos_session=${token}`,
        },
        body: JSON.stringify({ role: 'operator' }),
      });

      const response = await POST(request, { params: {} });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
      expect(body.token.length).toBe(64); // 32 bytes hex
      expect(body.expiresAt).toBeDefined();

      // Invitation should be stored in DB (as hash, not plaintext)
      const invitations = testDb.prepare('SELECT * FROM invitations').all() as {
        token_hash: string;
        role: string;
      }[];
      expect(invitations.length).toBe(1);
      expect(invitations[0].role).toBe('operator');
      // Stored hash should not equal the plaintext token
      expect(invitations[0].token_hash).not.toBe(body.token);
    });

    it('rejects non-admin users', async () => {
      // Create a viewer user
      const viewerHash = await hashPassword(TEST_PASSWORD);
      testDb.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('viewer-001', 'viewer', ?, 'viewer')",
      ).run(viewerHash);

      const { token } = createSession('viewer-001', TEST_IP, TEST_UA, false, testDb);

      const { POST } = await import('@/app/api/auth/invite/route');

      const request = new Request('http://localhost/api/auth/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `tenacitos_session=${token}`,
        },
        body: JSON.stringify({ role: 'viewer' }),
      });

      const response = await POST(request, { params: {} });
      expect(response.status).toBe(403);
    });

    it('rejects invalid role', async () => {
      const { POST } = await import('@/app/api/auth/invite/route');

      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, testDb);

      const request = new Request('http://localhost/api/auth/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `tenacitos_session=${token}`,
        },
        body: JSON.stringify({ role: 'superadmin' }),
      });

      const response = await POST(request, { params: {} });
      expect(response.status).toBe(400);
    });
  });
});
