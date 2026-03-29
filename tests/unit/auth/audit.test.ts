/**
 * Tests for src/lib/auth/audit.ts
 * Log entry creation, cleanup
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initAuthDb } from '@/lib/auth/db';
import { logAudit, cleanOldAuditEntries } from '@/lib/auth/audit';

describe('auth/audit', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initAuthDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('logAudit', () => {
    it('creates an audit log entry with required fields', () => {
      logAudit(
        {
          username: 'admin',
          action: 'login',
        },
        db,
      );

      const rows = db.prepare('SELECT * FROM audit_log').all() as {
        username: string;
        action: string;
        severity: string;
      }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].username).toBe('admin');
      expect(rows[0].action).toBe('login');
      expect(rows[0].severity).toBe('info');
    });

    it('stores all optional fields', () => {
      // Create a user so we can reference it
      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES ('u1', 'admin', 'hash', 'admin')",
      ).run();

      logAudit(
        {
          userId: 'u1',
          username: 'admin',
          action: 'delete_user',
          target: 'user-002',
          details: { reason: 'policy violation' },
          ipAddress: '192.168.1.100',
          severity: 'critical',
        },
        db,
      );

      const row = db.prepare('SELECT * FROM audit_log').get() as {
        user_id: string;
        username: string;
        action: string;
        target: string;
        details: string;
        ip_address: string;
        severity: string;
      };

      expect(row.user_id).toBe('u1');
      expect(row.username).toBe('admin');
      expect(row.action).toBe('delete_user');
      expect(row.target).toBe('user-002');
      expect(JSON.parse(row.details)).toEqual({ reason: 'policy violation' });
      expect(row.ip_address).toBe('192.168.1.100');
      expect(row.severity).toBe('critical');
    });

    it('stores null for omitted optional fields', () => {
      logAudit(
        {
          username: 'admin',
          action: 'login',
        },
        db,
      );

      const row = db.prepare('SELECT * FROM audit_log').get() as {
        user_id: string | null;
        target: string | null;
        details: string | null;
        ip_address: string | null;
      };

      expect(row.user_id).toBeNull();
      expect(row.target).toBeNull();
      expect(row.details).toBeNull();
      expect(row.ip_address).toBeNull();
    });

    it('auto-generates timestamp', () => {
      logAudit(
        {
          username: 'admin',
          action: 'login',
        },
        db,
      );

      const row = db.prepare('SELECT timestamp FROM audit_log').get() as { timestamp: string };
      expect(row.timestamp).toBeDefined();
      // Should be a parseable date string
      expect(new Date(row.timestamp).getTime()).not.toBeNaN();
    });

    it('auto-increments id', () => {
      logAudit({ username: 'admin', action: 'login' }, db);
      logAudit({ username: 'admin', action: 'logout' }, db);

      const rows = db.prepare('SELECT id FROM audit_log ORDER BY id').all() as { id: number }[];
      expect(rows[0].id).toBe(1);
      expect(rows[1].id).toBe(2);
    });

    it('supports all severity levels', () => {
      logAudit({ username: 'admin', action: 'test', severity: 'info' }, db);
      logAudit({ username: 'admin', action: 'test', severity: 'warning' }, db);
      logAudit({ username: 'admin', action: 'test', severity: 'critical' }, db);

      const rows = db.prepare('SELECT severity FROM audit_log ORDER BY id').all() as { severity: string }[];
      expect(rows.map((r) => r.severity)).toEqual(['info', 'warning', 'critical']);
    });
  });

  describe('cleanOldAuditEntries', () => {
    it('deletes entries older than retention period (default 90 days)', () => {
      // Insert an old entry directly
      db.prepare(
        "INSERT INTO audit_log (timestamp, username, action) VALUES (datetime('now', '-100 days'), 'admin', 'old-action')",
      ).run();
      // Insert a recent entry
      logAudit({ username: 'admin', action: 'recent-action' }, db);

      const deleted = cleanOldAuditEntries(db);
      expect(deleted).toBe(1);

      const remaining = db.prepare('SELECT * FROM audit_log').all();
      expect(remaining).toHaveLength(1);
    });

    it('does not delete entries within retention period', () => {
      logAudit({ username: 'admin', action: 'recent-action' }, db);

      const deleted = cleanOldAuditEntries(db);
      expect(deleted).toBe(0);
    });

    it('respects AUDIT_RETENTION_DAYS env var', () => {
      // Insert an entry 10 days old
      db.prepare(
        "INSERT INTO audit_log (timestamp, username, action) VALUES (datetime('now', '-10 days'), 'admin', 'action')",
      ).run();

      // With default 90 days, this should NOT be deleted
      let deleted = cleanOldAuditEntries(db);
      expect(deleted).toBe(0);

      // With 5 day retention, this SHOULD be deleted
      process.env.AUDIT_RETENTION_DAYS = '5';
      deleted = cleanOldAuditEntries(db);
      expect(deleted).toBe(1);

      delete process.env.AUDIT_RETENTION_DAYS;
    });

    it('returns 0 when no entries exist', () => {
      const deleted = cleanOldAuditEntries(db);
      expect(deleted).toBe(0);
    });
  });
});
