/**
 * Auth database schema + initialization
 * SQLite via better-sqlite3 with WAL mode
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'auth.db');

let _db: Database.Database | null = null;

/**
 * Returns singleton better-sqlite3 instance for data/auth.db.
 * Optionally accepts a pre-configured database (for testing with :memory:).
 */
export function getDb(injectedDb?: Database.Database): Database.Database {
  if (injectedDb) return injectedDb;
  if (_db) return _db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  return _db;
}

// SQL schema for all auth tables
const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_login TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_remember_me INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      ip_address TEXT,
      severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical'))
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      token_hash TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_by TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      ip_address TEXT NOT NULL,
      attempted_at TEXT DEFAULT (datetime('now')),
      success INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, endpoint)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempted_at);
`;

/**
 * Creates all auth tables if they don't exist, enables WAL mode, creates indexes.
 * Uses better-sqlite3's exec method (not child_process exec) to run DDL statements.
 */
export function initAuthDb(db?: Database.Database): void {
  const d = db ?? getDb();

  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');

  // better-sqlite3 Database.prototype.exec — runs multi-statement SQL
  d.exec(SCHEMA_SQL);
}

/**
 * Returns true if no users exist in the database (first-time setup needed).
 */
export function needsSetup(db?: Database.Database): boolean {
  const d = db ?? getDb();
  const row = d.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return row.count === 0;
}

/**
 * Backward compatibility: if ADMIN_PASSWORD env var is set and no auth.db exists,
 * auto-create admin user. Must be called after initAuthDb().
 * Returns true if an admin user was created.
 */
export async function autoCreateAdmin(db?: Database.Database): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const d = db ?? getDb();
  if (!needsSetup(d)) return false;

  // Dynamic import to avoid circular dependency issues
  const { hashPassword } = await import('./password');
  const hash = await hashPassword(adminPassword);

  d.prepare(`
    INSERT INTO users (id, username, password_hash, role)
    VALUES (lower(hex(randomblob(16))), ?, ?, 'admin')
  `).run('admin', hash);

  return true;
}

/**
 * Reset the singleton for testing purposes.
 */
export function _resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
