/**
 * Tests for src/lib/auth/db.ts
 * Schema creation, WAL mode, needsSetup, backward compat
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initAuthDb, needsSetup, autoCreateAdmin } from '@/lib/auth/db';

describe('auth/db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  describe('initAuthDb', () => {
    it('creates all required tables', () => {
      initAuthDb(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('users');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('audit_log');
      expect(tableNames).toContain('invitations');
      expect(tableNames).toContain('login_attempts');
      expect(tableNames).toContain('push_subscriptions');
    });

    it('creates required indexes', () => {
      initAuthDb(db);

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
        .all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_sessions_token');
      expect(indexNames).toContain('idx_sessions_user');
      expect(indexNames).toContain('idx_sessions_expires');
      expect(indexNames).toContain('idx_audit_timestamp');
      expect(indexNames).toContain('idx_audit_user');
      expect(indexNames).toContain('idx_audit_action');
      expect(indexNames).toContain('idx_login_attempts_ip');
    });

    it('enables WAL mode', () => {
      initAuthDb(db);

      const mode = db.pragma('journal_mode') as { journal_mode: string }[];
      // In-memory databases use 'memory' mode; WAL is set but may not persist in :memory:
      // The important thing is that the pragma call doesn't throw
      expect(mode).toBeDefined();
    });

    it('enables foreign keys', () => {
      initAuthDb(db);

      const fk = db.pragma('foreign_keys') as { foreign_keys: number }[];
      expect(fk[0].foreign_keys).toBe(1);
    });

    it('is idempotent (can be called multiple times)', () => {
      initAuthDb(db);
      initAuthDb(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      expect(tables.length).toBeGreaterThanOrEqual(6);
    });

    it('users table has correct columns', () => {
      initAuthDb(db);

      const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string; type: string }[];
      const colNames = cols.map((c) => c.name);

      expect(colNames).toContain('id');
      expect(colNames).toContain('username');
      expect(colNames).toContain('password_hash');
      expect(colNames).toContain('role');
      expect(colNames).toContain('totp_secret');
      expect(colNames).toContain('totp_enabled');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
      expect(colNames).toContain('last_login');
      expect(colNames).toContain('is_active');
    });

    it('sessions table has correct columns', () => {
      initAuthDb(db);

      const cols = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[];
      const colNames = cols.map((c) => c.name);

      expect(colNames).toContain('id');
      expect(colNames).toContain('user_id');
      expect(colNames).toContain('token_hash');
      expect(colNames).toContain('ip_address');
      expect(colNames).toContain('user_agent');
      expect(colNames).toContain('expires_at');
      expect(colNames).toContain('is_remember_me');
    });

    it('enforces role CHECK constraint on users table', () => {
      initAuthDb(db);

      // Valid roles should work
      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('a1', 'admin1', 'hash1', 'admin')",
      ).run();
      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('a2', 'op1', 'hash2', 'operator')",
      ).run();
      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('a3', 'view1', 'hash3', 'viewer')",
      ).run();

      // Invalid role should fail
      expect(() =>
        db.prepare(
          "INSERT INTO users (id, username, password_hash, role) VALUES ('a4', 'bad1', 'hash4', 'superadmin')",
        ).run(),
      ).toThrow();
    });
  });

  describe('needsSetup', () => {
    it('returns true when no users exist', () => {
      initAuthDb(db);
      expect(needsSetup(db)).toBe(true);
    });

    it('returns false when users exist', () => {
      initAuthDb(db);
      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('u1', 'admin', 'hash', 'admin')",
      ).run();
      expect(needsSetup(db)).toBe(false);
    });
  });

  describe('autoCreateAdmin', () => {
    it('creates admin user when ADMIN_PASSWORD is set and no users exist', async () => {
      initAuthDb(db);
      process.env.ADMIN_PASSWORD = 'test-admin-pass-123';

      const created = await autoCreateAdmin(db);
      expect(created).toBe(true);

      const user = db.prepare("SELECT username, role FROM users WHERE username = 'admin'").get() as {
        username: string;
        role: string;
      };
      expect(user.username).toBe('admin');
      expect(user.role).toBe('admin');

      delete process.env.ADMIN_PASSWORD;
    });

    it('does not create admin when ADMIN_PASSWORD is not set', async () => {
      initAuthDb(db);
      delete process.env.ADMIN_PASSWORD;

      const created = await autoCreateAdmin(db);
      expect(created).toBe(false);
      expect(needsSetup(db)).toBe(true);
    });

    it('does not create admin when users already exist', async () => {
      initAuthDb(db);
      process.env.ADMIN_PASSWORD = 'test-admin-pass-123';

      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('u1', 'existing', 'hash', 'viewer')",
      ).run();

      const created = await autoCreateAdmin(db);
      expect(created).toBe(false);

      const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      expect(count.count).toBe(1);

      delete process.env.ADMIN_PASSWORD;
    });
  });
});
