/**
 * Tests for src/lib/auth/session.ts
 * Create/validate/expire/cleanup/delete
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initAuthDb } from '@/lib/auth/db';
import {
  createSession,
  validateSession,
  deleteSession,
  deleteUserSessions,
  cleanExpiredSessions,
} from '@/lib/auth/session';

describe('auth/session', () => {
  let db: Database.Database;
  const TEST_USER_ID = 'user-001';
  const TEST_IP = '127.0.0.1';
  const TEST_UA = 'Mozilla/5.0 Test';

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initAuthDb(db);

    // Create a test user
    db.prepare(
      "INSERT INTO users (id, username, password_hash, role) VALUES (?, 'testuser', 'hash', 'admin')",
    ).run(TEST_USER_ID);
  });

  afterEach(() => {
    db.close();
  });

  describe('createSession', () => {
    it('returns a token and expiry date', () => {
      const { token, expiresAt } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // 32 bytes = 64 hex chars
      expect(token).toHaveLength(64);
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('stores session in database (hashed token, not plaintext)', () => {
      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      const sessions = db.prepare('SELECT * FROM sessions').all() as { token_hash: string }[];
      expect(sessions).toHaveLength(1);
      // The stored hash should NOT be the plaintext token
      expect(sessions[0].token_hash).not.toBe(token);
      // But should be a 64-char hex string (SHA-256)
      expect(sessions[0].token_hash).toHaveLength(64);
    });

    it('default TTL is approximately 8 hours', () => {
      const { expiresAt } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      const eightHoursMs = 8 * 60 * 60 * 1000;
      const diff = expiresAt.getTime() - Date.now();
      // Allow 5 seconds of tolerance
      expect(diff).toBeGreaterThan(eightHoursMs - 5000);
      expect(diff).toBeLessThanOrEqual(eightHoursMs);
    });

    it('remember-me TTL is approximately 30 days', () => {
      const { expiresAt } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, true, db);

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const diff = expiresAt.getTime() - Date.now();
      expect(diff).toBeGreaterThan(thirtyDaysMs - 5000);
      expect(diff).toBeLessThanOrEqual(thirtyDaysMs);
    });

    it('stores ip_address and user_agent', () => {
      createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      const session = db.prepare('SELECT ip_address, user_agent FROM sessions').get() as {
        ip_address: string;
        user_agent: string;
      };
      expect(session.ip_address).toBe(TEST_IP);
      expect(session.user_agent).toBe(TEST_UA);
    });
  });

  describe('validateSession', () => {
    it('returns user context for a valid session', () => {
      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      const ctx = validateSession(token, db);
      expect(ctx).not.toBeNull();
      expect(ctx!.userId).toBe(TEST_USER_ID);
      expect(ctx!.username).toBe('testuser');
      expect(ctx!.role).toBe('admin');
    });

    it('returns null for an invalid token', () => {
      const ctx = validateSession('nonexistent-token', db);
      expect(ctx).toBeNull();
    });

    it('returns null for an expired session', () => {
      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      // Manually expire the session
      db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour')").run();

      const ctx = validateSession(token, db);
      expect(ctx).toBeNull();
    });

    it('returns null for an inactive user', () => {
      const { token } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      // Deactivate the user
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(TEST_USER_ID);

      const ctx = validateSession(token, db);
      expect(ctx).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('deletes a specific session by token', () => {
      const { token: token1 } = createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);
      createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      const countBefore = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
      expect(countBefore).toBe(2);

      deleteSession(token1, db);

      const countAfter = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
      expect(countAfter).toBe(1);
    });

    it('does nothing for a nonexistent token', () => {
      createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      deleteSession('nonexistent-token', db);

      const count = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
      expect(count).toBe(1);
    });
  });

  describe('deleteUserSessions', () => {
    it('deletes all sessions for a user', () => {
      createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);
      createSession(TEST_USER_ID, TEST_IP, TEST_UA, true, db);

      deleteUserSessions(TEST_USER_ID, db);

      const count = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
      expect(count).toBe(0);
    });

    it('does not affect other users sessions', () => {
      // Create another user
      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('user-002', 'otheruser', 'hash', 'viewer')",
      ).run();

      createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);
      createSession('user-002', TEST_IP, TEST_UA, false, db);

      deleteUserSessions(TEST_USER_ID, db);

      const count = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
      expect(count).toBe(1);
    });
  });

  describe('cleanExpiredSessions', () => {
    it('removes expired sessions and returns count', () => {
      // Create a session and manually expire it
      createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);
      db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour')").run();

      const deleted = cleanExpiredSessions(db);
      expect(deleted).toBe(1);

      const count = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
      expect(count).toBe(0);
    });

    it('does not remove valid sessions', () => {
      createSession(TEST_USER_ID, TEST_IP, TEST_UA, false, db);

      const deleted = cleanExpiredSessions(db);
      expect(deleted).toBe(0);

      const count = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
      expect(count).toBe(1);
    });

    it('returns 0 when no sessions exist', () => {
      const deleted = cleanExpiredSessions(db);
      expect(deleted).toBe(0);
    });
  });
});
